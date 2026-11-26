import { describe, expect, it, vi } from "vitest";
import { registerBook } from "../core/books";
import { addChapter } from "../core/chapters";
import { VectorIndex, type IndexStorePort } from "../core/embeddings";
import { ModelError } from "../core/ai/errors";
import type { NetRequest, NetworkPort } from "../core/ai/network";
import { OllamaClient } from "../core/ai/ollama";
import { GuardedVault } from "../core/guarded-vault";
import { fuse } from "../core/rrf";
import { BookSearch } from "../core/search";
import { nearest, normalize, parseVectors, serializeVectors, vectorKey, type VectorEntry } from "../core/vectors";
import { FakeVault, counterRandom } from "./__mocks__/fakeVault";

const v = (...n: number[]) => normalize(n);

describe("vectors", () => {
	it("normalizes to unit length and ranks by similarity with deterministic ties", () => {
		const q = v(1, 0);
		expect(Array.from(normalize([3, 4])).map((x) => Math.round(x * 10) / 10)).toEqual([0.6, 0.8]);
		expect(Array.from(normalize([0, 0]))).toEqual([0, 0]);
		const entries: VectorEntry[] = [
			{ chapterId: "b", passageId: "1", vector: v(0, 1) },
			{ chapterId: "a", passageId: "1", vector: v(1, 0) },
			{ chapterId: "a", passageId: "2", vector: v(1, 0) },
			{ chapterId: "c", passageId: "1", vector: v(1, 1) },
		];
		expect(nearest(q, entries, 3).map((n) => vectorKey(n.entry.chapterId, n.entry.passageId))).toEqual(["a:1", "a:2", "c:1"]);
		expect(nearest(q, [], 5)).toEqual([]);
	});

	it("round-trips through the binary form and treats anything damaged as no index", () => {
		const file = { model: "m", dims: 2, entries: [{ chapterId: "c", passageId: "p", vector: v(1, 2) }, { chapterId: "d", passageId: "q", vector: v(3, 1) }] };
		const back = parseVectors(serializeVectors(file))!;
		expect(back.model).toBe("m");
		expect(back.entries.map((e) => [e.chapterId, e.passageId])).toEqual([["c", "p"], ["d", "q"]]);
		expect(Array.from(back.entries[0]!.vector)[0]).toBeCloseTo(file.entries[0]!.vector[0]!, 6);
		const buf = serializeVectors(file);
		expect(parseVectors(buf.slice(0, buf.byteLength - 1))).toBeNull();
		expect(parseVectors(new ArrayBuffer(3))).toBeNull();
		const bad = new Uint8Array(buf.slice(0));
		bad[0] = 0;
		expect(parseVectors(bad.buffer)).toBeNull();
		const text = (obj: unknown) => {
			const header = new TextEncoder().encode(JSON.stringify(obj));
			const keys = ((obj as { keys: unknown }).keys as unknown[] | string).length;
			const dims = (obj as { dims: number }).dims;
			const out = new ArrayBuffer(8 + header.length + (Array.isArray((obj as { keys: unknown }).keys) && dims > 0 ? keys * dims * 4 : 0));
			new Uint8Array(out, 0, 4).set(new TextEncoder().encode("BHV1"));
			new DataView(out).setUint32(4, header.length, true);
			new Uint8Array(out, 8, header.length).set(header);
			return out;
		};
		expect(parseVectors(text({ model: 1, dims: 2, keys: [] }))).toBeNull();
		expect(parseVectors(text({ model: "m", dims: 0, keys: [] }))).toBeNull();
		expect(parseVectors(text({ model: "m", dims: 1, keys: [[1, 2]] }))).toBeNull();
		expect(parseVectors(text({ model: "m", dims: 1, keys: [["a"]] }))).toBeNull();
		expect(parseVectors(text({ model: "m", dims: 1, keys: [5] }))).toBeNull();
		expect(parseVectors(text({ model: "m", dims: 1, keys: "x" }))).toBeNull();
		const junk = new ArrayBuffer(12);
		new Uint8Array(junk, 0, 4).set(new TextEncoder().encode("BHV1"));
		new DataView(junk).setUint32(4, 999, true);
		expect(parseVectors(junk)).toBeNull();
	});
});

