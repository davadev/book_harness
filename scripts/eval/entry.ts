// Opt-in evaluation against REAL local models. Not part of any gate and not run by CI.
// Bundled by scripts/model-eval.mjs. Results are written to docs/evals/ with model digests.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { registerBook } from "../../src/core/books";
import { addChapter, type Chapter } from "../../src/core/chapters";
import { DiagnosticsLog } from "../../src/core/ai/diagnostics";
import type { NetRequest, NetResponse, NetworkPort } from "../../src/core/ai/network";
import { OllamaClient } from "../../src/core/ai/ollama";
import { effectivePrompt } from "../../src/core/ai/prompts";
import { listAllEntities, nameKey } from "../../src/core/entities";
import { extractChapter } from "../../src/core/extraction";
import { GuardedVault } from "../../src/core/guarded-vault";
import { PROOFREAD_PROMPT, proofreadChapter } from "../../src/core/proofread";
import { proseSegments } from "../../src/core/segmentation";
import { checkConsistency } from "../../src/core/agent/consistency";
import { createEntity } from "../../src/core/entities";
import { findEvents, loadCandidates } from "../../src/core/temporal/events";
import { syncTranslation } from "../../src/core/translation/translate";
import { askBook, gatherEvidence } from "../../src/core/agent/ask";
import { BookSearch } from "../../src/core/search";
import { SUMMARY_PROMPT, summarizeChapter } from "../../src/core/summary";
import type { IndexStorePort } from "../../src/core/embeddings";
import { FakeVault, counterRandom } from "../../src/tests/__mocks__/fakeVault";

const ENDPOINT = process.env.EVAL_ENDPOINT ?? "http://localhost:11434";
const BOOK_DIR = join(process.cwd(), "fixtures/salt-ledger");
const PROOF_PARAS = Number(process.env.EVAL_PROOF_PARAS ?? 8);
const STEPS = (process.env.EVAL_STEPS ?? "summary,proofread,entities,search").split(",");

const net: NetworkPort = {
	async request(req: NetRequest): Promise<NetResponse> {
		const r = await fetch(req.url, { method: req.method, body: req.body, headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(req.timeoutMs) });
		return { status: r.status, text: await r.text() };
	},
};

const EXPECTED = {
	character: ["Nora Voss", "Aldous Brandt", "Ilse Kovar", "Pip", "Tomas Voss", "Edmund Voss", "Eleonore Voss"],
	place: ["Halvern", "Greywater Light", "Undercroft"],
	object: ["Meridian Key", "Salt Ledger"],
};

async function tags(): Promise<Map<string, string>> {
	const j = JSON.parse((await net.request({ url: `${ENDPOINT}/api/tags`, method: "GET", timeoutMs: 10_000 })).text) as { models: Array<{ name: string; digest: string }> };
	return new Map(j.models.map((m) => [m.name, m.digest.slice(0, 12)]));
}

function inject(text: string, count: number): { text: string; typos: Array<{ right: string; wrong: string }> } {
	const segs = proseSegments(text).slice(0, count);
	let out = text;
	const typos: Array<{ right: string; wrong: string }> = [];
	for (const seg of [...segs].reverse()) {
		const word = (seg.text.match(/\b[a-z]{7,}\b/g) ?? []).find((w) => !seg.text.includes(`[[${w}`));
		if (!word) continue;
		const wrong = `${word.slice(0, 3)}${word[4]}${word[3]}${word.slice(5)}`;
		const at = seg.start + seg.text.indexOf(word);
		out = out.slice(0, at) + wrong + out.slice(at + word.length);
		typos.push({ right: word, wrong });
	}
	return { text: out, typos: typos.reverse() };
}

function memoryStore(): IndexStorePort {
	const files = new Map<string, ArrayBuffer>();
	return { read: (k) => Promise.resolve(files.get(k) ?? null), write: (k, d) => (files.set(k, d), Promise.resolve()) };
}

