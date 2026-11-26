import { describe, expect, it } from "vitest";
import { registerBook, type Book } from "../core/books";
import { addChapter, bindNote, chapterPath, findConflicts, findGaps, followRename, listChapters, readingOrder, setDesignation, setOrder, setStatus, type Chapter } from "../core/chapters";
import { isChapterStatus } from "../core/status";
import { GuardedVault } from "../core/guarded-vault";
import { FakeVault, counterRandom } from "./__mocks__/fakeVault";

const NOTES: Record<string, string> = {
	"Book/zzz scratch.md": "Prologue prose",
	"Book/draft 7 final FINAL.md": "One",
	"Book/misc/ten.md": "Ten",
	"Book/misc/fifteen.md": "Fifteen",
	"Book/_book-harness/ignore.md": "managed",
	"Elsewhere/note.md": "not in the book",
};

async function setup() {
	const raw = new FakeVault(NOTES);
	const vault = new GuardedVault(raw);
	const rnd = counterRandom();
	const book = await registerBook(vault, "Book", "Book", "en", rnd);
	return { raw, vault, rnd, book };
}

async function promoteAll(vault: GuardedVault, book: Book, rnd: ReturnType<typeof counterRandom>) {
	let chapters: Chapter[] = [];
	for (const [designation, notePath] of [["Prologue", "Book/zzz scratch.md"], ["Chapter 1", "Book/draft 7 final FINAL.md"], ["Chapter 10", "Book/misc/ten.md"], ["Chapter 15", "Book/misc/fifteen.md"]] as const) {
		chapters = [...chapters, await addChapter(vault, book, chapters, { designation, notePath }, rnd)];
	}
	return chapters;
}

describe("promoting notes to chapters", () => {
	it("follows assignment order, not file names, and never touches the manuscript", async () => {
		const { raw, vault, rnd, book } = await setup();
		const before = new Map(raw.files);
		const chapters = await promoteAll(vault, book, rnd);
		expect(readingOrder(chapters).map((c) => c.designation)).toEqual(["Prologue", "Chapter 1", "Chapter 10", "Chapter 15"]);
		expect(chapters.map((c) => c.status)).toEqual(["drafting", "drafting", "drafting", "drafting"]);
		for (const [p, t] of Object.entries(NOTES)) expect(raw.files.get(p)).toBe(before.get(p) ?? t);
		expect(raw.writes.every((p) => p.startsWith("Book/_book-harness/"))).toBe(true);
	});

	it("round-trips through the vault and lists problems for broken records", async () => {
		const { raw, vault, rnd, book } = await setup();
		const chapters = await promoteAll(vault, book, rnd);
		raw.files.set(`${chapterPath(book, "ch_zzzzzzzzzzzzzzzz")}`, "garbage");
		const { chapters: loaded, problems } = await listChapters(vault, book);
		expect(loaded).toEqual(chapters.sort((a, b) => a.path.localeCompare(b.path)));
		expect(problems).toEqual([{ path: chapterPath(book, "ch_zzzzzzzzzzzzzzzz"), reason: "Missing frontmatter." }]);
	});

	it("plans slots without files and reports known gaps separately from planned slots", async () => {
		const { vault, rnd, book } = await setup();
		let chapters = await promoteAll(vault, book, rnd);
		expect(findGaps(chapters)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14]);
		const planned = await addChapter(vault, book, chapters, { designation: "Chapter 11", order: 3500 }, rnd);
		chapters = [...chapters, planned];
		expect(planned).toMatchObject({ status: "planned", notePath: null });
		expect(findGaps(chapters)).not.toContain(11);
		expect(findGaps([])).toEqual([]);
		expect(readingOrder(chapters).map((c) => c.designation)).toEqual(["Prologue", "Chapter 1", "Chapter 10", "Chapter 11", "Chapter 15"]);
	});

	it.each([
		["a blank designation", { designation: "  " }, /needs a designation/],
		["a duplicate designation (any case)", { designation: "prologue" }, /already a chapter/],
		["a note outside the book", { designation: "X", notePath: "Elsewhere/note.md" }, /not inside this book/],
		["a managed note", { designation: "X", notePath: "Book/_book-harness/ignore.md" }, /Managed notes/],
		["a missing note", { designation: "X", notePath: "Book/nope.md" }, /does not exist/],
		["a note that is already a chapter", { designation: "X", notePath: "Book/zzz scratch.md" }, /already the chapter "Prologue"/],
		["an unknown status", { designation: "X", status: "done" as never }, /Unknown chapter status/],
		["a non-numeric order", { designation: "X", order: Number.NaN }, /order must be a number/],
	])("refuses %s", async (_n, req, reason) => {
		const { vault, rnd, book } = await setup();
		const chapters = await promoteAll(vault, book, rnd);
		await expect(addChapter(vault, book, chapters, req, rnd)).rejects.toThrow(reason);
	});
});

