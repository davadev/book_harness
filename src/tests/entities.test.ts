import { describe, expect, it } from "vitest";
import { registerBook } from "../core/books";
import { activeEntities, addAlias, archiveEntity, createEntity, entityPath, isEntityType, listAllEntities, mergeEntities, nameKey, removeAlias, renameEntity, splitEntity, type Entity } from "../core/entities";
import { GuardedVault } from "../core/guarded-vault";
import { FakeVault, counterRandom } from "./__mocks__/fakeVault";

async function setup() {
	const raw = new FakeVault({ "Book/one.md": "Philip met Phil." });
	const vault = new GuardedVault(raw);
	const rnd = counterRandom();
	const book = await registerBook(vault, "Book", "Book", "en", rnd);
	let all: Entity[] = [];
	const add = async (type: string, name: string, aliases: string[] = []) => {
		const e = await createEntity(vault, book, all, { type, name, aliases }, rnd);
		all = [...all, e];
		return e;
	};
	const reload = async () => (all = (await listAllEntities(vault, book)).entities);
	return { raw, vault, book, rnd, add, reload, all: () => all };
}

describe("creating entities", () => {
	it("stores a readable note and keeps the manuscript untouched", async () => {
		const { raw, add, book } = await setup();
		const philip = await add("character", "  Philip   Marlowe ", ["Phil", "phil", "Philip Marlowe"]);
		expect(philip).toMatchObject({ name: "Philip Marlowe", aliases: ["Phil"], mergedInto: null, archived: false, type: "character" });
		expect(philip.path).toBe(entityPath(book, "character", philip.id));
		expect(raw.files.get(philip.path)).toContain("name: Philip Marlowe");
		expect(raw.files.get(philip.path)).toContain("## Description");
		expect(raw.files.get("Book/one.md")).toBe("Philip met Phil.");
		expect(raw.writes.every((p) => p.startsWith("Book/_book-harness/"))).toBe(true);
	});

	it("refuses blank names, bad types and any name already taken by another entity", async () => {
		const { add, vault, book, rnd, all } = await setup();
		await add("character", "Philip", ["Phil"]);
		const make = (req: { type: string; name: string; aliases?: string[] }) => createEntity(vault, book, all(), req, rnd);
		await expect(make({ type: "character", name: "  " })).rejects.toThrow(/needs a name/);
		await expect(make({ type: "Character!", name: "X" })).rejects.toThrow(/Entity type must be/);
		await expect(make({ type: "character", name: "philip" })).rejects.toThrow(/already belongs to Philip \(character\).*Merge/);
		await expect(make({ type: "place", name: "Phil" })).rejects.toThrow(/already belongs to Philip/);
		await expect(make({ type: "place", name: "Dock", aliases: ["PHIL"] })).rejects.toThrow(/already belongs to Philip/);
		expect(isEntityType("spacecraft")).toBe(true);
		expect(isEntityType("x")).toBe(false);
	});

	it("compares names without regard to case, spacing or how accents are encoded", () => {
		expect(nameKey("  Zo\u0065\u0308  ")).toBe(nameKey("Zoë"));
		expect(nameKey("PHILIP   Marlowe")).toBe(nameKey("philip marlowe"));
	});

});

describe("renaming and aliases", () => {
	it("keeps the old name as an alias and refuses names that belong to others", async () => {
		const { add, vault, all, reload } = await setup();
		const philip = await add("character", "Philip", ["Phil"]);
		await add("character", "Anna");
		const renamed = await renameEntity(vault, all(), philip, "Philip Marlowe");
		expect(renamed).toMatchObject({ name: "Philip Marlowe", aliases: ["Phil", "Philip"] });
		await expect(renameEntity(vault, all(), renamed, "Anna")).rejects.toThrow(/already belongs to Anna/);
		await expect(renameEntity(vault, all(), renamed, " ")).rejects.toThrow(/needs a name/);
		expect((await renameEntity(vault, all(), renamed, "PHILIP MARLOWE")).name).toBe("PHILIP MARLOWE");
		const back = await renameEntity(vault, all(), renamed, "Philip");
		expect(back.aliases).toEqual(["Phil", "Philip Marlowe"]);
		await reload();
		expect(all().find((e) => e.id === philip.id)?.name).toBe("Philip");
	});

	it("adds and removes aliases, ignoring repeats and refusing taken ones", async () => {
		const { add, vault, all } = await setup();
		const philip = await add("character", "Philip");
		await add("character", "Anna");
		const a = await addAlias(vault, all(), philip, " Phil ");
		expect(a.aliases).toEqual(["Phil"]);
		expect(await addAlias(vault, all(), a, "phil")).toBe(a);
		expect(await addAlias(vault, all(), a, "PHILIP")).toBe(a);
		await expect(addAlias(vault, all(), a, "anna")).rejects.toThrow(/already belongs to Anna/);
		await expect(addAlias(vault, all(), a, "  ")).rejects.toThrow(/cannot be empty/);
		expect((await removeAlias(vault, a, "PHIL")).aliases).toEqual([]);
	});

	it("refuses to overwrite a note changed on another device", async () => {
		const { raw, add, vault, all } = await setup();
		const philip = await add("character", "Philip");
		raw.replaceIfUnchanged = () => Promise.resolve(false);
		await expect(addAlias(vault, all(), philip, "Phil")).rejects.toThrow(/changed on another device/);
	});

	it("preserves everything the author wrote in the note", async () => {
		const { raw, add, vault, all, book } = await setup();
		const philip = await add("character", "Philip");
		raw.files.set(philip.path, raw.files.get(philip.path)! + "\nMy own research notes.\n");
		const fresh = (await listAllEntities(vault, book)).entities[0]!;
		await addAlias(vault, all(), fresh, "Phil");
		expect(raw.files.get(philip.path)).toContain("My own research notes.");
		expect(raw.files.get(philip.path)).toContain("- Phil");
	});
});

