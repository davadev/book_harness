import { describe, expect, it } from "vitest";
import { registerBook } from "../core/books";
import { KeywordIndex, snippet, tokenize } from "../core/bm25";
import { addChapter } from "../core/chapters";
import { createEntity } from "../core/entities";
import { GuardedVault } from "../core/guarded-vault";
import { passagesOf } from "../core/passages";
import { BookSearch } from "../core/search";
import { FakeVault, counterRandom } from "./__mocks__/fakeVault";

const para = (n: number, word: string) => `${word} ${"filler words go here and there ".repeat(n)}`.trim();

describe("passages", () => {
	it("groups paragraphs to about 200 words, in order, never including properties or fenced code", () => {
		const text = `---\ntitle: x\n---\n${para(40, "alpha")}.\n\n${para(40, "beta")}.\n\n\`\`\`\nsecret code\n\`\`\`\n\n${para(40, "gamma")}.`;
		const ps = passagesOf(text);
		expect(ps.length).toBeGreaterThan(1);
		expect(ps.map((p) => p.ordinal)).toEqual(ps.map((_, i) => i));
		for (const p of ps) for (const piece of p.text.split("\n\n")) expect(text.slice(p.start, p.end)).toContain(piece);
		expect(ps.some((p) => p.text.includes("secret code") || p.text.includes("title: x"))).toBe(false);
		expect(ps.map((p) => p.text).join(" ")).toContain("gamma");
	});

	it("cuts an enormous paragraph at sentence ends and loses nothing", () => {
		const sentences = Array.from({ length: 120 }, (_, i) => `Sentence number ${i} says something quite ordinary here.`);
		const ps = passagesOf(sentences.join(" "));
		expect(ps.length).toBeGreaterThan(1);
		const joined = ps.map((p) => p.text).join(" ");
		for (const s of sentences) expect(joined).toContain(s);
	});

	it("handles empty text, unclosed fences, tildes and indentation, and gives passages stable ids from their words", () => {
		expect(passagesOf("")).toEqual([]);
		expect(passagesOf("...\n\nWords here.").map((p) => p.text)).toEqual(["...\n\nWords here."]);
		expect(passagesOf("---\na: 1\n---\n")).toEqual([]);
		expect(passagesOf("Text.\n\n~~~\ncode\n\n~~~\n\nMore.").map((p) => p.text)).toEqual(["Text.\n\nMore."]);
		expect(passagesOf("  Indented words.\r\nNext line.\r\n").map((p) => p.text)).toEqual(["Indented words.\nNext line."]);
		expect(passagesOf("One.\n\n```\nnever closed\n\nstill code").map((p) => p.text)).toEqual(["One."]);
		const a = passagesOf("Same words.")[0]!;
		const b = passagesOf("Prefix paragraph.\n\nSame words.")[0]!;
		expect(passagesOf("Same words.")[0]!.id).toBe(a.id);
		expect(b.id).not.toBe(a.id);
	});
});

