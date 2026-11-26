import { describe, expect, it } from "vitest";
import { registerBook } from "../core/books";
import { addChapter } from "../core/chapters";
import { createEntity, type Entity } from "../core/entities";
import { GuardedVault } from "../core/guarded-vault";
import { anchorOf, entitiesForChapter, findOccurrences, linkOccurrence, loadCorrections, occurrencesPath, removeOccurrence } from "../core/occurrences";
import { FakeVault, counterRandom } from "./__mocks__/fakeVault";

const ent = (id: string, name: string, aliases: string[] = [], over: Partial<Entity> = {}): Entity => ({ id, bookId: "b", type: "character", name, aliases, mergedInto: null, origin: "author", distinctFrom: [], archived: false, path: id, body: "", ...over });
const TEXT = "---\ntitle: Philip\n---\nPhilip Marlowe met Anna. Marlowe smiled; Phil did not. Annabelle left. Zoë and zoë.";

describe("findOccurrences", () => {
	const entities = [ent("p", "Philip Marlowe", ["Marlowe", "Phil"]), ent("a", "Anna"), ent("z", "Zoë")];

	it("finds whole-word mentions by exact name or alias, longest first, never inside other words or the properties", () => {
		const occ = findOccurrences(TEXT, entities);
		expect(occ.map((o) => [o.entityId, o.text])).toEqual([["p", "Philip Marlowe"], ["a", "Anna"], ["p", "Marlowe"], ["p", "Phil"], ["z", "Zoë"], ["z", "zoë"]]);
		expect(occ.every((o) => TEXT.slice(o.from, o.to) === o.text && o.source === "name")).toBe(true);
		expect(occ.some((o) => o.text === "Annabelle")).toBe(false);
	});

	it("does not look at text it cannot match: empty names and no entities", () => {
		expect(findOccurrences(TEXT, [])).toEqual([]);
		expect(findOccurrences(TEXT, [ent("e", "  ", [""])])).toEqual([]);
	});

	it("treats spaces in a name as any run of whitespace and escapes punctuation", () => {
		const occ = findOccurrences("Dr. Who\nwent. Dr.  Who left.", [ent("d", "Dr. Who")]);
		expect(occ.map((o) => o.text)).toEqual(["Dr. Who", "Dr.  Who"]);
	});

	it("recomputes from the current text, so edits can never leave a highlight on the wrong words", () => {
		const edited = "Intro. " + TEXT.replace("Anna", "Bella");
		const occ = findOccurrences(edited, entities);
		expect(occ.map((o) => o.text)).not.toContain("Bella");
		for (const o of occ) expect(edited.slice(o.from, o.to)).toBe(o.text);
	});

	it("honours a removed highlight (found again by its surroundings) and a manual link", () => {
		const first = findOccurrences(TEXT, entities);
		const marlowe = first.find((o) => o.text === "Marlowe")!;
		const removed = [anchorOf(TEXT, "p", marlowe.from, marlowe.to)];
		expect(findOccurrences(TEXT, entities, { removed, manual: [] }).map((o) => o.text)).not.toContain("Marlowe");
		const shifted = "A new first line.\n" + TEXT;
		expect(findOccurrences(shifted, entities, { removed, manual: [] }).filter((o) => o.text === "Marlowe")).toHaveLength(0);
		expect(findOccurrences(shifted, entities, { removed, manual: [] }).filter((o) => o.text === "Philip Marlowe")).toHaveLength(1);
		const smiled = TEXT.indexOf("smiled");
		const manual = [anchorOf(TEXT, "a", smiled, smiled + 6)];
		const withManual = findOccurrences(TEXT, entities, { removed: [], manual });
		expect(withManual.find((o) => o.source === "manual")).toMatchObject({ entityId: "a", text: "smiled" });
		expect(findOccurrences(TEXT.replace("smiled", "frowned"), entities, { removed: [], manual }).some((o) => o.source === "manual")).toBe(false);
		const overlapping = [anchorOf(TEXT, "a", TEXT.indexOf("Anna"), TEXT.indexOf("Anna") + 4)];
		expect(findOccurrences(TEXT, entities, { removed: [], manual: overlapping }).filter((o) => o.source === "manual")).toEqual([]);
		const inProps = [anchorOf(TEXT, "a", 11, 17)];
		expect(findOccurrences(TEXT, entities, { removed: [], manual: inProps }).filter((o) => o.source === "manual")).toEqual([]);
	});

	it("never guesses between two identical places in the text", () => {
		const pad = "z".repeat(30);
		const twice = `${pad} Anna ${pad}\n${pad} Anna ${pad}`;
		const first = twice.indexOf("Anna");
		const a = anchorOf(twice, "a", first, first + 4);
		expect(findOccurrences(twice, [ent("a", "Anna")], { removed: [a], manual: [] })).toHaveLength(2);
	});
});

