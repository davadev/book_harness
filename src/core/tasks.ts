import type { Chapter } from "./chapters";
import { countWords } from "./words";
import { fingerprint, revisionOf } from "./revision";

/** Tasks are single-purpose and independent. `version` changes whenever the task's logic changes, which marks old results stale. */
export const TASKS = {
	"stats.words": { id: "stats.words", version: 1, label: "Word count", usesModel: false },
} as const;

export type TaskId = keyof typeof TASKS;

export interface TaskInput {
	task: TaskId;
	chapter: Chapter;
	sourceRevision: string;
	fingerprint: string;
}

export function taskInput(task: TaskId, chapter: Chapter, noteText: string): TaskInput {
	const sourceRevision = revisionOf(noteText);
	return { task, chapter, sourceRevision, fingerprint: fingerprint({ task, version: TASKS[task].version, source: sourceRevision }) };
}

export interface WordStats {
	words: number;
}

export function executeWordStats(noteText: string): WordStats {
	return { words: countWords(noteText) };
}
