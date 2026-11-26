import { MANAGED_FOLDER, type Book } from "./books";
import type { Chapter } from "./chapters";
import { isId, newId, type RandomPort } from "./ids";
import { ManagedNoteError, parseManagedNote, serializeManagedNote } from "./managed-note";
import type { VaultPort } from "./ports";
import { runWordStats } from "./task-state";
import { ModelError } from "./ai/errors";

const JOB_SCHEMA = 1;
const FENCE = /```bh-records\n([\s\S]*?)\n```/;
const PERSIST_EVERY = 5;

export type JobState = "running" | "completed" | "canceled" | "interrupted" | "dismissed";
export type JobKind = "stats.words" | "chapter.summary" | "proofread";
const JOB_KINDS: readonly JobKind[] = ["stats.words", "chapter.summary", "proofread"];
export type ItemState = "pending" | "done" | "discarded" | "failed" | "canceled";

export interface JobItem {
	chapterId: string;
	designation: string;
	state: ItemState;
	message?: string;
}

/** A user-authorized batch. The authorization names exactly what the author asked for; nothing else may run under it. */
export interface JobRecord {
	id: string;
	bookId: string;
	kind: JobKind;
	state: JobState;
	authorization: { action: string; by: "user"; at: string };
	startedAt: string;
	finishedAt?: string;
	items: JobItem[];
}

export const jobPath = (book: Book, id: string): string => `${book.folder}/${MANAGED_FOLDER}/jobs/${id}.md`;

const JOB_STATES: readonly JobState[] = ["running", "completed", "canceled", "interrupted", "dismissed"];
const ITEM_STATES: readonly ItemState[] = ["pending", "done", "discarded", "failed", "canceled"];

function serialize(job: JobRecord): string {
	const done = job.items.filter((i) => i.state === "done").length;
	return serializeManagedNote({
		frontmatter: { bh_schema: JOB_SCHEMA, bh_type: "job", bh_id: job.id, bh_book: job.bookId, kind: job.kind, state: job.state },
		body: `# Job ${job.kind}\n\n${job.state}: ${done} of ${job.items.length} chapters done. Started ${job.startedAt}.\n\n\`\`\`bh-records\n${JSON.stringify(job, null, 1)}\n\`\`\`\n`,
	});
}

function parse(text: string, book: Book): JobRecord {
	const note = parseManagedNote(text);
	if (note.frontmatter.bh_type !== "job") throw new ManagedNoteError("This note is not a job record.");
	if (note.frontmatter.bh_schema > JOB_SCHEMA) throw new ManagedNoteError("Written by a newer Book Harness; update the plugin.");
	const m = FENCE.exec(note.body);
	if (!m) throw new ManagedNoteError("Job record has no records block.");
	let data: unknown;
	try {
		data = JSON.parse(m[1]);
	} catch {
		throw new ManagedNoteError("Job records are not valid JSON.");
	}
	const j = data as Partial<JobRecord> | null;
	if (!j || typeof j !== "object" || !isId(j.id, "jb") || j.bookId !== book.id || !JOB_KINDS.includes(j.kind as JobKind) || !JOB_STATES.includes(j.state as JobState) || typeof j.startedAt !== "string" || !Array.isArray(j.items)) {
		throw new ManagedNoteError("Job record is malformed.");
	}
	const items = j.items.filter((i): i is JobItem => !!i && typeof i === "object" && typeof i.chapterId === "string" && ITEM_STATES.includes(i.state));
	return { ...(j as JobRecord), items };
}

export async function listJobs(vault: VaultPort, book: Book): Promise<{ jobs: JobRecord[]; problems: string[] }> {
	const prefix = `${book.folder}/${MANAGED_FOLDER}/jobs/`;
	const jobs: JobRecord[] = [];
	const problems: string[] = [];
	for (const path of vault.markdownPaths().filter((p) => p.startsWith(prefix)).sort()) {
		try {
			jobs.push(parse(await vault.read(path), book));
		} catch (e) {
			problems.push(`${path}: ${e instanceof ManagedNoteError ? e.message : String(e)}`);
		}
	}
	return { jobs, problems };
}

async function persist(vault: VaultPort, book: Book, job: JobRecord): Promise<void> {
	const path = jobPath(book, job.id);
	if (!vault.exists(path)) {
		await vault.create(path, serialize(job));
		return;
	}
	const before = await vault.read(path);
	if (!(await vault.replaceIfUnchanged(path, before, serialize(job)))) throw new Error("A job record changed on another device; try again.");
}

/**
 * What to show for each stored job. A job stored as running that this app instance is not running cannot be running
 * (the app closed, or another device wrote it): it is shown as interrupted. Nothing is written and nothing restarts.
 */
