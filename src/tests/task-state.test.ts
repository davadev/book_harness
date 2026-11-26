import { describe, expect, it } from "vitest";
import { registerBook, type Book } from "../core/books";
import { addChapter, type Chapter } from "../core/chapters";
import { GuardedVault } from "../core/guarded-vault";
import { chapterStats, loadRecords, runWordStats, saveRecord, statePath, statusOf, type TaskRecord } from "../core/task-state";
import { FakeVault, counterRandom } from "./__mocks__/fakeVault";

const NOW = () => "2026-11-26T12:00:00.000Z";

async function setup() {
	const raw = new FakeVault({ "Book/one.md": "---\ntitle: One\n---\nThe old captain slept.\n", "Book/two.md": "Two words" });
	const vault = new GuardedVault(raw);
	const rnd = counterRandom();
	const book = await registerBook(vault, "Book", "Book", "en", rnd);
	const one = await addChapter(vault, book, [], { designation: "Chapter 1", notePath: "Book/one.md" }, rnd);
	const two = await addChapter(vault, book, [one], { designation: "Chapter 2", notePath: "Book/two.md" }, rnd);
	const planned = await addChapter(vault, book, [one, two], { designation: "Chapter 3" }, rnd);
	return { raw, vault, book, one, two, planned };
}

describe("word count task", () => {
	it("commits a result tied to the exact revision and never changes the manuscript", async () => {
		const { raw, vault, book, one } = await setup();
		const before = raw.files.get("Book/one.md");
		const run = await runWordStats(vault, book, one, NOW);
		expect(run).toMatchObject({ kind: "committed", record: { task: "stats.words", chapterId: one.id, outcome: "succeeded", result: { words: 4 } } });
		expect(raw.files.get("Book/one.md")).toBe(before);
		expect((await chapterStats(vault, book, one)).status).toBe("current");
		expect(raw.files.has(statePath(book, one.id))).toBe(true);
	});

	it("becomes stale when the prose changes, current again after recounting, and ignores property edits", async () => {
		const { raw, vault, book, one } = await setup();
		await runWordStats(vault, book, one, NOW);
		raw.files.set("Book/one.md", "---\ntitle: Renamed\n---\nThe old captain slept.\n");
		expect(await chapterStats(vault, book, one)).toEqual({ words: 4, status: "current" });
		raw.files.set("Book/one.md", "The old captain slept soundly.\n");
		expect(await chapterStats(vault, book, one)).toEqual({ words: 4, status: "stale" });
		await runWordStats(vault, book, one, NOW);
		expect(await chapterStats(vault, book, one)).toEqual({ words: 5, status: "current" });
	});

	it("discards a result when the note changes while it is being counted (AC-C-3)", async () => {
		const { raw, vault, book, one } = await setup();
		let reads = 0;
		const original = raw.read.bind(raw);
		raw.read = (p) => (p === "Book/one.md" && ++reads === 2 ? Promise.resolve("The old captain slept. Then he woke.") : original(p));
		const run = await runWordStats(vault, book, one, NOW);
		expect(run).toEqual({ kind: "discarded-stale", reason: "Chapter 1 changed while it was being counted." });
		expect(raw.files.has(statePath(book, one.id))).toBe(false);
	});

	it("refuses a planned chapter and reports 'not counted' for chapters without a note", async () => {
		const { vault, book, planned } = await setup();
		await expect(runWordStats(vault, book, planned, NOW)).rejects.toThrow(/has no manuscript note/);
		expect(await chapterStats(vault, book, planned)).toEqual({ words: null, status: "not_processed" });
		expect(await chapterStats(vault, book, { ...planned, notePath: "Book/missing.md" })).toEqual({ words: null, status: "not_processed" });
	});

	it("never counts a chapter before it has been run", async () => {
		const { vault, book, two } = await setup();
		expect(await chapterStats(vault, book, two)).toEqual({ words: null, status: "not_processed" });
	});
});

describe("task state records", () => {
	const rec = (extra: Partial<TaskRecord> = {}): TaskRecord => ({ task: "stats.words", chapterId: "ch_x", fingerprint: "fp:a", sourceRevision: "sha256:a", outcome: "succeeded", finishedAt: "t", result: { words: 1 }, ...extra });

	it("maps every situation to a status", () => {
		expect(statusOf(undefined, "fp:a")).toBe("not_processed");
		expect(statusOf(rec(), "fp:a")).toBe("current");
		expect(statusOf(rec(), "fp:b")).toBe("stale");
		expect(statusOf(rec({ outcome: "failed" }), "fp:a")).toBe("failed");
		expect(statusOf(rec({ outcome: "canceled" }), "fp:a")).toBe("canceled");
	});

	it("keeps one record per task, so re-running replaces and never duplicates", async () => {
		const { vault, book, one } = await setup();
		await saveRecord(vault, book, rec({ chapterId: one.id }));
		await saveRecord(vault, book, rec({ chapterId: one.id, fingerprint: "fp:b", result: { words: 9 } }));
		const records = await loadRecords(vault, book, one.id);
		expect(records).toHaveLength(1);
		expect(records[0]).toMatchObject({ fingerprint: "fp:b", result: { words: 9 } });
	});

	it("refuses to overwrite a state note that changed on another device", async () => {
		const { raw, vault, book, one } = await setup();
		await saveRecord(vault, book, rec({ chapterId: one.id }));
		raw.replaceIfUnchanged = () => Promise.resolve(false);
		await expect(saveRecord(vault, book, rec({ chapterId: one.id, fingerprint: "fp:changed" }))).rejects.toThrow(/another device/);
	});

	it.each([
		["a different note type", (b: Book, c: Chapter) => `---\nbh_schema: 1\nbh_type: book\nbh_id: ${c.id}\n---\n`, /not a task state/],
		["a newer schema", (b: Book, c: Chapter) => `---\nbh_schema: 9\nbh_type: task-state\nbh_id: ${c.id}\n---\n`, /newer Book Harness/],
		["no records block", (b: Book, c: Chapter) => `---\nbh_schema: 1\nbh_type: task-state\nbh_id: ${c.id}\n---\ntext`, /no records block/],
		["broken JSON", (b: Book, c: Chapter) => `---\nbh_schema: 1\nbh_type: task-state\nbh_id: ${c.id}\n---\n\`\`\`bh-records\n{oops\n\`\`\``, /not valid JSON/],
		["a non-list", (b: Book, c: Chapter) => `---\nbh_schema: 1\nbh_type: task-state\nbh_id: ${c.id}\n---\n\`\`\`bh-records\n{}\n\`\`\``, /must be a list/],
	])("reports %s instead of treating it as empty", async (_n, make, reason) => {
		const { raw, vault, book, one } = await setup();
		raw.files.set(statePath(book, one.id), make(book, one));
		await expect(loadRecords(vault, book, one.id)).rejects.toThrow(reason);
	});

	it("drops unknown tasks and malformed entries but keeps valid ones", async () => {
		const { raw, vault, book, one } = await setup();
		const good = rec({ chapterId: one.id });
		const body = JSON.stringify([good, { task: "future.task", fingerprint: "x", outcome: "succeeded" }, { task: "stats.words", fingerprint: 5, outcome: "succeeded" }, { task: "stats.words", fingerprint: "x", outcome: "weird" }, null, 3]);
		raw.files.set(statePath(book, one.id), `---\nbh_schema: 1\nbh_type: task-state\nbh_id: ${one.id}\n---\n\`\`\`bh-records\n${body}\n\`\`\`\n`);
		expect(await loadRecords(vault, book, one.id)).toEqual([good]);
	});
});