describe("merge, split and archive", () => {
	it("merges two entities: the survivor gains the names and the merged one redirects", async () => {
		const { add, vault, all, reload } = await setup();
		const a = await add("character", "Philip", ["Phil"]);
		const b = await add("character", "P. Marlowe", ["Marlowe"]);
		const survivor = await mergeEntities(vault, b, a);
		expect(survivor.aliases).toEqual(["Phil", "P. Marlowe", "Marlowe"]);
		await reload();
		expect(all().find((e) => e.id === b.id)).toMatchObject({ mergedInto: a.id, aliases: [] });
		expect(activeEntities(all()).map((e) => e.id)).toEqual([a.id]);
	});

	it("refuses to merge an entity with itself or with a different kind of thing", async () => {
		const { add, vault } = await setup();
		const a = await add("character", "A");
		const p = await add("place", "Harbour");
		await expect(mergeEntities(vault, a, a)).rejects.toThrow(/different entity/);
		await expect(mergeEntities(vault, a, p)).rejects.toThrow(/different kinds of thing/);
	});

	it("splits chosen names into a new entity and refuses names it does not have", async () => {
		const { add, vault, book, rnd, all } = await setup();
		const a = await add("character", "Philip", ["Phil", "Old Phil"]);
		const { source, created } = await splitEntity(vault, book, all(), a, { name: "Old Phil", aliases: ["Old Phil"] }, rnd);
		expect(source.aliases).toEqual(["Phil"]);
		expect(created).toMatchObject({ name: "Old Phil", type: "character", aliases: [] });
		await expect(splitEntity(vault, book, all(), a, { name: "X", aliases: ["Nobody"] }, rnd)).rejects.toThrow(/only move names/);
	});

	it("archives without deleting the note and frees the names", async () => {
		const { raw, add, vault, book, rnd, all, reload } = await setup();
		const a = await add("character", "Philip");
		await archiveEntity(vault, a);
		await reload();
		expect(raw.files.has(a.path)).toBe(true);
		expect(activeEntities(all())).toEqual([]);
		await expect(createEntity(vault, book, all(), { type: "character", name: "Philip" }, rnd)).resolves.toMatchObject({ name: "Philip" });
	});
});

describe("stored entities", () => {
	it.each([
		["a different note type", "bh_schema: 1\nbh_type: book\nbh_id: x", /not an entity/],
		["a newer schema", "bh_schema: 9\nbh_type: entity\nbh_id: x", /newer Book Harness/],
		["a bad id", "bh_schema: 1\nbh_type: entity\nbh_id: nope", /id is invalid/],
		["another book", "bh_schema: 1\nbh_type: entity\nbh_id: en_aaaaaaaaaaaaaaaa\nbh_book: bk_other", /different book/],
		["a bad type", "bh_schema: 1\nbh_type: entity\nbh_id: en_aaaaaaaaaaaaaaaa\nbh_book: BOOK\nentity_type: Bad!", /type is invalid/],
		["no name", "bh_schema: 1\nbh_type: entity\nbh_id: en_aaaaaaaaaaaaaaaa\nbh_book: BOOK\nentity_type: place", /name is missing/],
		["bad aliases", "bh_schema: 1\nbh_type: entity\nbh_id: en_aaaaaaaaaaaaaaaa\nbh_book: BOOK\nentity_type: place\nname: X\naliases: 5", /aliases are invalid/],
		["a bad merge target", "bh_schema: 1\nbh_type: entity\nbh_id: en_aaaaaaaaaaaaaaaa\nbh_book: BOOK\nentity_type: place\nname: X\nmerged_into: nope", /merge target is invalid/],
	])("reports %s", async (_n, fm, reason) => {
		const { raw, vault, book } = await setup();
		raw.files.set("Book/_book-harness/entities/place/en_zzzzzzzzzzzzzzzz.md", `---\n${fm.replace("BOOK", book.id)}\n---\n`);
		const { entities, problems } = await listAllEntities(vault, book);
		expect(entities).toEqual([]);
		expect(problems[0]).toMatch(reason);
	});

	it("flags duplicate ids from sync copies and unreadable files, and tolerates missing optional properties", async () => {
		const { raw, vault, book, add } = await setup();
		const a = await add("place", "Harbour");
		raw.files.set(a.path.replace(".md", " (conflicted copy).md"), raw.files.get(a.path)!);
		const minimal = `---\nbh_schema: 1\nbh_type: entity\nbh_id: en_bbbbbbbbbbbbbbbb\nbh_book: ${book.id}\nentity_type: object\nname: Lamp\n---\n`;
		raw.files.set("Book/_book-harness/entities/object/en_bbbbbbbbbbbbbbbb.md", minimal);
		const { entities, problems } = await listAllEntities(vault, book);
		expect(entities.map((e) => e.name).sort()).toEqual(["Harbour", "Lamp"]);
		expect(entities.find((e) => e.name === "Lamp")).toMatchObject({ aliases: [], mergedInto: null, archived: false });
		expect(problems[0]).toMatch(/Duplicate entity id/);
		raw.read = () => Promise.reject("io");
		expect((await listAllEntities(vault, book)).problems[0]).toContain(": io");
	});
});