export function presentJobs(stored: readonly JobRecord[], runner: Pick<JobRunner, "isRunning" | "live">): JobRecord[] {
	return stored
		.filter((j) => j.state !== "dismissed")
		.map((j) => {
			if (j.state !== "running") return j;
			const live = runner.live(j.id);
			if (live) return live;
			return { ...j, state: "interrupted" as const, items: j.items.map((i) => (i.state === "pending" ? { ...i, message: "Not run: the app closed first." } : i)) };
		});
}

export async function dismissJob(vault: VaultPort, book: Book, job: JobRecord): Promise<void> {
	if (job.state === "running") throw new Error("A running job cannot be dismissed. Cancel it first.");
	await persist(vault, book, { ...job, state: "dismissed" });
}

export interface RunDeps {
	vault: VaultPort;
	book: Book;
	random: RandomPort;
	now: () => string;
	/** Called after every item so the UI can show progress. */
	onChange: (job: JobRecord) => void;
}

export type ChapterWork = (chapter: Chapter, signal: AbortSignal) => Promise<Pick<JobItem, "state" | "message">>;

/** Runs authorized jobs one at a time per book, with cancellation. Holds no state that outlives the app. */
export class JobRunner {
	private readonly active = new Map<string, AbortController>();
	private readonly liveJobs = new Map<string, JobRecord>();

	/** The in-memory state of a job this app instance is running right now. */
	live(id: string): JobRecord | undefined {
		return this.liveJobs.get(id);
	}

	isRunning(id: string): boolean {
		return this.active.has(id);
	}

	hasRunningJob(bookId: string): boolean {
		return this.active.has(bookId);
	}

	cancel(jobId: string): void {
		this.active.get(jobId)?.abort();
	}

	/** Count words for the given chapters. Each chapter succeeds or fails on its own. */
	runWordCounts(deps: RunDeps, chapters: readonly Chapter[]): Promise<JobRecord> {
		return this.runChapterJob(deps, "stats.words", "update-word-counts", chapters, async (chapter) => {
			const run = await runWordStats(deps.vault, deps.book, chapter, deps.now);
			return run.kind === "committed" ? { state: "done" } : { state: "discarded", message: run.reason };
		});
	}

	/**
	 * Run `work` for each chapter that has a note, one at a time. The authorization names the action the author asked for.
	 * A chapter's failure is recorded and the rest continue; cancel stops between chapters and aborts the one in flight.
	 */
	async runChapterJob(deps: RunDeps, kind: JobKind, action: string, chapters: readonly Chapter[], work: ChapterWork): Promise<JobRecord> {
		const { vault, book, now } = deps;
		const scope = chapters.filter((c) => c.notePath !== null);
		let job: JobRecord = {
			id: newId("jb", deps.random),
			bookId: book.id,
			kind,
			state: "running",
			authorization: { action, by: "user", at: now() },
			startedAt: now(),
			items: scope.map((c) => ({ chapterId: c.id, designation: c.designation, state: "pending" })),
		};
		const controller = new AbortController();
		this.active.set(job.id, controller);
		this.active.set(book.id, controller);
		try {
			await persist(vault, book, job);
			this.notify(deps, job);
			for (const [index, chapter] of scope.entries()) {
				if (controller.signal.aborted) break;
				const outcome = await this.runOne(chapter, work, controller.signal);
				job = { ...job, items: job.items.map((i, n) => (n === index ? { ...i, ...outcome } : i)) };
				this.notify(deps, job);
				if ((index + 1) % PERSIST_EVERY === 0) await persist(vault, book, job);
			}
			const canceled = controller.signal.aborted;
			job = { ...job, state: canceled ? "canceled" : "completed", finishedAt: now(), items: canceled ? job.items.map((i) => (i.state === "pending" ? { ...i, state: "canceled" } : i)) : job.items };
			await persist(vault, book, job);
			this.notify(deps, job);
			return job;
		} finally {
			this.active.delete(job.id);
			this.active.delete(book.id);
			this.liveJobs.delete(job.id);
		}
	}

	private notify(deps: RunDeps, job: JobRecord): void {
		this.liveJobs.set(job.id, job);
		deps.onChange(job);
	}

	private async runOne(chapter: Chapter, work: ChapterWork, signal: AbortSignal): Promise<Pick<JobItem, "state" | "message">> {
		try {
			return await work(chapter, signal);
		} catch (e) {
			if (e instanceof ModelError && e.kind === "canceled") return { state: "canceled" };
			return { state: "failed", message: e instanceof Error ? e.message : String(e) };
		}
	}
}
