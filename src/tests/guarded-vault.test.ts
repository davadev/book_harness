import { describe, expect, it } from "vitest";
import { registerBook } from "../core/books";
import { GuardedVault, ManuscriptWriteRefused, classifyPath } from "../core/guarded-vault";
import { FakeVault, counterRandom } from "./__mocks__/fakeVault";

const PROSE = "Rain fell on the harbour.\n";

async function setup() {
	const raw = new FakeVault({ "Book/Chapter 1.md": PROSE, "Other/notes.md": "n" });
	const vault = new GuardedVault(raw);
	const book = await registerBook(vault, "Book", "Book", "en", counterRandom());
	raw.writes.length = 0;
	return { raw, vault, book };
}

describe("manuscript write guard", () => {
	it("classifies managed, manuscript and outside paths", async () => {
		const { book } = await setup();
		expect(classifyPath([book], "Book/_book-harness/book.md")).toBe("managed");
		expect(classifyPath([book], "Book/Chapter 1.md")).toBe("manuscript");
		expect(classifyPath([book], "Book/sub/image.png")).toBe("manuscript");
		expect(classifyPath([book], "Other/notes.md")).toBe("outside");
	});

	it("refuses to replace manuscript text and leaves the bytes untouched", async () => {
		const { raw, vault } = await setup();
		await expect(vault.replaceIfUnchanged("Book/Chapter 1.md", PROSE, "Changed")).rejects.toBeInstanceOf(ManuscriptWriteRefused);
		expect(raw.files.get("Book/Chapter 1.md")).toBe(PROSE);
		expect(raw.writes).toEqual([]);
	});

	it("refuses to create files among the manuscript", async () => {
		const { raw, vault } = await setup();
		await expect(vault.create("Book/New chapter.md", "x")).rejects.toThrow(/may not change manuscript text/);
		expect(raw.exists("Book/New chapter.md")).toBe(false);
	});

	it("allows writes to managed notes and to files outside any book", async () => {
		const { raw, vault } = await setup();
		await vault.create("Book/_book-harness/chapters/a.md", "a");
		expect(await vault.replaceIfUnchanged("Book/_book-harness/chapters/a.md", "a", "b")).toBe(true);
		await vault.create("Other/exports/x.md", "x");
		expect(raw.writes).toEqual(["Book/_book-harness/chapters/a.md", "Book/_book-harness/chapters/a.md", "Other/exports/x.md"]);
	});

	it("passes reads and listing through", async () => {
		const { vault } = await setup();
		expect(await vault.read("Book/Chapter 1.md")).toBe(PROSE);
		expect(vault.exists("Book/Chapter 1.md")).toBe(true);
		expect(vault.markdownPaths()).toContain("Other/notes.md");
	});
});

describe("sync-friendly writes", () => {
	it("does not write when the result is identical, but still refuses if the file changed meanwhile", async () => {
		const { raw, vault } = await setup();
		await vault.create("Book/_book-harness/x.md", "same");
		const before = raw.writes.length;
		expect(await vault.replaceIfUnchanged("Book/_book-harness/x.md", "same", "same")).toBe(true);
		expect(raw.writes.length).toBe(before);
		raw.files.set("Book/_book-harness/x.md", "edited elsewhere");
		expect(await vault.replaceIfUnchanged("Book/_book-harness/x.md", "same", "same")).toBe(false);
		expect(raw.writes.length).toBe(before);
	});
});
