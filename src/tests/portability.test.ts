import { describe, expect, it } from "vitest";
import { listBooks, registerBook } from "../core/books";
import { addChapter, listChapters, setStatus } from "../core/chapters";
import { GuardedVault } from "../core/guarded-vault";
import { JobRunner } from "../core/jobs";
import { buildOverview } from "../core/panel-model";
import { chapterStats } from "../core/task-state";
import { deriveTodos } from "../core/todos";
import { FakeVault, counterRandom } from "./__mocks__/fakeVault";

/** AC-ST-3 (structure part): a book folder copied elsewhere, without any plugin or editor state, behaves identically. */
describe("copying a book folder to another vault", () => {
	it("keeps chapters, order, status, task results, jobs and to-dos, even under a different folder name", async () => {
		const files: Record<string, string> = { "Novel/a b c.md": "First chapter words here.", "Novel/zz.md": "Second chapter.", "Novel/img/cover.png": "binary" };
		const source = new FakeVault(files);
		const vault = new GuardedVault(source);
		const rnd = counterRandom();
		const book = await registerBook(vault, "Novel", "Novel", "de", rnd);
		const one = await addChapter(vault, book, [], { designation: "Prologue", notePath: "Novel/a b c.md" }, rnd);
		const two = await addChapter(vault, book, [one], { designation: "Chapter 1", notePath: "Novel/zz.md" }, rnd);
		await addChapter(vault, book, [one, two], { designation: "Chapter 2" }, rnd);
		await setStatus(vault, book, one, "finalized");
		await new JobRunner().runWordCounts({ vault, book, random: rnd, now: () => "t", onChange: () => undefined }, [one, two]);

		// "Copy the folder": every file under Novel/ is placed under a different folder in a fresh vault.
		const target = new FakeVault();
		for (const [path, text] of source.files) target.files.set(path.replace(/^Novel\//, "Moved Books/The Novel/"), text);
		const copied = new GuardedVault(target);

		const { books, problems } = await listBooks(copied);
		expect(problems).toEqual([]);
		expect(books).toHaveLength(1);
		const copiedBook = books[0]!;
		expect(copiedBook).toMatchObject({ id: book.id, folder: "Moved Books/The Novel", title: "Novel", primaryLanguage: "de" });

		const { chapters } = await listChapters(copied, copiedBook);
		expect(chapters.map((c) => [c.id, c.designation, c.order, c.status, c.notePath])).toEqual(
			[...(await listChapters(vault, book)).chapters].map((c) => [c.id, c.designation, c.order, c.status, c.notePath?.replace("Novel/", "Moved Books/The Novel/") ?? null]),
		);
		expect(chapters.find((c) => c.designation === "Prologue")?.notePath).toBe("Moved Books/The Novel/a b c.md");

		const stats = await chapterStats(copied, copiedBook, chapters.find((c) => c.designation === "Prologue")!);
		expect(stats).toEqual({ words: 4, status: "current" });

		const original = deriveTodos(book, (await listChapters(vault, book)).chapters, (p) => vault.exists(p)).map((t) => t.id);
		const moved = deriveTodos(copiedBook, chapters, (p) => copied.exists(p)).map((t) => t.id);
		expect(moved).toEqual(original);
		expect(buildOverview(copiedBook, chapters, null, (p) => copied.exists(p)).rows.every((r) => !r.missingNote)).toBe(true);
	});
});