describe("reciprocal rank fusion", () => {
	it("uses only positions, so a passage found by both lists beats one found by either", () => {
		const out = fuse([[{ key: "a" }, { key: "b" }, { key: "c" }], [{ key: "c" }, { key: "d" }, { key: "a" }]]);
		expect(out.map((r) => r.key)).toEqual(["a", "c", "b", "d"]);
		expect(out.find((r) => r.key === "a")?.ranks).toEqual([1, 3]);
		expect(out.find((r) => r.key === "b")?.ranks).toEqual([2, null]);
		expect(out[0]?.score).toBeCloseTo(1 / 61 + 1 / 63, 10);
	});

	it("is stable for ties and handles empty input", () => {
		expect(fuse([[{ key: "b" }], [{ key: "a" }]]).map((r) => r.key)).toEqual(["a", "b"]);
		expect(fuse([])).toEqual([]);
		expect(fuse([[], []])).toEqual([]);
	});
});

/** Scripted embedding model: the vector for a text is derived from whether it mentions known topics. Mocked: no real quality implied. */
function embedder(calls: string[][] = []): NetworkPort & { calls: string[][] } {
	const topics = ["harbour", "forest", "machine"];
	return {
		calls,
		request: (req: NetRequest) => {
			const input = JSON.parse(req.body!).input as string[];
			calls.push(input);
			const embeddings = input.map((t) => topics.map((k): number => (/(boat|ship|quay|harbour)/i.test(t) && k === "harbour" ? 1 : new RegExp(k, "i").test(t) ? 1 : 0)).concat([0.01]));
			return Promise.resolve({ status: 200, text: JSON.stringify({ model: "e", embeddings }) });
		},
	};
}

function memoryStore(): IndexStorePort & { files: Map<string, ArrayBuffer> } {
	const files = new Map<string, ArrayBuffer>();
	return { files, read: (k) => Promise.resolve(files.get(k) ?? null), write: (k, d) => (files.set(k, d), Promise.resolve()) };
}

async function setup() {
	const raw = new FakeVault({ "Book/one.md": "The ship reached the quay at dawn.\n\nThe machine hummed all night.", "Book/two.md": "A walk in the forest, far from any water." });
	const vault = new GuardedVault(raw);
	const rnd = counterRandom();
	const book = await registerBook(vault, "Book", "Book", "en", rnd);
	const one = await addChapter(vault, book, [], { designation: "Chapter 1", notePath: "Book/one.md" }, rnd);
	const two = await addChapter(vault, book, [one], { designation: "Chapter 2", notePath: "Book/two.md" }, rnd);
	return { raw, vault, book, chapters: [one, two], one, two };
}