describe("editing chapter records", () => {
	it("sets status, order and designation with author control", async () => {
		const { vault, rnd, book } = await setup();
		const chapters = await promoteAll(vault, book, rnd);
		const ch1 = chapters[1]!;
		expect((await setStatus(vault, book, ch1, "finalized")).status).toBe("finalized");
		expect((await setOrder(vault, book, ch1, 1500)).order).toBe(1500);
		expect((await setDesignation(vault, book, chapters, ch1, "Chapter One")).designation).toBe("Chapter One");
		const { chapters: loaded } = await listChapters(vault, book);
		expect(loaded.find((c) => c.id === ch1.id)).toMatchObject({ status: "finalized", order: 1500, designation: "Chapter One" });
		await expect(setDesignation(vault, book, chapters, ch1, "Prologue")).rejects.toThrow(/already a chapter/);
		await expect(setStatus(vault, book, ch1, "x" as never)).rejects.toThrow(/Unknown chapter status/);
		await expect(setOrder(vault, book, ch1, Number.POSITIVE_INFINITY)).rejects.toThrow(/must be a number/);
	});

	it("rebinds, demotes and refuses conflicting assignments", async () => {
		const { raw, vault, rnd, book } = await setup();
		const chapters = await promoteAll(vault, book, rnd);
		raw.files.set("Book/rewritten one.md", "One, again");
		const [pro, ch1] = chapters as [Chapter, Chapter];
		await expect(bindNote(vault, book, chapters, ch1, "Book/zzz scratch.md")).rejects.toThrow(/already the chapter "Prologue"/);
		await expect(bindNote(vault, book, chapters, ch1, "Elsewhere/note.md")).rejects.toThrow(/cannot be a chapter/);
		await expect(bindNote(vault, book, chapters, ch1, "Book/_book-harness/ignore.md")).rejects.toThrow(/cannot be a chapter/);
		await expect(bindNote(vault, book, chapters, ch1, "Book/nope.md")).rejects.toThrow(/does not exist/);
		expect((await bindNote(vault, book, chapters, ch1, "Book/rewritten one.md")).notePath).toBe("Book/rewritten one.md");
		const demoted = await bindNote(vault, book, chapters, pro, null);
		expect(demoted).toMatchObject({ notePath: null, status: "drafting" });
	});

	it("refuses to overwrite a record that changed on another device", async () => {
		const { raw, vault, rnd, book } = await setup();
		const [pro] = await promoteAll(vault, book, rnd);
		const original = raw.replaceIfUnchanged.bind(raw);
		raw.replaceIfUnchanged = async () => false;
		await expect(setStatus(vault, book, pro!, "written")).rejects.toThrow(/changed on another device/);
		raw.replaceIfUnchanged = original;
	});
});

