import { MANAGED_FOLDER, type Book } from "./books";
import type { Chapter } from "./chapters";
import { ManagedNoteError, parseManagedNote, serializeManagedNote } from "./managed-note";
import type { VaultPort } from "./ports";
import { TASKS, executeWordStats, taskInput, type TaskId, type WordStats } from "./tasks";

const STATE_SCHEMA = 1;
const FENCE = /```bh-records\n([\s\S]*?)\n```/;

export type TaskStatus = "not_processed" | "current" | "stale" | "failed" | "canceled";

/** The outcome of one task for one chapter, tied to the exact input it was computed from. */
export interface TaskRecord {
	task: TaskId;
	chapterId: string;
	fingerprint: string;
	sourceRevision: string;
	outcome: "succeeded" | "failed" | "canceled";
	finishedAt: string;
	result?: WordStats;
	error?: string;
}

export const statePath = (book: Book, chapterId: string): string => `${book.folder}/${MANAGED_FOLDER}/state/${chapterId}.md`;

function serialize(chapterId: string, bookId: string, records: readonly TaskRecord[]): string {
	return serializeManagedNote({
		frontmatter: { bh_schema: STATE_SCHEMA, bh_type: "task-state", bh_id: chapterId, bh_book: bookId },
		body: `# Task state\n\nDerived results for one chapter. Safe to delete: they are recalculated on request.\n\n\`\`\`bh-records\n${JSON.stringify(records, null, 1)}\n\`\`\`\n`,
	});
}

function parseRecords(text: string): TaskRecord[] {
	const note = parseManagedNote(text);
	if (note.frontmatter.bh_type !== "task-state") throw new ManagedNoteError("This note is not a task state record.");
	if (note.frontmatter.bh_schema > STATE_SCHEMA) throw new ManagedNoteError("Written by a newer Book Harness; update the plugin.");
	const m = FENCE.exec(note.body);
	if (!m) throw new ManagedNoteError("Task state has no records block.");
	let data: unknown;
	try {
		data = JSON.parse(m[1]);
	} catch {
		throw new ManagedNoteError("Task state records are not valid JSON.");
	}
	if (!Array.isArray(data)) throw new ManagedNoteError("Task state records must be a list.");
	// Unknown tasks (written by a newer version) and malformed entries are dropped, never trusted.
	return data.filter((r): r is TaskRecord => !!r && typeof r === "object" && (r as TaskRecord).task in TASKS && typeof (r as TaskRecord).fingerprint === "string" && ["succeeded", "failed", "canceled"].includes((r as TaskRecord).outcome));
}

/** Records for a chapter. A missing file means nothing has been processed; an unreadable one is an error, not "empty". */
export async function loadRecords(vault: VaultPort, book: Book, chapterId: string): Promise<TaskRecord[]> {
	const path = statePath(book, chapterId);
	return vault.exists(path) ? parseRecords(await vault.read(path)) : [];
}

/** Insert or replace this task's record (one record per task per chapter), refusing to clobber a concurrent change. */
export async function saveRecord(vault: VaultPort, book: Book, record: TaskRecord): Promise<void> {
	const path = statePath(book, record.chapterId);
	if (!vault.exists(path)) {
		await vault.create(path, serialize(record.chapterId, book.id, [record]));
		return;
	}
	const before = await vault.read(path);
	const next = [...parseRecords(before).filter((r) => r.task !== record.task), record];
	if (!(await vault.replaceIfUnchanged(path, before, serialize(record.chapterId, book.id, next)))) throw new Error("Task state changed on another device; try again.");
}

/** Status of a task for a chapter given the fingerprint of its input right now. */
export function statusOf(record: TaskRecord | undefined, currentFingerprint: string): TaskStatus {
	if (!record) return "not_processed";
	if (record.outcome === "failed") return "failed";
	if (record.outcome === "canceled") return "canceled";
	return record.fingerprint === currentFingerprint ? "current" : "stale";
}

export type RunResult = { kind: "committed"; record: TaskRecord } | { kind: "discarded-stale"; reason: string };

/**
 * Run the word-count task for one chapter. The manuscript is only read. The result is committed only if the note's
 * revision is still the one the work started from; otherwise it is discarded, so an older result can never be
 * marked current for newer text.
 */
export async function runWordStats(vault: VaultPort, book: Book, chapter: Chapter, now: () => string): Promise<RunResult> {
	if (chapter.notePath === null) throw new Error(`${chapter.designation} has no manuscript note.`);
	const text = await vault.read(chapter.notePath);
	const input = taskInput("stats.words", chapter, text);
	const result = executeWordStats(text);
	const after = taskInput("stats.words", chapter, await vault.read(chapter.notePath));
	if (after.fingerprint !== input.fingerprint) return { kind: "discarded-stale", reason: `${chapter.designation} changed while it was being counted.` };
	const record: TaskRecord = { task: "stats.words", chapterId: chapter.id, fingerprint: input.fingerprint, sourceRevision: input.sourceRevision, outcome: "succeeded", finishedAt: now(), result };
	await saveRecord(vault, book, record);
	return { kind: "committed", record };
}

export interface ChapterStats {
	words: number | null;
	status: TaskStatus;
}

/** What the panel shows for one chapter: the last known count and whether it still matches the text. */
export async function chapterStats(vault: VaultPort, book: Book, chapter: Chapter): Promise<ChapterStats> {
	if (chapter.notePath === null || !vault.exists(chapter.notePath)) return { words: null, status: "not_processed" };
	const record = (await loadRecords(vault, book, chapter.id)).find((r) => r.task === "stats.words");
	const current = taskInput("stats.words", chapter, await vault.read(chapter.notePath));
	return { words: record?.result?.words ?? null, status: statusOf(record, current.fingerprint) };
}

export interface UpdateSummary {
	committed: number;
	discarded: string[];
	failed: string[];
}

/**
 * User-initiated batch: count every chapter that has a note. One chapter failing does not affect the others;
 * results that went stale mid-run are reported, not stored.
 */
export async function updateAllStats(vault: VaultPort, book: Book, chapters: readonly Chapter[], now: () => string): Promise<UpdateSummary> {
	const summary: UpdateSummary = { committed: 0, discarded: [], failed: [] };
	for (const chapter of chapters.filter((c) => c.notePath !== null)) {
		try {
			const run = await runWordStats(vault, book, chapter, now);
			if (run.kind === "committed") summary.committed++;
			else summary.discarded.push(run.reason);
		} catch (e) {
			summary.failed.push(`${chapter.designation}: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
	return summary;
}
