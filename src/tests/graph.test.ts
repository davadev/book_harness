import { describe, expect, it } from "vitest";
import { registerBook } from "../core/books";
import { addChapter } from "../core/chapters";
import { createEntity, type Entity } from "../core/entities";
import { GuardedVault } from "../core/guarded-vault";
import { DEFAULT_BUDGET, KnowledgeGraph, buildGraph, expandPassage, nodeId, type GraphInput } from "../core/graph";
import { BookSearch } from "../core/search";
import { FakeVault, counterRandom } from "./__mocks__/fakeVault";

const ent = (id: string, name: string, type = "character"): Entity => ({ id, bookId: "b", type, name, aliases: [], mergedInto: null, origin: "author", distinctFrom: [], archived: false, path: id, body: "" });
const item = (entityId: string, note: string, quote = "q") => ({ entityId, kind: "character" as const, name: "n", quote, note });

function input(over: Partial<GraphInput> = {}): GraphInput {
	return {
		chaptersInOrder: [{ id: "c1", designation: "Chapter 1" }, { id: "c2", designation: "Chapter 2" }],
		passages: [{ chapterId: "c1", passageId: "p1", start: 0, end: 50 }, { chapterId: "c2", passageId: "p2", start: 0, end: 50 }],
		entities: [ent("a", "Anna"), ent("p", "Philip"), ent("h", "Harbour", "place")],
		mentions: [
			{ chapterId: "c1", entityId: "a", from: 0, to: 4, source: "name" },
			{ chapterId: "c1", entityId: "p", from: 10, to: 16, source: "manual" },
			{ chapterId: "c2", entityId: "a", from: 0, to: 4, source: "name" },
		],
		evidence: [{ chapterId: "c1", fingerprint: "f", sourceRevision: "r", items: [item("a", "Speaks.", "said Anna")] }, { chapterId: "c2", fingerprint: "f", sourceRevision: "r", items: [item("a", "Returns.", "Anna returned")] }],
		...over,
	};
}

describe("knowledge graph", () => {
	it("records what is observed and marks what is only inferred, with the basis for each", () => {
		const g = buildGraph(input());
		const types = (t: string) => g.edges.filter((e) => e.type === t);
		expect(types("precedes")).toHaveLength(1);
		expect(types("contains")).toHaveLength(2);
		expect(types("mentions").map((e) => [e.to, e.basis])).toEqual([[nodeId.entity("a"), "exact name in the text"], [nodeId.entity("p"), "linked by the author"], [nodeId.entity("a"), "exact name in the text"]]);
		expect(types("evidenced_in")).toHaveLength(2);
		expect(types("evidenced_in")[0]?.basis).toContain("said Anna");
		const co = types("co_occurs");
		expect(co).toHaveLength(1);
		expect(co[0]).toMatchObject({ provenance: "inferred" });
		expect(co[0]?.basis).toContain("does not say how they are related");
		expect(g.edges.filter((e) => e.type !== "co_occurs").every((e) => e.provenance === "observed")).toBe(true);
	});

	it("counts repeated co-occurrence and orders history even for a chapter the registry lost", () => {
		const more = input({
			passages: [{ chapterId: "c1", passageId: "p1", start: 0, end: 50 }, { chapterId: "c1", passageId: "p9", start: 60, end: 120 }],
			mentions: [
				{ chapterId: "c1", entityId: "a", from: 0, to: 4, source: "name" },
				{ chapterId: "c1", entityId: "p", from: 10, to: 16, source: "name" },
				{ chapterId: "c1", entityId: "a", from: 60, to: 64, source: "name" },
				{ chapterId: "c1", entityId: "p", from: 70, to: 76, source: "name" },
			],
			evidence: [{ chapterId: "gone", fingerprint: "f", sourceRevision: "r", items: [item("a", "Old.")] }, { chapterId: "c2", fingerprint: "f", sourceRevision: "r", items: [item("a", "Later.")] }, { chapterId: "c1", fingerprint: "f", sourceRevision: "r", items: [item("a", "First.")] }],
		});
		const g = buildGraph(more);
		expect(g.edges.find((e) => e.type === "co_occurs")?.basis).toContain("2 times");
		const ctx = expandPassage(g, more, { chapterId: "c1", passageId: "p1" });
		expect(ctx.entities.find((e) => e.name === "Anna")?.history.map((h) => h.note)).toEqual(["Old.", "First.", "Later."]);
	});

	it("walks neighbours in both directions, limited by edge type, and skips dangling edges", () => {
		const g = new KnowledgeGraph();
		g.addNode({ id: "x", kind: "entity", label: "X" });
		g.addNode({ id: "y", kind: "entity", label: "Y" });
		g.addEdge({ from: "x", to: "y", type: "co_occurs", provenance: "inferred", basis: "b" });
		g.addEdge({ from: "x", to: "y", type: "co_occurs", provenance: "inferred", basis: "b" });
		g.addEdge({ from: "x", to: "gone", type: "mentions", provenance: "observed", basis: "b" });
		expect(g.edges).toHaveLength(2);
		expect(g.neighbors("y").map((n) => n.node.id)).toEqual(["x"]);
		expect(g.neighbors("x", ["mentions"])).toEqual([]);
		expect(g.neighbors("x", ["co_occurs"]).map((n) => n.node.id)).toEqual(["y"]);
	});

	it("expands a passage to its entities with their history in reading order, and who else is named", () => {
		const i = input();
		const ctx = expandPassage(buildGraph(i), i, { chapterId: "c1", passageId: "p1" });
		expect(ctx.truncated).toBe(false);
		const anna = ctx.entities.find((e) => e.name === "Anna")!;
		expect(anna.history.map((h) => [h.chapter, h.note])).toEqual([["Chapter 1", "Speaks."], ["Chapter 2", "Returns."]]);
		expect(anna.alsoNamed.map((a) => a.name)).toEqual(["Philip"]);
		expect(anna.provenance).toEqual(["observed", "inferred"]);
		const philip = ctx.entities.find((e) => e.name === "Philip")!;
		expect(philip.history).toEqual([]);
		expect(philip.provenance).toEqual(["observed", "inferred"]);
		const solo = expandPassage(buildGraph(i), i, { chapterId: "c2", passageId: "p2" });
		expect(solo.entities[0]?.provenance).toEqual(["observed"]);
		expect(solo.entities[0]?.alsoNamed).toEqual([]);
	});

	it("never exceeds its budget and says when it cut something off", () => {
		const many = Array.from({ length: 10 }, (_, k) => ent(`e${k}`, `Name ${k}`));
		const i = input({ entities: many, mentions: many.map((e, k) => ({ chapterId: "c1", entityId: e.id, from: k, to: k + 1, source: "name" as const })), evidence: [] });
		const ctx = expandPassage(buildGraph(i), i, { chapterId: "c1", passageId: "p1" });
		expect(ctx.entities).toHaveLength(DEFAULT_BUDGET.maxEntities);
		expect(ctx.truncated).toBe(true);
		const items = Array.from({ length: 9 }, (_, k) => item("a", `note ${k}`));
		const j = input({ evidence: [{ chapterId: "c1", fingerprint: "f", sourceRevision: "r", items }] });
		const ctx2 = expandPassage(buildGraph(j), j, { chapterId: "c1", passageId: "p1" }, { maxEntities: 3, maxHistoryPerEntity: 4, maxChars: 10_000 });
		expect(ctx2.entities.find((e) => e.name === "Anna")?.history).toHaveLength(4);
		expect(ctx2.truncated).toBe(true);
		const k = input({ evidence: [{ chapterId: "c1", fingerprint: "f", sourceRevision: "r", items: [item("a", "x".repeat(50)), item("a", "y".repeat(50))] }] });
		const ctx3 = expandPassage(buildGraph(k), k, { chapterId: "c1", passageId: "p1" }, { maxEntities: 3, maxHistoryPerEntity: 4, maxChars: 80 });
		expect(ctx3.entities.find((e) => e.name === "Anna")?.history).toHaveLength(1);
		expect(ctx3.truncated).toBe(true);
	});

	it("names a chapter by id when the registry no longer has it, and gives nothing for a passage with no entities", () => {
		const i = input({ evidence: [{ chapterId: "gone", fingerprint: "f", sourceRevision: "r", items: [item("a", "Old.")] }] });
		const ctx = expandPassage(buildGraph(i), i, { chapterId: "c1", passageId: "p1" });
		expect(ctx.entities.find((e) => e.name === "Anna")?.history[0]?.chapter).toBe("gone");
		const empty = input({ mentions: [] });
		expect(expandPassage(buildGraph(empty), empty, { chapterId: "c1", passageId: "p1" }).entities).toEqual([]);
	});
});

