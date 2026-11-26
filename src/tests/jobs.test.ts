import { describe, expect, it, vi } from "vitest";
import { registerBook, type Book } from "../core/books";
import { addChapter, type Chapter } from "../core/chapters";
import { GuardedVault } from "../core/guarded-vault";
import { JobRunner, dismissJob, jobPath, listJobs, presentJobs, type JobRecord, type RunDeps } from "../core/jobs";
import { chapterStats } from "../core/task-state";
import { FakeVault, counterRandom } from "./__mocks__/fakeVault";

async function setup(count = 3) {
	const files: Record<string, string> = {};
	for (let i = 1; i <= count; i++) files[`Book/c${i}.md`] = `Chapter ${i} has some words.`;
	const raw = new FakeVault(files);
	const vault = new GuardedVault(raw);
	const rnd = counterRandom();
	const book = await registerBook(vault, "Book", "Book", "en", rnd);
	const chapters: Chapter[] = [];
	for (let i = 1; i <= count; i++) chapters.push(await addChapter(vault, book, chapters, { designation: `Chapter ${i}`, notePath: `Book/c${i}.md` }, rnd));
	const deps = (onChange: RunDeps["onChange"] = () => undefined): RunDeps => ({ vault, book, random: rnd, now: () => "2026-11-26T12:00:00.000Z", onChange });
	return { raw, vault, book, chapters, rnd, deps };
}

describe("word count job", () => {
	it("runs every chapter, records an authorization and persists the outcome", async () => {
		const { raw, vault, book, chapters, deps } = await setup();
		const runner = new JobRunner();
		const seen: string[] = [];
		const job = await runner.runWordCounts(deps((j) => seen.push(`${j.state}:${j.items.filter((i) => i.state === "done").length}`)), chapters);
		expect(job).toMatchObject({ state: "completed", kind: "stats.words", authorization: { action: "update-word-counts", by: "user" }, finishedAt: "2026-11-26T12:00:00.000Z" });
		expect(job.items.map((i) => i.state)).toEqual(["done", "done", "done"]);
		expect(seen).toEqual(["running:0", "running:1", "running:2", "running:3", "completed:3"]);
		expect((await listJobs(vault, book)).jobs).toEqual([job]);
		expect(raw.files.has(jobPath(book, job.id))).toBe(true);
		expect((await chapterStats(vault, book, chapters[0]!)).status).toBe("current");
		expect(runner.isRunning(job.id)).toBe(false);
		expect(runner.hasRunningJob(book.id)).toBe(false);
		expect(runner.live(job.id)).toBeUndefined();
	});

	it("keeps successes when one chapter fails or goes stale, and skips planned chapters", async () => {
		const { raw, chapters, deps, vault, book, rnd } = await setup();
		const planned = await addChapter(vault, book, chapters, { designation: "Chapter 9" }, rnd);
		const original = raw.read.bind(raw);
		let reads = 0;
		raw.read = (p) => {
			if (p === "Book/c2.md") return Promise.reject(new Error("io"));
			if (p === "Book/c3.md" && ++reads === 2) return Promise.resolve("changed meanwhile");
			return original(p);
		};
		const job = await new JobRunner().runWordCounts(deps(), [...chapters, planned]);
		expect(job.items.map((i) => [i.designation, i.state])).toEqual([["Chapter 1", "done"], ["Chapter 2", "failed"], ["Chapter 3", "discarded"]]);
		expect(job.items[1]?.message).toBe("io");
		expect(job.items[2]?.message).toMatch(/changed while it was being counted/);
	});

	it("reports a non-Error failure verbatim", async () => {
		const { raw, chapters, deps } = await setup(1);
		const original = raw.read.bind(raw);
		raw.read = (p) => (p === "Book/c1.md" ? Promise.reject("odd") : original(p));
		expect((await new JobRunner().runWordCounts(deps(), chapters)).items[0]).toMatchObject({ state: "failed", message: "odd" });
	});

	it("can be canceled between chapters: finished work stays, the rest is marked canceled", async () => {
		const { chapters, deps, vault, book } = await setup(4);
		const runner = new JobRunner();
		const job = await runner.runWordCounts(
			deps((j) => {
				if (j.items.filter((i) => i.state === "done").length === 2 && j.state === "running") runner.cancel(j.id);
			}),
			chapters,
		);
		expect(job.state).toBe("canceled");
		expect(job.items.map((i) => i.state)).toEqual(["done", "done", "canceled", "canceled"]);
		expect((await chapterStats(vault, book, chapters[1]!)).status).toBe("current");
		expect((await chapterStats(vault, book, chapters[2]!)).status).toBe("not_processed");
	});

	it("cancel of an unknown job does nothing", () => {
		expect(() => new JobRunner().cancel("jb_nothing")).not.toThrow();
	});

	it("persists progress periodically while running", async () => {
		const { raw, chapters, deps, vault, book } = await setup(6);
		const observed: number[] = [];
		const runner = new JobRunner();
		await runner.runWordCounts(
			deps(async () => {
				const stored = (await listJobs(vault, book)).jobs[0];
				if (stored) observed.push(stored.items.filter((i) => i.state === "done").length);
			}),
			chapters,
		);
		await vi.waitFor(() => expect(Math.max(...observed)).toBeGreaterThanOrEqual(5));
		expect(raw.writes.filter((p) => p.includes("/jobs/")).length).toBeGreaterThanOrEqual(3);
	});

	it("refuses to overwrite a job record that changed on another device", async () => {
		const { raw, chapters, deps } = await setup(1);
		raw.replaceIfUnchanged = (p, e, n) => (p.includes("/jobs/") ? Promise.resolve(false) : FakeVault.prototype.replaceIfUnchanged.call(raw, p, e, n));
		await expect(new JobRunner().runWordCounts(deps(), chapters)).rejects.toThrow(/another device/);
		const runner = new JobRunner();
		await expect(runner.runWordCounts(deps(), chapters)).rejects.toThrow();
		expect(runner.hasRunningJob("anything")).toBe(false);
	});
});

