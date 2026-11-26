import type { Book } from "../books";
import { readingOrder, type Chapter } from "../chapters";
import { meetsRequirement } from "../status";
import { parseChapter } from "./markdown";

export interface ExportIssue {
	severity: "error" | "warning";
	message: string;
	chapterId?: string;
}

export interface ExportChapter {
	chapter: Chapter;
	/** The text to export, or null when there is none to read. */
	text: string | null;
	/** A problem with this chapter's text that blocks a normal export, for example a translation that is out of date. */
	note?: string;
}

export interface ExportPlan {
	issues: ExportIssue[];
	/** Chapters that would go into the book, in the author's order. */
	included: ExportChapter[];
	/** Chapters that would be left out, with why: nothing is omitted without being listed. */
	omitted: Array<{ chapter: Chapter; reason: string }>;
}

/**
 * What an export would contain and what is wrong with it. Errors block a normal export; the author can still choose a
 * draft export, which lists exactly what is missing instead of hiding it.
 */
export function planExport(book: Book, items: readonly ExportChapter[], chaptersWithOpenProposals: ReadonlySet<string> = new Set()): ExportPlan {
	const issues: ExportIssue[] = [];
	const included: ExportChapter[] = [];
	const omitted: ExportPlan["omitted"] = [];
	const order = new Map(readingOrder(items.map((i) => i.chapter)).map((c, i) => [c.id, i] as const));
	const ordered = [...items].sort((a, b) => (order.get(a.chapter.id) as number) - (order.get(b.chapter.id) as number));
	if (ordered.length === 0) issues.push({ severity: "error", message: "The book has no chapters." });
	if (!book.author) issues.push({ severity: "error", message: "The author is not set. Add an author: property to the book note." });
	for (const item of ordered) {
		const { chapter, text, note } = item;
		const fail = (reason: string) => {
			issues.push({ severity: "error", message: `${chapter.designation}: ${reason}`, chapterId: chapter.id });
			omitted.push({ chapter, reason });
		};
		if (chapter.notePath === null) fail("planned, but no note is bound to it yet.");
		else if (text === null) fail(note ?? "its note was not found.");
		else if (parseChapter(text).blocks.length === 0) fail("it has no text.");
		else {
			const parsed = parseChapter(text);
			included.push(item);
			if (note !== undefined) issues.push({ severity: "error", message: `${chapter.designation}: ${note}`, chapterId: chapter.id });
			if (!meetsRequirement(chapter.status, book.completion.chapterStatus)) issues.push({ severity: "error", message: `${chapter.designation} is ${chapter.status}; this book requires ${book.completion.chapterStatus}.`, chapterId: chapter.id });
			if (chaptersWithOpenProposals.has(chapter.id)) issues.push({ severity: "warning", message: `${chapter.designation} has proposed changes still waiting for your decision; they are not in the export.`, chapterId: chapter.id });
			if (parsed.unsupported.length > 0) issues.push({ severity: "warning", message: `${chapter.designation} contains ${parsed.unsupported.join(", ")}, which the export keeps as plain paragraphs.`, chapterId: chapter.id });
			if (parsed.embeds > 0) issues.push({ severity: "warning", message: `${chapter.designation} has ${parsed.embeds} embedded file${parsed.embeds === 1 ? "" : "s"} (images) that the export leaves out; illustrations are not supported yet.`, chapterId: chapter.id });
		}
	}
	return { issues, included, omitted };
}

export const blocksExport = (plan: ExportPlan): boolean => plan.issues.some((i) => i.severity === "error");
