import { describe, expect, it, vi } from "vitest";
import { hasModel, testConnection } from "../core/ai/connection";
import { ModelError } from "../core/ai/errors";
import type { NetRequest, NetResponse, NetworkPort } from "../core/ai/network";
import { OllamaClient, normalizeEndpoint } from "../core/ai/ollama";

type Script = Record<string, NetResponse | Error | ((req: NetRequest) => NetResponse)>;
function net(script: Script): NetworkPort & { calls: NetRequest[] } {
	const calls: NetRequest[] = [];
	return {
		calls,
		request: (req) => {
			calls.push(req);
			const path = new URL(req.url).pathname;
			const r = script[path];
			if (r === undefined) return Promise.resolve({ status: 404, text: "{}" });
			if (r instanceof Error) return Promise.reject(r);
			return Promise.resolve(typeof r === "function" ? r(req) : r);
		},
	};
}
const ok = (body: unknown): NetResponse => ({ status: 200, text: JSON.stringify(body) });

describe("normalizeEndpoint", () => {
	it("accepts http(s) addresses with ports and trims slashes and spaces", () => {
		expect(normalizeEndpoint(" http://my-computer:11434/ ")).toBe("http://my-computer:11434");
		expect(normalizeEndpoint("https://models.example.org/ollama//")).toBe("https://models.example.org/ollama");
	});

	it.each(["", "my-computer:11434", "ftp://x", "http://", "http://a b", "javascript:alert(1)"])("rejects %j", (v) => {
		expect(normalizeEndpoint(v)).toBeNull();
	});
});

describe("OllamaClient", () => {
	it("reads version and installed models, skipping entries without a name", async () => {
		const n = net({ "/api/version": ok({ version: "0.5.1" }), "/api/tags": ok({ models: [{ name: "a:latest", digest: "d", details: { parameter_size: "8B" } }, { model: "b" }, { nope: 1 }, null] }) });
		const c = new OllamaClient(n, "http://h:1");
		expect(await c.version()).toBe("0.5.1");
		expect(await c.listModels()).toEqual([{ name: "a:latest", digest: "d", parameterSize: "8B" }, { name: "b", digest: "", parameterSize: undefined }]);
		expect(await new OllamaClient(net({ "/api/version": ok({}) }), "http://h:1").version()).toBe("unknown");
		await expect(new OllamaClient(net({ "/api/tags": ok({ models: "x" }) }), "http://h:1").listModels()).rejects.toMatchObject({ kind: "bad-response" });
	});

	it("sends a non-streaming chat with the schema and options and parses the answer and usage", async () => {
		const n = net({ "/api/chat": ok({ message: { role: "assistant", content: "hi" }, prompt_eval_count: 3, eval_count: 2, total_duration: 5_000_000 }) });
		const schema = { type: "object" };
		const r = await new OllamaClient(n, "http://h:1").chat({ model: "m", messages: [{ role: "user", content: "x" }], format: schema, temperature: 0.2, numCtx: 4096, think: false, timeoutMs: 5 });
		expect(r).toEqual({ content: "hi", promptTokens: 3, outputTokens: 2, totalMs: 5 });
		expect(JSON.parse(n.calls[0]!.body!)).toEqual({ model: "m", messages: [{ role: "user", content: "x" }], stream: false, think: false, format: schema, options: { temperature: 0.2, num_ctx: 4096 } });
		expect(n.calls[0]).toMatchObject({ method: "POST", timeoutMs: 5 });
	});

	it("omits optional fields and tolerates missing usage", async () => {
		const n = net({ "/api/chat": ok({ message: { content: "x" } }) });
		const r = await new OllamaClient(n, "http://h:1").chat({ model: "m", messages: [] });
		expect(r).toEqual({ content: "x", promptTokens: undefined, outputTokens: undefined, totalMs: undefined });
		expect(JSON.parse(n.calls[0]!.body!)).toEqual({ model: "m", messages: [], stream: false, options: {} });
		expect(n.calls[0]?.timeoutMs).toBe(120_000);
		await expect(new OllamaClient(net({ "/api/chat": ok({ message: {} }) }), "http://h:1").chat({ model: "m", messages: [] })).rejects.toMatchObject({ kind: "bad-response" });
	});

	it("embeds a batch and checks the answer shape", async () => {
		const n = net({ "/api/embed": ok({ model: "e", embeddings: [[1, 2], [3, 4]] }) });
		expect(await new OllamaClient(n, "http://h:1").embed("e", ["a", "b"])).toEqual({ model: "e", embeddings: [[1, 2], [3, 4]] });
		expect(await new OllamaClient(net({ "/api/embed": ok({ embeddings: [[1]] }) }), "http://h:1").embed("e", ["a"])).toMatchObject({ model: "e" });
		for (const bad of [{ embeddings: [[1]] }, { embeddings: [[]] }, { embeddings: [["x"]] }, { embeddings: "no" }, {}]) {
			await expect(new OllamaClient(net({ "/api/embed": ok(bad) }), "http://h:1").embed("e", ["a", "b"])).rejects.toMatchObject({ kind: "bad-response" });
		}
	});

	it("turns every failure into an actionable error kind", async () => {
		const c = (script: Script) => new OllamaClient(net(script), "http://h:1");
		await expect(c({ "/api/version": new Error("ECONNREFUSED") }).version()).rejects.toMatchObject({ kind: "unreachable", message: expect.stringContaining("http://h:1") });
		await expect(c({ "/api/version": new ModelError("timeout", "slow") }).version()).rejects.toMatchObject({ kind: "timeout" });
		await expect(c({ "/api/version": { status: 403, text: "" } }).version()).rejects.toMatchObject({ kind: "host-rejected" });
		await expect(c({ "/api/chat": { status: 404, text: "{}" } }).chat({ model: "gone", messages: [] })).rejects.toMatchObject({ kind: "model-missing", message: expect.stringContaining("gone") });
		await expect(c({ "/api/version": { status: 404, text: "" } }).version()).rejects.toMatchObject({ kind: "http" });
		await expect(c({ "/api/version": { status: 500, text: "" } }).version()).rejects.toMatchObject({ kind: "http" });
		await expect(c({ "/api/version": { status: 200, text: "<html>" } }).version()).rejects.toMatchObject({ kind: "bad-response" });
		await expect(c({ "/api/version": ok(null) }).version()).resolves.toBe("unknown");
	});
});