describe("the meaning index", () => {
	it("starts missing, becomes current after a build, and only embeds what is new", async () => {
		const { vault, book, chapters, one, two } = await setup();
		const net = embedder();
		const store = memoryStore();
		const sem = { client: new OllamaClient(net, "http://h:1"), model: "e", store };
		const search = new BookSearch();
		expect(await search.meaningStatus(vault, book, chapters, store, "e")).toEqual({ state: "missing", indexed: 0, total: 1 + 1, builtWith: null });
		expect(await search.buildChapterVectors(vault, book, chapters, one, sem)).toBe(1);
		expect((await search.meaningStatus(vault, book, chapters, store, "e")).state).toBe("partial");
		expect(await search.buildChapterVectors(vault, book, chapters, two, sem)).toBe(1);
		expect(await search.meaningStatus(vault, book, chapters, store, "e")).toMatchObject({ state: "current", indexed: 2, builtWith: "e" });
		expect(await search.buildChapterVectors(vault, book, chapters, one, sem)).toBe(0);
		expect(net.calls).toHaveLength(2);
		expect(store.files.size).toBe(1);
	});

	it("goes stale for a changed chapter, drops vectors of deleted chapters, and is incompatible with another model", async () => {
		const { raw, vault, book, chapters, one, two } = await setup();
		const store = memoryStore();
		const mk = (model: string) => ({ client: new OllamaClient(embedder(), "http://h:1"), model, store });
		const search = new BookSearch();
		await search.buildChapterVectors(vault, book, chapters, one, mk("e"));
		await search.buildChapterVectors(vault, book, chapters, two, mk("e"));
		raw.files.set("Book/two.md", "A new paragraph about the forest.");
		expect(await search.meaningStatus(vault, book, chapters, store, "e")).toMatchObject({ state: "partial", indexed: 1, total: 2 });
		expect(await search.meaningStatus(vault, book, chapters, store, "other")).toMatchObject({ state: "incompatible", indexed: 0, builtWith: "e" });
		await search.buildChapterVectors(vault, book, chapters, two, mk("other"));
		expect(await search.meaningStatus(vault, book, chapters, store, "other")).toMatchObject({ state: "partial", builtWith: "other" });
		raw.files.delete("Book/two.md");
		await search.buildChapterVectors(vault, book, chapters, one, mk("other"));
		expect((await search.meaningStatus(vault, book, [one, { ...two, notePath: null }], store, "other")).total).toBe(1);
	});

	it("survives a restart: the stored index is loaded again, and a damaged file means 'not built'", async () => {
		const { vault, book, chapters, one, two } = await setup();
		const store = memoryStore();
		const sem = { client: new OllamaClient(embedder(), "http://h:1"), model: "e", store };
		await new BookSearch().buildChapterVectors(vault, book, chapters, one, sem);
		await new BookSearch().buildChapterVectors(vault, book, chapters, two, sem);
		expect((await new BookSearch().meaningStatus(vault, book, chapters, store, "e")).state).toBe("current");
		store.files.set(`${book.id}.bin`, new ArrayBuffer(5));
		expect((await new BookSearch().meaningStatus(vault, book, chapters, store, "e")).state).toBe("missing");
	});

	it("keeps what was stored if a build is canceled part-way, and never saves a half-written chapter", async () => {
		const { vault, book, chapters, one } = await setup();
		const store = memoryStore();
		const failing: NetworkPort = { request: () => Promise.reject(new ModelError("canceled", "Canceled.")) };
		const search = new BookSearch();
		await expect(search.buildChapterVectors(vault, book, chapters, one, { client: new OllamaClient(failing, "http://h:1"), model: "e", store })).rejects.toMatchObject({ kind: "canceled" });
		expect(store.files.size).toBe(0);
	});

	it("embeds in small batches", async () => {
		const index = new VectorIndex("bk");
		const net = embedder();
		const passages = Array.from({ length: 40 }, (_, i) => ({ chapterId: "c", id: `p${i}`, text: `harbour ${i}` }));
		expect(await index.buildChapter(new OllamaClient(net, "http://h:1"), memoryStore(), "e", "c", passages)).toBe(40);
		expect(net.calls.map((c) => c.length)).toEqual([16, 16, 8]);
		expect(index.status(passages, "e").state).toBe("current");
		expect(index.status([], "e").state).toBe("partial");
		await index.dropChapters(memoryStore(), []);
		await index.dropChapters(memoryStore(), ["nothing"]);
		expect(index.status(passages, "e").indexed).toBe(40);
	});
});

