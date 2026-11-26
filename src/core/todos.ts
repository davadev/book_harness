import type { Book } from "./books";
import { findConflicts, findGaps, readingOrder, type Chapter } from "./chapters";
import { meetsRequirement } from "./status";

export type TodoKind = "chapter-unfinished" | "chapter-no-file" | "chapter-note-missing" | "chapter-gap" | "chapter-conflict";

export interface Todo {
	/** Stable: the same situation always yields the same id, so lists dedupe and resolved items disappear on their own. */
	id: string;
	kind: TodoKind;
	/** required: the book's own configuration says it must be done. info: worth knowing, not a requirement. */
	severity: "required" | "info";
	message: string;
	chapterId?: string;
	/** Note the author can open to act on it. */
	notePath?: string;
}

/** Deterministic: derived only from configuration and recorded state. No model, no inference, nothing persisted. */
export function deriveTodos(book: Book, chapters: readonly Chapter[], exists: (path: string) => boolean): Todo[] {
	const out: Todo[] = [];
	for (const c of readingOrder(chapters)) {
		if (c.notePath === null) {
			out.push({ id: `chapter-no-file:${c.id}`, kind: "chapter-no-file", severity: "required", chapterId: c.id, message: `${c.designation} has no manuscript note yet.` });
			continue;
		}
		if (!exists(c.notePath)) {
			out.push({ id: `chapter-note-missing:${c.id}`, kind: "chapter-note-missing", severity: "required", chapterId: c.id, message: `The note for ${c.designation} was not found (${c.notePath}).` });
			continue;
		}
		if (!meetsRequirement(c.status, book.completion.chapterStatus)) {
			out.push({ id: `chapter-unfinished:${c.id}`, kind: "chapter-unfinished", severity: "required", chapterId: c.id, notePath: c.notePath, message: `${c.designation} is ${c.status}; this book requires ${book.completion.chapterStatus}.` });
		}
	}
	for (const n of findGaps(chapters)) out.push({ id: `chapter-gap:${n}`, kind: "chapter-gap", severity: "info", message: `There is no "Chapter ${n}" between the first and last numbered chapters.` });
	for (const c of findConflicts(chapters)) out.push({ id: `chapter-conflict:${c.kind}:${c.chapterIds.join(",")}`, kind: "chapter-conflict", severity: "required", message: c.detail });
	return out;
}
