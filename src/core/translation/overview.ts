import type { Book } from "../books";
import { readingOrder, type Chapter } from "../chapters";
import { meetsRequirement } from "../status";
import type { VaultPort } from "../ports";
import type { Todo } from "../todos";
import { splitBlocks } from "./blocks";
import { languageName } from "./translate";
import { loadVariant, translationStatus, type ConflictRecord, type TranslationStatus } from "./store";

export interface TranslationRow {
	chapter: Chapter;
	status: TranslationStatus;
	conflicts: ConflictRecord[];
	/** Paragraphs that would be sent to the model by an update. */
	toTranslate: number;
}

export interface LanguageOverview {
	language: string;
	name: string;
	rows: TranslationRow[];
	/** Paragraphs an update of the whole language would send to the model. */
	toTranslate: number;
}

/** Every target language of the book with the state of each chapter's translation. Reads notes only: no model, nothing written. */
export async function loadTranslationOverview(vault: VaultPort, book: Book, chapters: readonly Chapter[]): Promise<LanguageOverview[]> {
	const out: LanguageOverview[] = [];
	for (const language of book.targetLanguages) {
		const rows: TranslationRow[] = [];
		for (const chapter of readingOrder(chapters)) {
			const source = chapter.notePath !== null && vault.exists(chapter.notePath) ? await vault.read(chapter.notePath) : null;
			let status: TranslationStatus;
			let conflicts: ConflictRecord[] = [];
			try {
				const loaded = await loadVariant(vault, book, chapter, language);
				status = translationStatus(language, source, loaded);
				conflicts = loaded?.alignment.conflicts ?? [];
			} catch (e) {
				status = { language, state: "broken", plan: null, conflicts: 0, problem: (e as Error).message };
			}
			const toTranslate = status.state === "missing" ? splitBlocks(source as string).filter((b) => b.translatable).length : status.plan ? status.plan.counts.translate + status.plan.counts.retranslate : 0;
			rows.push({ chapter, status, conflicts, toTranslate });
		}
		out.push({ language, name: languageName(language), rows, toTranslate: rows.reduce((n, r) => n + r.toTranslate, 0) });
	}
	return out;
}

/** What is missing or out of date, as to-dos. A missing translation only counts once the chapter itself is finished. */
export function translationTodos(book: Book, overview: readonly LanguageOverview[]): Todo[] {
	const todos: Todo[] = [];
	for (const lang of overview)
		for (const { chapter, status } of lang.rows) {
			const base = { kind: "translation" as const, severity: "required" as const, chapterId: chapter.id };
			const id = (kind: string) => `translation-${kind}:${lang.language}:${chapter.id}`;
			if (status.state === "missing" && meetsRequirement(chapter.status, book.completion.chapterStatus)) todos.push({ ...base, id: id("missing"), message: `${chapter.designation} has no ${lang.name} translation yet.` });
			else if (status.state === "stale") todos.push({ ...base, id: id("stale"), message: `The ${lang.name} translation of ${chapter.designation} is out of date: the chapter changed since it was translated.` });
			else if (status.state === "conflicts") todos.push({ ...base, id: id("conflicts"), message: `The ${lang.name} translation of ${chapter.designation} has ${status.conflicts} change${status.conflicts === 1 ? "" : "s"} waiting for your decision.` });
			else if (status.state === "broken") todos.push({ ...base, id: id("broken"), message: `The ${lang.name} translation of ${chapter.designation} cannot be read: ${status.problem as string}` });
		}
	return todos;
}
