import { describe, expect, it } from "vitest";
import type { Book } from "../core/books";
import type { Chapter } from "../core/chapters";
import { buildOverview, orderToMove, resolveContext } from "../core/panel-model";

const book = (id: string, folder: string): Book => ({ id, folder, title: id, primaryLanguage: "en", targetLanguages: [], completion: { chapterStatus: "written" } });
const ch = (id: string, order: number, notePath: string | null, bookId = "bk1", designation = id): Chapter => ({ id, bookId, designation, order, status: "drafting", notePath, path: id });

describe("resolveContext", () => {
	const books = [book("bk1", "A"), book("bk2", "B")];
	const chapters = [ch("c1", 1, "A/one.md"), ch("c2", 2, "B/one.md", "bk2")];

	it("describes every situation the panel can be in", () => {
		expect(resolveContext([], "A/x.md", [])).toEqual({ kind: "no-books" });
		expect(resolveContext(books, null, chapters)).toEqual({ kind: "inactive", reason: "no-active-note" });
		expect(resolveContext(books, "Z/x.md", chapters)).toEqual({ kind: "inactive", reason: "not-in-a-book" });
		expect(resolveContext(books, "A/one.md", chapters)).toMatchObject({ kind: "book", role: "chapter", chapterId: "c1" });
		expect(resolveContext(books, "A/other.md", chapters)).toMatchObject({ role: "manuscript", chapterId: null });
		expect(resolveContext(books, "A/_book-harness/book.md", chapters)).toMatchObject({ role: "managed" });
		expect(resolveContext(books, "A", chapters)).toMatchObject({ role: "folder" });
	});

	it("never matches a chapter of another book even when paths look alike", () => {
		expect(resolveContext(books, "B/one.md", chapters)).toMatchObject({ role: "chapter", chapterId: "c2", book: { id: "bk2" } });
	});
});

describe("buildOverview", () => {
	it("orders rows, flags the open note, missing notes, planned slots and gaps", () => {
		const chapters = [ch("b", 2, "A/b.md", "bk1", "Chapter 3"), ch("a", 1, "A/a.md", "bk1", "Chapter 1"), ch("p", 3, null, "bk1", "Chapter 5")];
		const o = buildOverview(book("bk1", "A"), chapters, "A/a.md", (p) => p !== "A/b.md");
		expect(o.rows.map((r) => [r.chapter.id, r.isActive, r.missingNote, r.isFirst, r.isLast])).toEqual([
			["a", true, false, true, false],
			["b", false, true, false, false],
			["p", false, false, false, true],
		]);
		expect(o.todos.map((t) => t.id)).toEqual(["chapter-unfinished:a", "chapter-note-missing:b", "chapter-no-file:p", "chapter-gap:2", "chapter-gap:4"]);
		expect(buildOverview(book("bk1", "A"), [], null, () => true).rows).toEqual([]);
		expect(buildOverview(book("bk1", "A"), chapters, null, () => true).rows.some((r) => r.isActive)).toBe(false);
	});
});

describe("orderToMove", () => {
	const list = [ch("a", 1000, null), ch("b", 2000, null), ch("c", 3000, null), ch("d", 4000, null)];

	it("lands between the neighbours of the target slot", () => {
		expect(orderToMove(list, "c", "up")).toBe(1500);
		expect(orderToMove(list, "b", "down")).toBe(3500);
	});

	it("goes past the end when there is nothing beyond the neighbour", () => {
		expect(orderToMove(list, "b", "up")).toBe(0);
		expect(orderToMove(list, "c", "down")).toBe(5000);
	});

	it("cannot move off the ends, for unknown ids, or when orders collide", () => {
		expect(orderToMove(list, "a", "up")).toBeNull();
		expect(orderToMove(list, "d", "down")).toBeNull();
		expect(orderToMove(list, "x", "up")).toBeNull();
		expect(orderToMove([ch("a", 1, null), ch("b", 1, null), ch("c", 1, null)], "c", "up")).toBeNull();
	});
});
