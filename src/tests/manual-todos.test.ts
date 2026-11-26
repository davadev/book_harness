import { describe, expect, it } from "vitest";
import { registerBook } from "../core/books";
import { GuardedVault } from "../core/guarded-vault";
import { addManualTodo, listManualTodos, manualAsTodos, setManualTodoDone, todosPath } from "../core/manual-todos";
import { FakeVault, counterRandom } from "./__mocks__/fakeVault";

async function setup() {
	const raw = new FakeVault();
	const vault = new GuardedVault(raw);
	const book = await registerBook(vault, "Book", "Book", "en", counterRandom());
	return { raw, vault, book };
}

describe("manual to-dos", () => {
	it("starts empty, stores items as a readable Markdown task list and returns them with stable ids", async () => {
		const { raw, vault, book } = await setup();
		expect(await listManualTodos(vault, book)).toEqual([]);
		await addManualTodo(vault, book, "  Check the   map\nagainst chapter 4 ");
		await addManualTodo(vault, book, "Order the cover");
		const text = raw.files.get(todosPath(book))!;
		expect(text).toContain("- [ ] Check the map against chapter 4\n- [ ] Order the cover\n");
		const items = await listManualTodos(vault, book);
		expect(items.map((i) => [i.text, i.done])).toEqual([["Check the map against chapter 4", false], ["Order the cover", false]]);
		expect(new Set(items.map((i) => i.id)).size).toBe(2);
		expect(await listManualTodos(vault, book)).toEqual(items);
	});

	it("marks items done, hides done ones from the to-do list, and keeps ids across hand edits", async () => {
		const { raw, vault, book } = await setup();
		await addManualTodo(vault, book, "One");
		await addManualTodo(vault, book, "Two");
		const [one, two] = await listManualTodos(vault, book);
		await setManualTodoDone(vault, book, one!.id, true);
		expect(raw.files.get(todosPath(book))).toContain("- [x] One\n- [ ] Two");
		expect(manualAsTodos(await listManualTodos(vault, book))).toEqual([{ id: two!.id, kind: "manual", severity: "required", message: "Two", manualId: two!.id }]);
		raw.files.set(todosPath(book), raw.files.get(todosPath(book))!.replace("- [x] One\n- [ ] Two", "- [ ] Two\n- [x] One"));
		expect((await listManualTodos(vault, book)).find((i) => i.text === "Two")?.id).toBe(two!.id);
	});

	it("gives repeated text distinct ids", async () => {
		const { vault, book } = await setup();
		await addManualTodo(vault, book, "Same");
		await addManualTodo(vault, book, "Same");
		const ids = (await listManualTodos(vault, book)).map((i) => i.id);
		expect(new Set(ids).size).toBe(2);
	});

	it("refuses empty text, unknown ids and a list changed on another device", async () => {
		const { raw, vault, book } = await setup();
		await expect(addManualTodo(vault, book, "   ")).rejects.toThrow(/needs some text/);
		await addManualTodo(vault, book, "One");
		await expect(setManualTodoDone(vault, book, "manual:nope", true)).rejects.toThrow(/no longer exists/);
		raw.replaceIfUnchanged = () => Promise.resolve(false);
		await expect(addManualTodo(vault, book, "Two")).rejects.toThrow(/another device/);
	});

	it("ignores lines that are not task items, so hand-written notes survive", async () => {
		const { raw, vault, book } = await setup();
		await addManualTodo(vault, book, "One");
		raw.files.set(todosPath(book), raw.files.get(todosPath(book))! + "\nSome note I wrote.\n- plain bullet\n");
		expect((await listManualTodos(vault, book)).map((i) => i.text)).toEqual(["One"]);
	});

	it.each([
		["a different note type", "bh_schema: 1\nbh_type: book\nbh_id: x\nbh_book: BOOK", /not the to-do list/],
		["a newer schema", "bh_schema: 9\nbh_type: todos\nbh_id: x\nbh_book: BOOK", /newer Book Harness/],
		["another book", "bh_schema: 1\nbh_type: todos\nbh_id: x\nbh_book: bk_other", /different book/],
	])("reports %s instead of treating it as empty", async (_n, fm, reason) => {
		const { raw, vault, book } = await setup();
		raw.files.set(todosPath(book), `---\n${fm.replace("BOOK", book.id)}\n---\n- [ ] x\n`);
		await expect(listManualTodos(vault, book)).rejects.toThrow(reason);
	});
});