describe("renames and conflicts", () => {
	it("follows a renamed note and unbinds one moved out of the book", async () => {
		const { raw, vault, rnd, book } = await setup();
		await promoteAll(vault, book, rnd);
		raw.files.set("Book/renamed.md", "Prologue prose");
		await followRename(vault, [book], "Book/zzz scratch.md", "Book/renamed.md");
		let { chapters } = await listChapters(vault, book);
		expect(chapters.find((c) => c.designation === "Prologue")?.notePath).toBe("Book/renamed.md");
		await followRename(vault, [book], "Book/renamed.md", "Elsewhere/renamed.md");
		({ chapters } = await listChapters(vault, book));
		expect(chapters.find((c) => c.designation === "Prologue")).toMatchObject({ notePath: null, status: "drafting" });
		await followRename(vault, [book], "Book/misc/ten.md", "Book/_book-harness/ten.md");
		({ chapters } = await listChapters(vault, book));
		expect(chapters.find((c) => c.designation === "Chapter 10")?.notePath).toBeNull();
	});

	it("ignores renames of notes that are not chapters or not in any book", async () => {
		const { raw, vault, rnd, book } = await setup();
		await promoteAll(vault, book, rnd);
		const writes = raw.writes.length;
		await followRename(vault, [book], "Elsewhere/note.md", "Elsewhere/n2.md");
		await followRename(vault, [book], "Book/unpromoted.md", "Book/other.md");
		expect(raw.writes.length).toBe(writes);
	});

	it("reports ambiguous orders, designations and note bindings without fixing them", () => {
		const mk = (id: string, designation: string, order: number, notePath: string | null): Chapter => ({ id, bookId: "b", designation, order, status: "drafting", notePath, path: id });
		const conflicts = findConflicts([mk("a", "One", 1, "n.md"), mk("b", "one", 1, "n.md"), mk("c", "Two", 2, null), mk("d", "Three", 3, null)]);
		expect(conflicts.map((c) => c.kind).sort()).toEqual(["same-designation", "same-note", "same-order"]);
		expect(findConflicts([mk("a", "One", 1, null), mk("b", "Two", 2, null)])).toEqual([]);
	});

	it("orders equal keys deterministically", () => {
		const mk = (id: string, designation: string, order: number): Chapter => ({ id, bookId: "b", designation, order, status: "planned", notePath: null, path: id });
		expect(readingOrder([mk("b", "B", 1), mk("a", "A", 1), mk("c", "A", 1)]).map((c) => c.id)).toEqual(["a", "c", "b"]);
		expect(isChapterStatus("planned")).toBe(true);
		expect(isChapterStatus("nope")).toBe(false);
	});
});

describe("chapter record validation", () => {
	it.each([
		["wrong type", "bh_type: book\nbh_id: ch_aaaaaaaaaaaaaaaa", /not a chapter record/],
		["newer schema", "bh_schema: 9\nbh_type: chapter\nbh_id: ch_aaaaaaaaaaaaaaaa", /newer Book Harness/],
		["bad id", "bh_type: chapter\nbh_id: nope", /id is invalid/],
		["other book", "bh_type: chapter\nbh_id: ch_aaaaaaaaaaaaaaaa\nbh_book: bk_other", /different book/],
		["no designation", "bh_type: chapter\nbh_id: ch_aaaaaaaaaaaaaaaa", /designation is missing/],
		["bad order", "designation: A\norder: x", /order must be a number/],
		["bad status", "designation: A\norder: 1\nstatus: done", /status is invalid/],
		["bad path", "designation: A\norder: 1\nstatus: planned\nnote_path: 5", /note path is invalid/],
	])("rejects a record with %s", async (_n, extra, reason) => {
		const { raw, vault, book } = await setup();
		const base = { schema: "bh_schema: 1", type: "bh_type: chapter", id: "bh_id: ch_aaaaaaaaaaaaaaaa", book: `bh_book: ${book.id}` };
		const lines = new Map<string, string>([["bh_schema", base.schema], ["bh_type", base.type], ["bh_id", base.id], ["bh_book", base.book]]);
		for (const line of extra.split("\n")) lines.set(line.split(":")[0]!, line);
		raw.files.set(chapterPath(book, "ch_aaaaaaaaaaaaaaaa"), `---\n${[...lines.values()].join("\n")}\n---\n`);
		const { problems } = await listChapters(vault, book);
		expect(problems[0]?.reason).toMatch(reason);
	});

	it("reports non-managed-note failures verbatim", async () => {
		const { raw, vault, book } = await setup();
		raw.files.set(chapterPath(book, "ch_aaaaaaaaaaaaaaaa"), "x");
		raw.read = () => Promise.reject(new Error("io"));
		expect((await listChapters(vault, book)).problems[0]?.reason).toBe("Error: io");
	});
});
