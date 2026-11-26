import { ModelError } from "./errors";
import type { NetworkPort, NetResponse } from "./network";

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface ChatRequest {
	model: string;
	messages: ChatMessage[];
	/** A JSON schema for structured output, or "json". */
	format?: unknown;
	temperature?: number;
	/** Context window in tokens. */
	numCtx?: number;
	/** Turn a thinking model's reasoning phase on or off. Structured extraction does not need it and it costs minutes. */
	think?: boolean;
	timeoutMs?: number;
}

export interface ChatResult {
	content: string;
	promptTokens?: number;
	outputTokens?: number;
	totalMs?: number;
}

export interface EmbedResult {
	embeddings: number[][];
	model: string;
}

export interface InstalledModel {
	name: string;
	digest: string;
	parameterSize?: string;
}

const GENERATION_TIMEOUT_MS = 120_000;
const QUICK_TIMEOUT_MS = 10_000;

/** Endpoint typed by the author → a clean base URL, or null when it cannot be used. */
export function normalizeEndpoint(raw: string): string | null {
	const trimmed = raw.trim().replace(/\/+$/, "");
	if (!/^https?:\/\/[^\s/]+(?::\d+)?(?:\/[^\s]*)?$/i.test(trimmed)) return null;
	return trimmed;
}

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/**
 * Talks to an Ollama server through the NetworkPort. Every call is made on behalf of an explicit author action;
 * nothing here runs by itself. API shapes follow Ollama's published REST reference (see docs/AI-AND-PROMPTS.md).
 */
export class OllamaClient {
	constructor(private readonly net: NetworkPort, private readonly baseUrl: string) {}

	async version(signal?: AbortSignal): Promise<string> {
		const body = asRecord(await this.call("GET", "/api/version", undefined, QUICK_TIMEOUT_MS, signal));
		return typeof body.version === "string" ? body.version : "unknown";
	}

	async listModels(signal?: AbortSignal): Promise<InstalledModel[]> {
		const models = asRecord(await this.call("GET", "/api/tags", undefined, QUICK_TIMEOUT_MS, signal)).models;
		if (!Array.isArray(models)) throw new ModelError("bad-response", "The server's model list was not in the expected format.");
		return models.flatMap((m) => {
			const r = asRecord(m);
			const name = typeof r.name === "string" ? r.name : typeof r.model === "string" ? r.model : null;
			if (name === null) return [];
			const details = asRecord(r.details);
			return [{ name, digest: typeof r.digest === "string" ? r.digest : "", parameterSize: typeof details.parameter_size === "string" ? details.parameter_size : undefined }];
		});
	}

	async chat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResult> {
		const options: Record<string, number> = {};
		if (req.temperature !== undefined) options.temperature = req.temperature;
		if (req.numCtx !== undefined) options.num_ctx = req.numCtx;
		const body = asRecord(await this.call("POST", "/api/chat", { model: req.model, messages: req.messages, stream: false, ...(req.think === undefined ? {} : { think: req.think }), ...(req.format === undefined ? {} : { format: req.format }), options }, req.timeoutMs ?? GENERATION_TIMEOUT_MS, signal, req.model));
		const content = asRecord(body.message).content;
		if (typeof content !== "string") throw new ModelError("bad-response", "The model's answer was not in the expected format.");
		const total = typeof body.total_duration === "number" ? Math.round(body.total_duration / 1e6) : undefined;
		return {
			content,
			promptTokens: typeof body.prompt_eval_count === "number" ? body.prompt_eval_count : undefined,
			outputTokens: typeof body.eval_count === "number" ? body.eval_count : undefined,
			totalMs: total,
		};
	}

	async embed(model: string, input: string[], signal?: AbortSignal): Promise<EmbedResult> {
		const body = asRecord(await this.call("POST", "/api/embed", { model, input }, GENERATION_TIMEOUT_MS, signal, model));
		const e = body.embeddings;
		const ok = Array.isArray(e) && e.length === input.length && e.every((v) => Array.isArray(v) && v.length > 0 && v.every((n) => typeof n === "number"));
		if (!ok) throw new ModelError("bad-response", "The embedding answer was not in the expected format.");
		return { embeddings: e as number[][], model: typeof body.model === "string" ? body.model : model };
	}

	private async call(method: "GET" | "POST", path: string, payload: unknown, timeoutMs: number, signal: AbortSignal | undefined, model?: string): Promise<unknown> {
		let res: NetResponse;
		try {
			res = await this.net.request({ url: `${this.baseUrl}${path}`, method, body: payload === undefined ? undefined : JSON.stringify(payload), timeoutMs, signal });
		} catch (e) {
			throw e instanceof ModelError ? e : new ModelError("unreachable", `Could not reach the model server at ${this.baseUrl}. Check the address, that the server is running and that this device can reach it.`);
		}
		if (res.status === 403) throw new ModelError("host-rejected", "The server refused the request (403). Ollama rejects unfamiliar host names when it only listens on localhost; make it listen on your private network address.");
		if (res.status === 404 && model !== undefined) throw new ModelError("model-missing", `The server does not have the model "${model}". Install it on the server or choose another model.`);
		if (res.status < 200 || res.status >= 300) throw new ModelError("http", `The server answered with an error (${res.status}).`);
		try {
			return JSON.parse(res.text);
		} catch {
			throw new ModelError("bad-response", "The server's answer was not valid JSON. Is this really an Ollama server?");
		}
	}
}
