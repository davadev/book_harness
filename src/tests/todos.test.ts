import { describe, expect, it } from "vitest";
import type { Book } from "../core/books";
import type { Chapter } from "../core/chapters";
import { CHAPTER_STATUSES, meetsRequirement, type ChapterStatus } from "../core/status";
import { deriveTodos } from "../core/todos";

const book = (chapterStatus: ChapterStatus): Book => ({ id: "bk", folder: "B", title: "B", primaryLanguage: "en", targetLanguages: [], completion: { chapterStatus } });
const ch = (id: string, designation: string, order: number, notePath: string | null, status: ChapterStatus = "drafting"): Chapter => ({ id, bookId: "bk", designation, order, status, notePath, path: id });
const all = () => true;

describe("requirement semantics", () => {
	it("is a table the author can predict", () => {
		const table = Object.fromEntries(CHAPTER_STATUSES.map((req) => [req, CHAPTER_STATUSES.filter((s) => meetsRequirement(s, req))]));
		expect(table).toEqual({
			planned: ["planned", "drafting", "written", "revising", "finalized"],
			drafting: ["drafting", "written", "revising", "finalized"],
			written: ["written", "finalized"],
			revising: ["finalized"],
			finalized: ["finalized"],
		});
	});
});

describe("deriveTodos", () => {
	it("flags unfinished chapters against the book's own requirement and links the note", () => {
		const todos = deriveTodos(book("written"), [ch("a", "Chapter 1", 1, "B/a.md", "drafting"), ch("b", "Chapter 2", 2, "B/b.md", "written")], all);
		expect(todos).toEqual([{ id: "chapter-unfinished:a", kind: "chapter-unfinished", severity: "required", chapterId: "a", notePath: "B/a.md", message: "Chapter 1 is drafting; this book requires written." }]);
	});

	it("makes planned slots, missing notes and gaps visible without double counting", () => {
		const todos = deriveTodos(book("finalized"), [ch("a", "Chapter 1", 1, null, "planned"), ch("c", "Chapter 3", 3, "B/gone.md", "finalized"), ch("d", "Chapter 4", 4, "B/d.md", "finalized")], (p) => p !== "B/gone.md");
		expect(todos.map((t) => [t.id, t.severity])).toEqual([["chapter-no-file:a", "required"], ["chapter-note-missing:c", "required"], ["chapter-gap:2", "info"]]);
	});

	it("is empty when everything meets the requirement, so resolved items disappear on their own", () => {
		expect(deriveTodos(book("written"), [ch("a", "Prologue", 1, "B/a.md", "finalized")], all)).toEqual([]);
		expect(deriveTodos(book("written"), [], all)).toEqual([]);
	});

	it("reports ambiguous assignments as required decisions", () => {
		const todos = deriveTodos(book("planned"), [ch("a", "One", 1, "B/a.md"), ch("b", "Two", 1, "B/a.md")], all);
		expect(todos.map((t) => t.id)).toEqual(["chapter-conflict:same-order:a,b", "chapter-conflict:same-note:a,b"]);
	});

	it("is deterministic and has unique ids", () => {
		const chapters = [ch("b", "Chapter 2", 2, null, "planned"), ch("a", "Chapter 1", 1, null, "planned")];
		const first = deriveTodos(book("finalized"), chapters, all);
		expect(deriveTodos(book("finalized"), [...chapters].reverse(), all)).toEqual(first);
		expect(new Set(first.map((t) => t.id)).size).toBe(first.length);
	});
});