async function setupBook(proofText?: string) {
	const files: Record<string, string> = {};
	const names = readdirSync(BOOK_DIR).filter((f) => f.endsWith(".md")).sort();
	for (const f of names) files[`Salt/${f}`] = readFileSync(join(BOOK_DIR, f), "utf8");
	if (proofText !== undefined) files[`Salt/${names[0]}`] = proofText;
	const raw = new FakeVault(files);
	const vault = new GuardedVault(raw);
	const rnd = counterRandom();
	const book = await registerBook(vault, "Salt", "The Salt Ledger", "en", rnd);
	const chapters: Chapter[] = [];
	for (const f of names) chapters.push(await addChapter(vault, book, chapters, { designation: f.replace(/^Chapter (\d+).*/, "Chapter $1"), notePath: `Salt/${f}` }, rnd));
	return { raw, vault, book, chapters, rnd };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const secs = (t0: number) => ((Date.now() - t0) / 1000).toFixed(1);

async function evalModel(model: string, embed: string, digests: Map<string, string>): Promise<string> {
	const client = new OllamaClient(net, ENDPOINT);
	const diag = new DiagnosticsLog();
	const lines: string[] = [`## ${model}`, "", `Digest \`${digests.get(model) ?? "unknown"}\`.`, ""];
	const deps = (rnd: ReturnType<typeof counterRandom>) => ({ client, model, diagnostics: diag, now: () => new Date().toISOString(), sleep, random: rnd });

	if (STEPS.includes("summary")) {
		const { vault, book, chapters, raw } = await setupBook();
		lines.push("### Chapter summaries", "", "| Chapter | Time | Result | Notes |", "|---|---|---|---|");
		for (const c of chapters) {
			const t0 = Date.now();
			try {
				const r = await summarizeChapter(vault, book, c, { client, model, prompt: effectivePrompt(SUMMARY_PROMPT, null), diagnostics: diag, now: () => new Date().toISOString(), sleep });
				const stored = [...raw.files.entries()].find(([p]) => p.includes(`/summaries/${c.id}`))?.[1] ?? "";
				const summary = /## Summary \(AI-managed\)\n\n([\s\S]*?)\n\n##/.exec(stored)?.[1] ?? "";
				lines.push(`| ${c.designation} | ${secs(t0)} s | ${r.kind} | ${r.kind === "saved" && r.issues.length ? r.issues.join(" ") : ""} |`);
				lines.push("", `> ${summary.replace(/\n/g, " ")}`, "");
			} catch (e) {
				lines.push(`| ${c.designation} | ${secs(t0)} s | FAILED | ${(e as Error).message} |`);
			}
		}
		lines.push("");
	}

	if (STEPS.includes("proofread")) {
		const first = readFileSync(join(BOOK_DIR, readdirSync(BOOK_DIR).filter((f) => f.endsWith(".md")).sort()[0] as string), "utf8");
		const { text, typos } = inject(first, PROOF_PARAS);
		const { vault, book, chapters, rnd } = await setupBook(text);
		const t0 = Date.now();
		const prose = proseSegments(text).slice(0, PROOF_PARAS);
		// Only the first paragraphs are proofread: the rest are marked reviewed by cutting the chapter down.
		const limited = text.slice(0, prose[prose.length - 1]?.end ?? text.length);
		const { raw, vault: v2, book: b2, chapters: c2, rnd: r2 } = await setupBook(limited);
		void vault; void book; void chapters; void rnd; void raw;
		const report = await proofreadChapter(v2, b2, c2[0] as Chapter, { ...deps(r2), prompt: effectivePrompt(PROOFREAD_PROMPT, null) });
		const edits = report.proposal?.edits ?? [];
		const fixed = typos.filter((t) => edits.some((e) => e.original.includes(t.wrong) && e.replacement.toLowerCase().includes(t.right.toLowerCase())));
		const stray = edits.filter((e) => !typos.some((t) => e.original.includes(t.wrong)));
		lines.push("### Proofreading (typos injected into the first paragraphs of Chapter 1)", "", `- Paragraphs checked: ${report.checked} of ${prose.length}; time ${secs(t0)} s`, `- Injected typos fixed: **${fixed.length} of ${typos.length}**`, `- Other suggested changes (not injected, to judge by eye): ${stray.length}`, `- Paragraphs rejected by the safety checks (left as written): ${report.failed.length}`, "");
		for (const f of report.failed) lines.push(`  - ${f}`);
		for (const e of stray.slice(0, 8)) lines.push(`  - “${e.original}” → “${e.replacement}”`);
		lines.push("");
	}

	if (STEPS.includes("entities")) {
		const { vault, book, chapters, rnd } = await setupBook();
		lines.push("### Entity extraction", "", "| Chapter | Time | New entities | Left out (quote not in text) | Notes |", "|---|---|---|---|---|");
		for (const c of chapters) {
			const t0 = Date.now();
			try {
				const r = await extractChapter(vault, book, c, deps(rnd));
				lines.push(`| ${c.designation} | ${secs(t0)} s | ${r.created.length} | ${r.ungrounded} | ${r.notes.join(" ").slice(0, 160)} |`);
			} catch (e) {
				lines.push(`| ${c.designation} | ${secs(t0)} s | FAILED | | ${(e as Error).message} |`);
			}
		}
		const { entities } = await listAllEntities(vault, book);
		const have = (n: string) => entities.some((e) => [e.name, ...e.aliases].some((x) => nameKey(x) === nameKey(n) || nameKey(x).includes(nameKey(n)) || nameKey(n).includes(nameKey(x))));
		lines.push("");
		for (const [kind, names] of Object.entries(EXPECTED)) lines.push(`- Expected ${kind}s found: **${names.filter(have).length} of ${names.length}** (${names.filter((n) => !have(n)).map((n) => `missing ${n}`).join(", ") || "none missing"})`);
		const expectedAll = Object.values(EXPECTED).flat();
		const extra = entities.filter((e) => !expectedAll.some((n) => nameKey(n).includes(nameKey(e.name)) || nameKey(e.name).includes(nameKey(n))));
		lines.push(`- Entities that are not on the expected list (judge by eye): ${extra.length}: ${extra.map((e) => `${e.name} (${e.type})`).join(", ")}`, `- Total entities created: ${entities.length}`, "");
	}

	if (STEPS.includes("translate")) {
		const paras = Number(process.env.EVAL_TRANSLATE_PARAS ?? 6);
		const first = readFileSync(join(BOOK_DIR, readdirSync(BOOK_DIR).filter((f) => f.endsWith(".md")).sort()[0] as string), "utf8");
		const prose = proseSegments(first).slice(0, paras);
		const limited = first.slice(0, prose[prose.length - 1]?.end ?? first.length);
		lines.push("### Translation (first paragraphs of Chapter 1)", "");
		for (const language of ["de", "cs"]) {
			const { raw, vault, book, chapters, rnd } = await setupBook(limited);
			const chapter = chapters[0] as Chapter;
			const t0 = Date.now();
			try {
				const r = await syncTranslation(vault, book, chapter, language, { model: { client, model, diagnostics: diag, now: () => new Date().toISOString(), sleep }, random: rnd, glossary: [] });
				const out = [...raw.files.entries()].find(([p]) => p.includes(`/translations/${language}/ch_`) && !p.includes("_align"))?.[1] ?? "";
				lines.push(`- ${language}: ${secs(t0)} s, ${r.translated} paragraphs translated, ${r.failed.length} failed, ${r.issues.length} problems left after repair${r.issues.length ? `: ${r.issues.join(" | ")}` : ""}`, "", ...out.replace(/^---[\s\S]*?---\n/, "").trim().split("\n\n").slice(0, 4).map((p) => `> ${p.replace(/\n/g, " ")}`), "");
			} catch (e) {
				lines.push(`- ${language}: FAILED ${(e as Error).message}`, "");
			}
		}
	}

	if (STEPS.includes("events")) {
		const { vault, book, chapters } = await setupBook();
		lines.push("### Event suggestions", "", "| Chapter | Time | Events | Relations | Left out |", "|---|---|---|---|---|");
		for (const c of chapters) {
			const t0 = Date.now();
			try {
				const r = await findEvents(vault, book, c, { client, model, diagnostics: diag, now: () => new Date().toISOString(), sleep });
				lines.push(`| ${c.designation} | ${secs(t0)} s | ${r.events} | ${r.relations} | ${r.dropped} |`);
			} catch (e) {
				lines.push(`| ${c.designation} | ${secs(t0)} s | FAILED | | ${(e as Error).message} |`);
			}
		}
		lines.push("");
		for (const c of chapters) {
			const found = await loadCandidates(vault, book, c.id);
			if (!found) continue;
			lines.push(`**${c.designation}**`, "", ...found.events.map((e) => `- event: ${e.label} — “${e.quote.slice(0, 80)}”`), ...found.relations.map((r) => `- ${r.kind}: ${r.a}${r.b ? ` / ${r.b}` : ""}${r.duration ? ` (${r.duration})` : ""}${r.date ? ` (${r.date})` : ""} — “${r.quote.slice(0, 80)}”`), "");
		}
	}

	if (STEPS.includes("consistency")) {
		const { vault, book, chapters, rnd } = await setupBook();
		const search = new BookSearch();
		const subjects: Array<{ name: string; aliases: string[]; planted: string }> = [
			{ name: "Nora Voss", aliases: ["Nora", "Nell"], planted: "eye colour: grey in chapter 1, green in chapter 3" },
			{ name: "Tomas Voss", aliases: ["Tomas"], planted: "younger brother in chapter 2, elder brother in chapter 3" },
			{ name: "compass", aliases: ["Meridian Key"], planted: "brass in chapter 1, silver in chapter 2" },
			{ name: "Ilse Kovar", aliases: ["Ilse"], planted: "none planted" },
		];
		lines.push("### Consistency check (retrieval of up to 10 passages per subject)", "", "| Subject | Planted | Time | Passages | Findings | Left out |", "|---|---|---|---|---|---|");
		const detail: string[] = [];
		for (const sub of subjects) {
			const entity = await createEntity(vault, book, [], { type: "character", name: sub.name, aliases: sub.aliases }, rnd);
			const t0 = Date.now();
			try {
				const { evidence } = await gatherEvidence(vault, book, chapters, search, [sub.name, ...sub.aliases].join(" "), null, 10);
				const r = await checkConsistency({ client, model, diagnostics: diag, now: () => new Date().toISOString(), sleep }, entity, evidence);
				lines.push(`| ${sub.name} | ${sub.planted} | ${secs(t0)} s | ${r.excerpts} | ${r.found.length} | ${r.dropped} |`);
				for (const f of r.found) detail.push(`- **${sub.name}: ${f.topic}** — ${f.first.chapter} “${f.first.quote.slice(0, 70)}” vs ${f.second.chapter} “${f.second.quote.slice(0, 70)}”. ${f.explanation}`);
			} catch (e) {
				lines.push(`| ${sub.name} | ${sub.planted} | ${secs(t0)} s | | FAILED | ${(e as Error).message} |`);
			}
		}
		lines.push("", ...detail, "");
	}

	if (STEPS.includes("ask")) {
		const { vault, book, chapters } = await setupBook();
		const search = new BookSearch();
		const questions: Array<{ q: string; expect: string[] | null; note: string }> = [
			{ q: "Who is the harbour master?", expect: ["ilse", "kovar"], note: "answerable" },
			{ q: "How old was Tomas on the night the lamp went out?", expect: ["14", "fourteen"], note: "answerable, chapter 2" },
			{ q: "What did the woman in the round room say to Nora?", expect: ["nell", "wondered how long"], note: "answerable, chapter 3" },
			{ q: "What is the name of Nora's dog?", expect: null, note: "trap: not in the book, should not be answered" },
			{ q: "What colour are Nora's eyes?", expect: ["grey", "green"], note: "the book contradicts itself (grey in chapter 1, green in chapter 3)" },
		];
		lines.push("### Ask the book (keyword retrieval, 8 passages)", "", "| Question | Time | Status | Quotes kept / dropped | Contains expected |", "|---|---|---|---|---|");
		const answers: string[] = [];
		for (const item of questions) {
			const t0 = Date.now();
			try {
				const { evidence } = await gatherEvidence(vault, book, chapters, search, item.q, null);
				const r = await askBook({ client, model, diagnostics: diag, now: () => new Date().toISOString(), sleep }, item.q, evidence, null);
				const hit = item.expect === null ? (r.status === "not_in_excerpts" ? "correctly not answered" : "ANSWERED A TRAP QUESTION") : item.expect.some((x) => r.answer.toLowerCase().includes(x)) ? "yes" : "no";
				lines.push(`| ${item.q} (${item.note}) | ${secs(t0)} s | ${r.status} | ${r.citations.length} / ${r.dropped} | ${hit} |`);
				answers.push(`> **${item.q}** ${r.answer.replace(/\n/g, " ")}`);
			} catch (e) {
				lines.push(`| ${item.q} | ${secs(t0)} s | FAILED | | ${(e as Error).message} |`);
			}
		}
		lines.push("", ...answers.flatMap((a) => [a, ""]));
	}

	lines.push(`Run log: ${diag.recent(1000).length} model calls, ${diag.recent(1000).filter((d) => d.repaired).length} needed a repair, ${diag.recent(1000).filter((d) => d.outcome === "failed").length} failed.`, "");
	void embed;
	return lines.join("\n");
}

async function evalSearch(embed: string, digests: Map<string, string>): Promise<string> {
	const { vault, book, chapters } = await setupBook();
	const store = memoryStore();
	const client = new OllamaClient(net, ENDPOINT);
	const search = new BookSearch();
	const lines = [`## Search (embedding model ${embed})`, "", `Digest \`${digests.get(embed) ?? "unknown"}\`.`, ""];
	const t0 = Date.now();
	let passages = 0;
	for (const c of chapters) passages += await search.buildChapterVectors(vault, book, chapters, c, { client, model: embed, store });
	lines.push(`Built ${passages} passage vectors in ${secs(t0)} s.`, "", "| Query | Expected | Keyword | Hybrid |", "|---|---|---|---|");
	const queries: Array<[string, string]> = [
		["who vanished at sea three years ago", "Chapter 1"],
		["a door opened from the other side under the harbour", "Chapter 2"],
		["a woman who looks exactly like Nora", "Chapter 3"],
		["counting drops of oil for the lamp", "Chapter 1"],
		["the water was warm and came from the east", "Chapter 2"],
		["Meridian Key", "Chapter 1"],
	];
	let kw = 0;
	let hy = 0;
	for (const [q, want] of queries) {
		const a = await search.search(vault, book, chapters, q, 3);
		const b = await search.search(vault, book, chapters, q, 3, { client, model: embed, store });
		const hit = (o: typeof a) => (o.results[0]?.chapter === want ? "hit@1" : o.results.some((r) => r.chapter === want) ? "hit@3" : "miss");
		if (hit(a) === "hit@1") kw++;
		if (hit(b) === "hit@1") hy++;
		lines.push(`| ${q} | ${want} | ${hit(a)} | ${hit(b)} |`);
	}
	lines.push("", `Top-1 correct: keyword ${kw} of ${queries.length}, hybrid ${hy} of ${queries.length}.`, "");
	return lines.join("\n");
}

async function main(): Promise<void> {
	const models = (process.env.EVAL_MODELS ?? "gemma4:12b-it-q4_K_M,ornith-1.5:35b").split(",");
	const embed = process.env.EVAL_EMBED ?? "bge-m3:latest";
	const digests = await tags();
	const version = JSON.parse((await net.request({ url: `${ENDPOINT}/api/version`, method: "GET", timeoutMs: 10_000 })).text) as { version: string };
	const head = `# Model evaluation, ${new Date().toISOString().slice(0, 10)}\n\nOllama ${version.version}. Book: fixtures/salt-ledger (synthetic). Real models; results vary between runs. Not a benchmark: read the outputs.\n`;
	const parts = [head];
	for (const m of models) {
		console.log(`evaluating ${m} ...`);
		parts.push(await evalModel(m, embed, digests));
	}
	if (STEPS.includes("search")) parts.push(await evalSearch(embed, digests));
	const out = join(process.cwd(), "docs/evals", `${new Date().toISOString().slice(0, 10)}-${process.env.EVAL_TAG ?? "run"}.md`);
	writeFileSync(out, parts.join("\n"));
	console.log(`wrote ${out}`);
}

void main();