describe("context from the book's records", () => {
	it("builds the graph from the notes and expands a search hit", async () => {
		const raw = new FakeVault({ "A/one.md": "Anna met Philip at the harbour.", "A/two.md": "Anna came back alone." });
		const vault = new GuardedVault(raw);
		const rnd = counterRandom();
		const book = await registerBook(vault, "A", "A", "en", rnd);
		const one = await addChapter(vault, book, [], { designation: "Chapter 1", notePath: "A/one.md" }, rnd);
		const two = await addChapter(vault, book, [one], { designation: "Chapter 2", notePath: "A/two.md" }, rnd);
		const anna = await createEntity(vault, book, [], { type: "character", name: "Anna" }, rnd);
		const philip = await createEntity(vault, book, [anna], { type: "character", name: "Philip" }, rnd);
		const ev = (c: string, ids: Array<[string, string]>) => `---\nbh_schema: 1\nbh_type: knowledge\nbh_id: ${c}\n---\n\`\`\`bh-records\n${JSON.stringify({ chapterId: c, fingerprint: "f", sourceRevision: "r", items: ids.map(([id, note]) => ({ entityId: id, kind: "character", name: "n", quote: "q", note })) })}\n\`\`\`\n`;
		raw.files.set(`A/_book-harness/knowledge/${one.id}.md`, ev(one.id, [[anna.id, "Meets Philip."], [philip.id, "Meets Anna."]]));
		raw.files.set(`A/_book-harness/knowledge/${two.id}.md`, ev(two.id, [[anna.id, "Returns."]]));
		const search = new BookSearch();
		const out = await search.search(vault, book, [one, two], "harbour");
		const ctx = await search.context(vault, book, [one, two], out.results[0]!.ref);
		const a = ctx.entities.find((e) => e.name === "Anna")!;
		expect(a.history.map((h) => h.note)).toEqual(["Meets Philip.", "Returns."]);
		const handLinked = await createEntity(vault, book, [anna, philip], { type: "place", name: "Quay" }, rnd);
		const at = "Anna met Philip at the ".length;
		await (await import("../core/occurrences")).linkOccurrence(vault, book, one.id, "Anna met Philip at the harbour.", handLinked.id, at, at + 7);
		const again = await search.context(vault, book, [one, two], out.results[0]!.ref);
		expect(again.entities.map((e) => e.name)).toContain("Quay");
		expect(a.alsoNamed.map((x) => x.name)).toEqual(["Philip"]);
		expect(ctx.truncated).toBe(false);
	});
});
