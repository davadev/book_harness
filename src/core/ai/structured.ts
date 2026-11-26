import type { DiagnosticsLog } from "./diagnostics";
import { ModelError } from "./errors";
import { extractJsonObject } from "./json";
import type { ChatMessage, ChatResult, OllamaClient } from "./ollama";

/** One single-purpose model task: how to ask, how to read the answer, how to check it. */
export interface StructuredTask<T> {
	id: string;
	promptVersion: string;
	messages: ChatMessage[];
	schema: unknown;
	/** Coerce whatever the model returned into the expected shape (never throws). */
	normalise(raw: unknown): T;
	/** Plain-language problems the model can act on. Empty means acceptable. */
	validate(value: T): string[];
}

export interface StructuredOptions {
	model: string;
	signal?: AbortSignal;
	diagnostics?: DiagnosticsLog;
	now: () => string;
	sleep: (ms: number) => Promise<void>;
	numCtx?: number;
}

export interface StructuredResult<T> {
	value: T;
	/** Problems that remain after at most one repair. Shown to the author, never hidden. */
	issues: string[];
}

const RETRYABLE = new Set(["unreachable", "timeout"]);
const BACKOFF_MS = [1000, 3000];

async function chatWithRetry(client: OllamaClient, opts: StructuredOptions, messages: ChatMessage[], schema: unknown, count: { n: number }): Promise<ChatResult> {
	for (let attempt = 0; ; attempt++) {
		count.n++;
		try {
			return await client.chat({ model: opts.model, messages, format: schema, temperature: 0.2, numCtx: opts.numCtx }, opts.signal);
		} catch (e) {
			const retryable = e instanceof ModelError && RETRYABLE.has(e.kind) && attempt < BACKOFF_MS.length && !opts.signal?.aborted;
			if (!retryable) throw e;
			await opts.sleep(BACKOFF_MS[attempt]);
		}
	}
}

function read<T>(task: StructuredTask<T>, text: string): { value: T; issues: string[]; parsed: boolean } {
	let raw: unknown;
	try {
		raw = extractJsonObject(text);
	} catch (e) {
		return { value: task.normalise(null), issues: [(e as Error).message], parsed: false };
	}
	const value = task.normalise(raw);
	return { value, issues: task.validate(value), parsed: true };
}

/**
 * Ask, read tolerantly, check, and make at most ONE repair call that names the specific problems. The repaired answer is
 * kept only if it is no worse. Transport failures are retried separately with a short, bounded backoff.
 */
export async function runStructured<T>(client: OllamaClient, task: StructuredTask<T>, opts: StructuredOptions): Promise<StructuredResult<T>> {
	const started = Date.now();
	const count = { n: 0 };
	let repaired = false;
	let usage: ChatResult | undefined;
	const finish = (outcome: "ok" | "ok-with-issues" | "failed", issues: string[], error?: string) =>
		opts.diagnostics?.add({ task: task.id, promptVersion: task.promptVersion, model: opts.model, startedAt: opts.now(), ms: Date.now() - started, attempts: count.n, repaired, outcome, issues, error, promptTokens: usage?.promptTokens, outputTokens: usage?.outputTokens });
	try {
		const first = await chatWithRetry(client, opts, task.messages, task.schema, count);
		usage = first;
		let best = read(task, first.content);
		if (best.issues.length > 0) {
			repaired = true;
			const fix: ChatMessage[] = [...task.messages, { role: "assistant", content: first.content }, { role: "user", content: `Your answer had these problems:\n- ${best.issues.join("\n- ")}\nReply again with corrected JSON only.` }];
			try {
				const second = read(task, (await chatWithRetry(client, opts, fix, task.schema, count)).content);
				if (second.issues.length <= best.issues.length && (second.parsed || !best.parsed)) best = second;
			} catch (e) {
				if (e instanceof ModelError && e.kind === "canceled") throw e;
				// A failed repair never loses the first answer.
			}
		}
		if (!best.parsed) throw new ModelError("bad-response", "The model did not return usable JSON. Try again or choose another model.");
		finish(best.issues.length ? "ok-with-issues" : "ok", best.issues);
		return { value: best.value, issues: best.issues };
	} catch (e) {
		finish("failed", [], (e as Error).message);
		throw e;
	}
}