describe("tokenize and the keyword index", () => {
	it("lowercases whole words in any of the book's languages and keeps invented words intact", () => {
		expect(tokenize("Die Größe von Zorblax-7, příliš žluťoučký!")).toEqual(["die", "größe", "von", "zorblax", "7", "příliš", "žluťoučký"]);
		expect(tokenize("")).toEqual([]);
	});

	it("finds a unique invented term and ranks by BM25, with the exact phrase on top", () => {
		const idx = new KeywordIndex();
		const mk = (ordinal: number, text: string) => ({ ordinal, start: 0, end: text.length, text, id: `p${ordinal}` });
		idx.setChapter("c1", "r1", [mk(0, "The captain watched the harbour at dawn."), mk(1, "A strange machine called the Zorblax hummed.")]);
		idx.setChapter("c2", "r1", [mk(0, "The harbour was quiet. The harbour was empty."), mk(1, "He mentioned the grey machine and the Zorblax once more")]);
		expect(idx.search("zorblax").map((h) => `${h.passage.chapterId}:${h.passage.ordinal}`)).toEqual(["c1:1", "c2:1"]);
		expect(idx.search("grey machine").map((h) => h.passage.chapterId)[0]).toBe("c2");
		expect(idx.search("harbour")[0]?.passage.chapterId).toBe("c2");
		expect(idx.search("nothingmatches")).toEqual([]);
		expect(idx.search("   ")).toEqual([]);
		expect(new KeywordIndex().search("x")).toEqual([]);
		expect(idx.search("harbour", 1)).toHaveLength(1);
		expect(idx.size).toBe(4);
		expect(idx.revisionOf("c1")).toBe("r1");
	});

	it("replaces and removes a chapter without touching the others, and orders ties deterministically", () => {
		const idx = new KeywordIndex();
		const mk = (ordinal: number, text: string) => ({ ordinal, start: 0, end: text.length, text, id: `p${ordinal}` });
		idx.setChapter("c1", "r1", [mk(0, "same words"), mk(1, "same words")]);
		idx.setChapter("c2", "r1", [mk(0, "same words")]);
		expect(idx.search("same").map((h) => `${h.passage.chapterId}:${h.passage.ordinal}`)).toEqual(["c1:0", "c1:1", "c2:0"]);
		idx.setChapter("c1", "r2", [mk(0, "different")]);
		expect(idx.search("same").map((h) => h.passage.chapterId)).toEqual(["c2"]);
		idx.removeChapter("c2");
		expect(idx.search("same")).toEqual([]);
		expect(idx.revisionOf("c2")).toBeUndefined();
	});

	it("cuts readable snippets around the first match", () => {
		const long = `${"before ".repeat(40)}the Zorblax appears ${"after ".repeat(40)}`;
		const s = snippet(long, ["zorblax"]);
		expect(s.startsWith("…")).toBe(true);
		expect(s.endsWith("…")).toBe(true);
		expect(s).toContain("Zorblax");
		expect(s.length).toBeLessThan(220);
		expect(snippet("short text", ["short"])).toBe("short text");
		expect(snippet("the lamp and the captain", ["captain", "lamp"])).toBe("the lamp and the captain");
		expect(snippet(`${"a".repeat(300)}Z${"b".repeat(300)}`, ["z"], 40)).toContain("Z");
		expect(snippet("no match here", ["zzz"])).toBe("no match here");
		expect(snippet("x".repeat(400), ["x"], 50).length).toBeGreaterThan(40);
		expect(snippet(`${"a".repeat(200)} ${"b".repeat(200)}`, ["b"], 20)).toContain("b");
	});
});

