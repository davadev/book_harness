import { describe, expect, it } from "vitest";
import { bookForPath, bookNotePath, isLanguageCode, listBooks, registerBook } from "../core/books";
import { FakeVault, counterRandom } from "./__mocks__/fakeVault";

const MANUSCRIPT = "My Book/Chapter one.md";

describe("book registration", () => {
	it("creates only the configuration note and leaves manuscripts untouched", async () => {
		const vault = new FakeVault({ [MANUSCRIPT]: "Prose.\n" });
		const book = await registerBook(vault, "My Book", "  My Book ", "en", counterRandom());
		expect(book).toMatchObject({ folder: "My Book", title: "My Book", primaryLanguage: "en", targetLanguages: [] });
		expect(vault.writes).toEqual([bookNotePath("My Book")]);
		expect(vault.files.get(MANUSCRIPT)).toBe("Prose.\n");
	});

	it("refuses a second registration, a blank title and a bad language", async () => {
		const vault = new FakeVault();
		await registerBook(vault, "A", "A", "en", counterRandom());
		await expect(registerBook(vault, "A", "A", "en", counterRandom())).rejects.toThrow(/already registered/);
		await expect(registerBook(vault, "B", "   ", "en", counterRandom())).rejects.toThrow(/title/);
		await expect(registerBook(vault, "B", "B", "English!", counterRandom())).rejects.toThrow(/language code/);
	});

	it("validates language codes", () => {
		expect(["en", "de", "cs", "sk", "pt-BR", "zh-Hant"].every(isLanguageCode)).toBe(true);
		expect(["", "E", "english1", "en_", 5].some(isLanguageCode)).toBe(false);
	});
});

describe("book discovery and isolation", () => {
	it("finds two books and keeps their paths apart, even for identical note names", async () => {
		const vault = new FakeVault({ "A/Chapter 1.md": "a", "B/Chapter 1.md": "b" });
		const rnd = counterRandom();
		await registerBook(vault, "A", "Alpha", "en", rnd);
		await registerBook(vault, "B", "Beta", "de", rnd);
		const { books, problems } = await listBooks(vault);
		expect(problems).toEqual([]);
		expect(books.map((b) => [b.title, b.folder])).toEqual([["Alpha", "A"], ["Beta", "B"]]);
		expect(bookForPath(books, "A/Chapter 1.md")?.title).toBe("Alpha");
		expect(bookForPath(books, "B/Chapter 1.md")?.title).toBe("Beta");
		expect(bookForPath(books, "C/Chapter 1.md")).toBeUndefined();
		expect(bookForPath(books, "AB/x.md")).toBeUndefined();
		expect(bookForPath(books, "A")?.title).toBe("Alpha");
	});

	it("prefers the deepest folder for nested books found in the vault", async () => {
		const note = (id: string, title: string) => `---\nbh_schema: 1\nbh_type: book\nbh_id: ${id}\ntitle: ${title}\nprimary_language: en\n---\n`;
		const vault = new FakeVault({
			"Series/_book-harness/book.md": note("bk_aaaaaaaaaaaaaaaa", "Series"),
			"Series/Vol 1/_book-harness/book.md": note("bk_bbbbbbbbbbbbbbbb", "Vol 1"),
		});
		const { books } = await listBooks(vault);
		expect(bookForPath(books, "Series/Vol 1/c.md")?.title).toBe("Vol 1");
		expect(bookForPath(books, "Series/other.md")?.title).toBe("Series");
	});

	it("refuses to nest a new book inside or around an existing one", async () => {
		const vault = new FakeVault();
		const rnd = counterRandom();
		await registerBook(vault, "Series/Vol 1", "Vol 1", "en", rnd);
		await expect(registerBook(vault, "Series/Vol 1/Part", "Part", "en", rnd)).rejects.toThrow(/inside the book "Vol 1"/);
		await expect(registerBook(vault, "Series", "Series", "en", rnd)).rejects.toThrow(/contains the book "Vol 1"/);
		await expect(registerBook(vault, "Series/Vol 2", "Vol 2", "en", rnd)).resolves.toMatchObject({ title: "Vol 2" });
	});

	it("treats a missing target language list as empty", async () => {
		const vault = new FakeVault({ "A/_book-harness/book.md": `---\nbh_schema: 1\nbh_type: book\nbh_id: bk_aaaaaaaaaaaaaaaa\ntitle: T\nprimary_language: en\n---\n` });
		expect((await listBooks(vault)).books[0]?.targetLanguages).toEqual([]);
	});

	it("reports invalid configuration notes instead of hiding them", async () => {
		const good = (id: string, extra = "") => `---\nbh_schema: 1\nbh_type: book\nbh_id: ${id}\ntitle: T\nprimary_language: en\n${extra}---\n`;
		const vault = new FakeVault({
			"X/_book-harness/book.md": "no frontmatter",
			"Y/_book-harness/book.md": `---\nbh_schema: 9\nbh_type: book\nbh_id: bk_aaaaaaaaaaaaaaaa\n---\n`,
			"Z/_book-harness/book.md": `---\nbh_schema: 1\nbh_type: chapter\nbh_id: bk_aaaaaaaaaaaaaaaa\n---\n`,
			"I/_book-harness/book.md": good("not-an-id"),
			"T/_book-harness/book.md": `---\nbh_schema: 1\nbh_type: book\nbh_id: bk_aaaaaaaaaaaaaaaa\ntitle: " "\nprimary_language: en\n---\n`,
			"L/_book-harness/book.md": `---\nbh_schema: 1\nbh_type: book\nbh_id: bk_aaaaaaaaaaaaaaaa\ntitle: T\nprimary_language: ""\n---\n`,
			"G/_book-harness/book.md": good("bk_aaaaaaaaaaaaaaaa", "target_languages: [12]\n"),
			"N/_book-harness/book.md": good("bk_aaaaaaaaaaaaaaaa", "target_languages: x\n"),
		});
		const { books, problems } = await listBooks(vault);
		expect(books).toEqual([]);
		expect(problems.map((p) => [p.path[0], p.reason])).toEqual([
			["G", "Target languages are invalid."],
			["I", "Book id is invalid."],
			["L", "Primary language is invalid."],
			["N", "Target languages are invalid."],
			["T", "Book title is missing."],
			["X", "Missing frontmatter."],
			["Y", "Written by a newer Book Harness (schema 9); update the plugin."],
			["Z", "This note is not a book configuration."],
		]);
	});

	it("normalizes targets and flags a copied book folder with a duplicate id", async () => {
		const note = `---\nbh_schema: 1\nbh_type: book\nbh_id: bk_aaaaaaaaaaaaaaaa\ntitle: T\nprimary_language: en\ntarget_languages: [de, de, en, cs]\n---\n`;
		const vault = new FakeVault({ "A/_book-harness/book.md": note, "B/_book-harness/book.md": note });
		const { books, problems } = await listBooks(vault);
		expect(books).toHaveLength(1);
		expect(books[0]?.targetLanguages).toEqual(["de", "cs"]);
		expect(problems[0]?.reason).toMatch(/Duplicate book id/);
	});

	it("surfaces unreadable notes as problems", async () => {
		const vault = new FakeVault({ "A/_book-harness/book.md": "x" });
		vault.read = () => Promise.reject(new Error("io"));
		expect((await listBooks(vault)).problems[0]?.reason).toBe("Error: io");
	});
});