describe("testConnection", () => {
	const cfg = { endpoint: "http://h:1/", generationModel: "gen", embeddingModel: "emb" };
	const healthy: Script = { "/api/version": ok({ version: "0.5.1" }), "/api/tags": ok({ models: [{ name: "gen:latest" }, { name: "emb" }] }), "/api/embed": ok({ embeddings: [[1, 2, 3]] }) };

	it("reports a working setup including the embedding dimensions", async () => {
		const r = await testConnection(net(healthy), cfg);
		expect(r.ok).toBe(true);
		expect(r.lines).toEqual(["Connected. Ollama 0.5.1.", "2 models installed.", 'Generation model "gen": installed.', 'Embedding model "emb": installed.', "Embeddings work: 3 dimensions."]);
	});

	it("says what is missing instead of failing vaguely", async () => {
		const n = net({ ...healthy, "/api/tags": ok({ models: [{ name: "x" }] }) });
		const r = await testConnection(n, { ...cfg, embeddingModel: "" });
		expect(r.ok).toBe(false);
		expect(r.lines).toContain('Generation model "gen": not installed on the server.');
		expect(r.lines).toContain("Embedding model: not chosen yet.");
		expect(r.lines).toContain("1 model installed.");
		expect(n.calls.some((c) => c.url.endsWith("/api/embed"))).toBe(false);
		const bad = await testConnection(net(healthy), { ...cfg, generationModel: "", embeddingModel: "nope" });
		expect(bad.lines).toContain('Embedding model "nope": not installed on the server.');
		expect(bad.lines).toContain("Generation model: not chosen yet.");
	});

	it("explains an unusable address and unreachable servers without throwing", async () => {
		expect((await testConnection(net({}), { ...cfg, endpoint: "nope" })).lines[0]).toMatch(/Enter the server address/);
		const down = await testConnection(net({ "/api/version": new Error("x") }), cfg);
		expect(down).toMatchObject({ ok: false });
		expect(down.lines[0]).toMatch(/Could not reach/);
		const odd = await testConnection({ request: () => Promise.resolve().then(() => { throw "weird"; }) } as never, cfg);
		expect(odd.lines[0]).toMatch(/Could not reach/);
		const strange = await testConnection({ request: vi.fn(() => Promise.resolve({ status: 200, text: "{}" })) }, cfg);
		expect(strange.ok).toBe(false);
	});

	it("resolves model names like Ollama does", () => {
		expect(hasModel(["a:latest", "b:8b"], "a")).toBe(true);
		expect(hasModel(["a:latest", "b:8b"], "b")).toBe(false);
		expect(hasModel(["a:latest", "b:8b"], "b:8b")).toBe(true);
	});
});