describe("book search", () => {
	async function setup() {
		const raw = new FakeVault({ "A/one.md": "Philip Marlowe met the Zorblax at the harbour.", "A/two.md": "The Zorblax was gone by morning.", "B/one.md": "Zorblax in another book." });
		const vault = new GuardedVault(raw);
		const rnd = counterRandom();
		const a = await registerBook(vault, "A", "A", "en", rnd);
		const b = await registerBook(vault, "B", "B", "en", rnd);
		const one = await addChapter(vault, a, [], { designation: "Chapter 1", notePath: "A/one.md" }, rnd);
		const two = await addChapter(vault, a, [one], { designation: "Chapter 2", notePath: "A/two.md" }, rnd);
		const planned = await addChapter(vault, a, [one, two], { designation: "Chapter 3" }, rnd);
		const bone = await addChapter(vault, b, [], { designation: "Chapter 1", notePath: "B/one.md" }, rnd);
		return { raw, vault, a, b, one, two, planned, bone, rnd };
	}

	it("returns passage references, snippets and provenance, and names chapters that could not be searched", async () => {
		const { vault, a, one, two, planned } = await setup();
		const out = await new BookSearch().search(vault, a, [one, two, planned], "zorblax");
		expect(out).toMatchObject({ query: "zorblax", passagesIndexed: 2, chaptersIndexed: 2, missingChapters: ["Chapter 3"] });
		expect(out.results.map((r) => [r.chapter, r.provenance])).toEqual([["Chapter 2", "manuscript"], ["Chapter 1", "manuscript"]]);
		const first = out.results[1]!;
		expect(first.ref).toMatchObject({ bookId: a.id, chapterId: one.id, start: 0 });
		expect(first.ref.sourceRevision).toMatch(/^sha256:/);
		expect(first.snippet).toContain("Zorblax");
	});

	it("reads a chapter's known entities once even when several passages match", async () => {
		const { raw, vault, a, one, two } = await setup();
		raw.files.set("A/one.md", `${para(60, "Zorblax")}.\n\n${para(60, "Zorblax")} again.\n\n${para(60, "Zorblax")} third.`);
		const out = await new BookSearch().search(vault, a, [one, two], "zorblax");
		expect(out.results.filter((r) => r.chapter === "Chapter 1").length).toBeGreaterThan(1);
	});

	it("also names entities the author linked by hand", async () => {
		const { vault, a, one, two, rnd } = await setup();
		const moon = await createEntity(vault, a, [], { type: "place", name: "Zorblax Station" }, rnd);
		const at = "Philip Marlowe met the ".length;
		await (await import("../core/occurrences")).linkOccurrence(vault, a, one.id, "Philip Marlowe met the Zorblax at the harbour.", moon.id, at, at + 7);
		const out = await new BookSearch().search(vault, a, [one, two], "zorblax");
		expect(out.results.find((r) => r.chapter === "Chapter 1")?.entities).toEqual(["Zorblax Station"]);
	});

	it("never returns text from another book", async () => {
		const { vault, a, b, one, two, bone } = await setup();
		const search = new BookSearch();
		const inA = await search.search(vault, a, [one, two], "another book");
		expect(inA.results.every((r) => r.ref.bookId === a.id)).toBe(true);
		const inB = await search.search(vault, b, [bone], "zorblax");
		expect(inB.results.map((r) => r.ref.bookId)).toEqual([b.id]);
		expect(inB.results[0]?.notePath).toBe("B/one.md");
	});

	it("follows edits at once: a new word is found, a removed one is not, and a deleted note drops out", async () => {
		const { raw, vault, a, one, two } = await setup();
		const search = new BookSearch();
		expect((await search.search(vault, a, [one, two], "quasar")).results).toEqual([]);
		raw.files.set("A/one.md", "Now a quasar appears.");
		expect((await search.search(vault, a, [one, two], "quasar")).results.map((r) => r.chapter)).toEqual(["Chapter 1"]);
		expect((await search.search(vault, a, [one, two], "philip")).results).toEqual([]);
		raw.files.delete("A/two.md");
		const out = await search.search(vault, a, [one, two], "zorblax");
		expect(out.results).toEqual([]);
		expect(out.missingChapters).toEqual(["Chapter 2"]);
	});

	it("lists entities named in a passage, only those the chapter is known to contain", async () => {
		const { raw, vault, a, one, two, rnd } = await setup();
		const philip = await createEntity(vault, a, [], { type: "character", name: "Philip Marlowe" }, rnd);
		await createEntity(vault, a, [philip], { type: "place", name: "harbour" }, rnd);
		raw.files.set(`A/_book-harness/knowledge/${one.id}.md`, `---\nbh_schema: 1\nbh_type: knowledge\nbh_id: ${one.id}\n---\n\`\`\`bh-records\n${JSON.stringify({ chapterId: one.id, fingerprint: "f", sourceRevision: "r", items: [{ entityId: philip.id, kind: "character", name: "x", quote: "q", note: "" }] })}\n\`\`\`\n`);
		const out = await new BookSearch().search(vault, a, [one, two], "zorblax");
		expect(out.results.find((r) => r.chapter === "Chapter 1")?.entities).toEqual(["Philip Marlowe"]);
		expect(out.results.find((r) => r.chapter === "Chapter 2")?.entities).toEqual([]);
	});
});