describe("after a restart", () => {
	const stored = (state: JobRecord["state"], pending = true): JobRecord => ({
		id: "jb_aaaaaaaaaaaaaaaa", bookId: "b", kind: "stats.words", state, authorization: { action: "x", by: "user", at: "t" }, startedAt: "t",
		items: [{ chapterId: "a", designation: "A", state: "done" }, { chapterId: "b", designation: "B", state: pending ? "pending" : "done" }],
	});

	it("shows a job still marked running as interrupted without writing anything or restarting it", () => {
		const runner = new JobRunner();
		const [job] = presentJobs([stored("running")], runner);
		expect(job?.state).toBe("interrupted");
		expect(job?.items[1]).toMatchObject({ state: "pending", message: "Not run: the app closed first." });
	});

	it("shows the live state for a job this app is running, hides dismissed jobs, and passes finished ones through", () => {
		const live = { ...stored("running"), startedAt: "live" };
		const runner = { isRunning: () => true, live: () => live } as never;
		expect(presentJobs([stored("running")], runner)).toEqual([live]);
		const plain = new JobRunner();
		expect(presentJobs([stored("completed"), stored("dismissed")], plain).map((j) => j.state)).toEqual(["completed"]);
	});

	it("dismisses finished jobs and refuses to dismiss a running one", async () => {
		const { vault, book, chapters, deps } = await setup(1);
		const job = await new JobRunner().runWordCounts(deps(), chapters);
		await dismissJob(vault, book, job);
		expect((await listJobs(vault, book)).jobs[0]?.state).toBe("dismissed");
		await expect(dismissJob(vault, book, { ...job, state: "running" })).rejects.toThrow(/Cancel it first/);
	});
});

describe("job records on disk", () => {
	it.each([
		["a different note type", (b: Book) => `---\nbh_schema: 1\nbh_type: book\nbh_id: x\n---\n`, /not a job record/],
		["a newer schema", (b: Book) => `---\nbh_schema: 9\nbh_type: job\nbh_id: x\n---\n`, /newer Book Harness/],
		["no records block", (b: Book) => `---\nbh_schema: 1\nbh_type: job\nbh_id: x\n---\ntext`, /no records block/],
		["broken JSON", (b: Book) => `---\nbh_schema: 1\nbh_type: job\nbh_id: x\n---\n\`\`\`bh-records\n{oops\n\`\`\``, /not valid JSON/],
		["a malformed record", (b: Book) => `---\nbh_schema: 1\nbh_type: job\nbh_id: x\n---\n\`\`\`bh-records\n{"id":"nope"}\n\`\`\``, /malformed/],
		["null", (b: Book) => `---\nbh_schema: 1\nbh_type: job\nbh_id: x\n---\n\`\`\`bh-records\nnull\n\`\`\``, /malformed/],
	])("reports %s", async (_n, make, reason) => {
		const { raw, vault, book } = await setup(1);
		raw.files.set(`Book/_book-harness/jobs/jb_zzzzzzzzzzzzzzzz.md`, make(book));
		const { jobs, problems } = await listJobs(vault, book);
		expect(jobs).toEqual([]);
		expect(problems[0]).toMatch(reason);
	});

	it("drops malformed items, keeps good ones, and reports unreadable files", async () => {
		const { raw, vault, book, chapters, deps } = await setup(1);
		const job = await new JobRunner().runWordCounts(deps(), chapters);
		const path = jobPath(book, job.id);
		const text = raw.files.get(path)!.replace('"state": "done"', '"state": "done"').replace(/"items": \[/, '"items": [null, {"chapterId": 5}, {"chapterId":"x","designation":"X","state":"weird"},');
		raw.files.set(path, text);
		expect((await listJobs(vault, book)).jobs[0]?.items).toEqual(job.items);
		raw.read = () => Promise.reject("io");
		expect((await listJobs(vault, book)).problems[0]).toContain(": io");
	});
});