describe("which entities a chapter supports", () => {
	it("follows merges to the survivor and skips archived or unknown ones", () => {
		const all = [ent("a", "Anna", [], { mergedInto: "b" }), ent("b", "Anne"), ent("c", "Cleo", [], { archived: true }), ent("d", "Dora")];
		expect(entitiesForChapter(all, ["a", "b", "c", "d", "zzz", "d"]).map((e) => e.id)).toEqual(["b", "d"]);
		expect(entitiesForChapter(all, [])).toEqual([]);
	});
});

describe("stored corrections", () => {
	async function setup() {
		const raw = new FakeVault({ "Book/one.md": TEXT });
		const vault = new GuardedVault(raw);
		const rnd = counterRandom();
		const book = await registerBook(vault, "Book", "Book", "en", rnd);
		const chapter = await addChapter(vault, book, [], { designation: "Chapter 1", notePath: "Book/one.md" }, rnd);
		const anna = await createEntity(vault, book, [], { type: "character", name: "Anna" }, rnd);
		return { raw, vault, book, chapter, anna };
	}

	it("remembers a removal and a manual link without touching the chapter, and undoes them", async () => {
		const { raw, vault, book, chapter, anna } = await setup();
		expect(await loadCorrections(vault, book, chapter.id)).toEqual({ removed: [], manual: [] });
		const auto = findOccurrences(TEXT, [anna]).find((o) => o.text === "Anna")!;
		await removeOccurrence(vault, book, chapter.id, TEXT, auto);
		await removeOccurrence(vault, book, chapter.id, TEXT, auto);
		expect((await loadCorrections(vault, book, chapter.id)).removed).toHaveLength(1);
		const at = TEXT.indexOf("smiled");
		await linkOccurrence(vault, book, chapter.id, TEXT, anna.id, at, at + 6);
		await linkOccurrence(vault, book, chapter.id, TEXT, anna.id, at, at + 6);
		let c = await loadCorrections(vault, book, chapter.id);
		expect(c.manual).toHaveLength(1);
		const live = findOccurrences(TEXT, [anna], c);
		expect(live.map((o) => [o.text, o.source])).toEqual([["smiled", "manual"]]);
		await removeOccurrence(vault, book, chapter.id, TEXT, live[0]!);
		c = await loadCorrections(vault, book, chapter.id);
		expect(c.manual).toEqual([]);
		await linkOccurrence(vault, book, chapter.id, TEXT, anna.id, auto.from, auto.to);
		expect((await loadCorrections(vault, book, chapter.id)).removed).toEqual([]);
		expect(raw.files.get("Book/one.md")).toBe(TEXT);
		expect(raw.files.has(occurrencesPath(book, chapter.id))).toBe(true);
	});

	it("refuses an empty selection and a changed note", async () => {
		const { raw, vault, book, chapter, anna } = await setup();
		await expect(linkOccurrence(vault, book, chapter.id, TEXT, anna.id, 5, 5)).rejects.toThrow(/Select the words/);
		await expect(linkOccurrence(vault, book, chapter.id, TEXT, anna.id, 0, 999)).rejects.toThrow(/Select the words/);
		await linkOccurrence(vault, book, chapter.id, TEXT, anna.id, 20, 24);
		raw.replaceIfUnchanged = () => Promise.resolve(false);
		await expect(linkOccurrence(vault, book, chapter.id, TEXT, anna.id, 30, 34)).rejects.toThrow(/another device/);
	});

	it.each([
		["a different note type", "bh_schema: 1\nbh_type: book\nbh_id: x", "", /not occurrence corrections/],
		["a newer schema", "bh_schema: 9\nbh_type: occurrences\nbh_id: x", "", /newer Book Harness/],
		["no records", "bh_schema: 1\nbh_type: occurrences\nbh_id: x", "text", /no records block/],
		["broken JSON", "bh_schema: 1\nbh_type: occurrences\nbh_id: x", "```bh-records\n{oops\n```", /not valid JSON/],
	])("reports corrections that are %s", async (_n, fm, body, reason) => {
		const { raw, vault, book, chapter } = await setup();
		raw.files.set(occurrencesPath(book, chapter.id), `---\n${fm}\n---\n${body}`);
		await expect(loadCorrections(vault, book, chapter.id)).rejects.toThrow(reason);
	});

	it("tolerates unusable fields", async () => {
		const { raw, vault, book, chapter } = await setup();
		raw.files.set(occurrencesPath(book, chapter.id), `---\nbh_schema: 1\nbh_type: occurrences\nbh_id: x\n---\n\`\`\`bh-records\n{"removed": "x", "manual": [null, {"entityId": 1}, {"entityId":"e","text":"t","before":"","after":""}]}\n\`\`\``);
		expect(await loadCorrections(vault, book, chapter.id)).toEqual({ removed: [], manual: [{ entityId: "e", text: "t", before: "", after: "" }] });
		raw.files.set(occurrencesPath(book, chapter.id), `---\nbh_schema: 1\nbh_type: occurrences\nbh_id: x\n---\n\`\`\`bh-records\nnull\n\`\`\``);
		expect(await loadCorrections(vault, book, chapter.id)).toEqual({ removed: [], manual: [] });
	});
});
