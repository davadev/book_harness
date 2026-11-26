import { describe, expect, it } from "vitest";
import type { Book } from "../core/books";
import { listChapters } from "../core/chapters";
import { findConflictCopies } from "../core/sync-conflicts";
import { registerBook } from "../core/books";
import { addChapter, chapterPath } from "../core/chapters";
import { GuardedVault } from "../core/guarded-vault";
import { FakeVault, counterRandom } from "./__mocks__/fakeVault";

const book = { id: "bk", folder: "Book" } as Book;

describe("findConflictCopies", () => {
	it("recognises common sync-tool naming inside the book only, not titles that mention conflict", () => {
		const paths = [
			"Book/Chapter 1.md",
			"Book/Chapter 1 (conflicted copy 2026-11-26).md",
			"Book/sub/Notes (Conflict 2).md",
			"Book/_book-harness/chapters/ch_x.sync-conflict-20261126-120000.md",
			"Other/Chapter 1 (conflicted copy).md",
			"Book/Conflicted-Feelings is a title.md",
			"Book/The Conflict Within.md",
		];
		expect(findConflictCopies(book, paths)).toEqual([
			"Book/Chapter 1 (conflicted copy 2026-11-26).md",
			"Book/_book-harness/chapters/ch_x.sync-conflict-20261126-120000.md",
			"Book/sub/Notes (Conflict 2).md",
		]);
	});

	it("is quiet when there are none", () => {
		expect(findConflictCopies(book, ["Book/a.md", "Book/b.md"])).toEqual([]);
	});
});

describe("duplicate chapter records", () => {
	it("keeps the first and reports the copy instead of silently using two", async () => {
		const raw = new FakeVault({ "Book/a.md": "a" });
		const vault = new GuardedVault(raw);
		const rnd = counterRandom();
		const b = await registerBook(vault, "Book", "Book", "en", rnd);
		const ch = await addChapter(vault, b, [], { designation: "One", notePath: "Book/a.md" }, rnd);
		raw.files.set(chapterPath(b, ch.id).replace(".md", " (conflicted copy).md"), raw.files.get(chapterPath(b, ch.id))!);
		const { chapters, problems } = await listChapters(vault, b);
		expect(chapters).toHaveLength(1);
		expect(problems[0]?.reason).toMatch(/Duplicate chapter id.*sync conflict copy/);
	});
});