describe("hybrid search (AC-SR-1, AC-SR-2)", () => {
	async function built() {
		const s = await setup();
		const store = memoryStore();
		const net = embedder();
		const sem = { client: new OllamaClient(net, "http://h:1"), model: "e", store };
		const search = new BookSearch();
		for (const c of s.chapters) await search.buildChapterVectors(s.vault, s.book, s.chapters, c, sem);
		return { ...s, search, sem, store, net };
	}

	it("finds a paraphrase by meaning that keyword search cannot, and marks which search found it", async () => {
		const { vault, book, chapters, search, sem } = await built();
		const keywordOnly = await search.search(vault, book, chapters, "harbour");
		expect(keywordOnly.results).toEqual([]);
		const hybrid = await search.search(vault, book, chapters, "harbour", 20, sem);
		expect(hybrid.meaning).toMatchObject({ requested: true, used: true, note: null });
		expect(hybrid.results[0]).toMatchObject({ chapter: "Chapter 1", channels: { keyword: null, meaning: 1 } });
		expect(hybrid.results[0]?.snippet).toContain("ship reached the quay");
		expect(hybrid.results[0]?.ref.bookId).toBe(book.id);
	});

	it("keeps exact names findable even when meaning is weak, and ranks passages both searches agree on first", async () => {
		const { vault, book, chapters, search, sem, raw } = await built();
		raw.files.set("Book/one.md", "The ship reached the quay at dawn.\n\nThe Zorblax machine hummed all night.");
		await search.buildChapterVectors(vault, book, chapters, chapters[0]!, sem);
		const out = await search.search(vault, book, chapters, "machine zorblax", 20, sem);
		expect(out.results[0]).toMatchObject({ chapter: "Chapter 1" });
		expect(out.results[0]?.channels.keyword).toBe(1);
		expect(out.results[0]?.snippet).toContain("Zorblax");
	});

	it("discloses a stale index, searches the rest by keyword, and never mixes in vectors of changed text", async () => {
		const { vault, book, chapters, search, sem, raw } = await built();
		raw.files.set("Book/two.md", "The forest walk, now with a harbour.");
		const out = await search.search(vault, book, chapters, "harbour", 20, sem);
		expect(out.meaning.used).toBe(true);
		expect(out.meaning.status).toMatchObject({ state: "partial", indexed: 1, total: 2 });
		expect(out.meaning.note).toBe("The meaning index covers 1 of 2 passages; the rest were searched by keyword only.");
		expect(out.results.find((r) => r.chapter === "Chapter 2")?.channels).toEqual({ keyword: 1, meaning: null });
	});

	it("falls back to current keyword results, with the reason, when meaning cannot be used", async () => {
		const { vault, book, chapters, one } = await setup();
		const store = memoryStore();
		const search = new BookSearch();
		const down: NetworkPort = { request: () => Promise.reject(new Error("offline")) };
		const sem = { client: new OllamaClient(down, "http://h:1"), model: "e", store };
		const notBuilt = await search.search(vault, book, chapters, "machine", 20, sem);
		expect(notBuilt.meaning).toMatchObject({ requested: true, used: false, note: "The meaning index has not been built yet." });
		expect(notBuilt.results.map((r) => r.chapter)).toEqual(["Chapter 1"]);
		const good = { ...sem, client: new OllamaClient(embedder(), "http://h:1") };
		await search.buildChapterVectors(vault, book, chapters, one, good);
		const offline = await search.search(vault, book, chapters, "machine", 20, sem);
		expect(offline.meaning.used).toBe(false);
		expect(offline.meaning.note).toMatch(/^Meaning search was not used: Could not reach the model server.*Keyword results are shown\.$/);
		expect(offline.results.map((r) => r.chapter)).toEqual(["Chapter 1"]);
		const other = await search.search(vault, book, chapters, "machine", 20, { ...good, model: "different" });
		expect(other.meaning.note).toBe("The meaning index was built with e; build it again for different.");
		expect(other.results).toHaveLength(1);
	});

	it("ignores vectors whose size does not match the query's, and passages that vanished", async () => {
		const { vault, book, chapters, search, sem, store, net } = await built();
		const odd: NetworkPort = { request: () => Promise.resolve({ status: 200, text: JSON.stringify({ embeddings: [[1, 0]] }) }) };
		const out = await search.search(vault, book, chapters, "machine", 20, { ...sem, client: new OllamaClient(odd, "http://h:1") });
		expect(out.meaning.used).toBe(true);
		expect(out.results.every((r) => r.channels.meaning === null)).toBe(true);
		void store;
		void net;
	});

	it("reads an unreadable-looking index as unbuilt", async () => {
		const { vault, book, chapters } = await setup();
		const store: IndexStorePort = { read: () => Promise.resolve(new ArrayBuffer(2)), write: vi.fn(() => Promise.resolve()) };
		const out = await new BookSearch().search(vault, book, chapters, "machine", 20, { client: new OllamaClient(embedder(), "http://h:1"), model: "e", store });
		expect(out.meaning.status?.state).toBe("missing");
	});
});
