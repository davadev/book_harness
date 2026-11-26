import type { Book } from "./books";
import { KeywordIndex, snippet, type IndexedPassage } from "./bm25";
import type { Chapter } from "./chapters";
import { activeEntities, listAllEntities } from "./entities";
import { loadEvidence } from "./extraction";
import { entitiesForChapter, findOccurrences, loadCorrections } from "./occurrences";
import { passagesOf } from "./passages";
import type { VaultPort } from "./ports";
import { revisionOf } from "./revision";

/** A stable pointer to a passage: enough to open it, and to tell if it has changed since. */
export interface PassageRef {
	bookId: string;
	chapterId: string;
	passageId: string;
	sourceRevision: string;
	start: number;
	end: number;
}

export interface SearchResult {
	ref: PassageRef;
	chapter: string;
	notePath: string;
	snippet: string;
	score: number;
	/** Entities named in the passage (recognized by exact name, from entities the chapter is known to contain). */
	entities: string[];
	provenance: "manuscript";
}

export interface SearchOutcome {
	query: string;
	results: SearchResult[];
	/** What the index covers right now, so the author can see how much was searched. */
	passagesIndexed: number;
	chaptersIndexed: number;
	/** Chapters without a note are not searchable; they are named so a gap is not mistaken for "not found". */
	missingChapters: string[];
}

/** One keyword index per book, so a search can never see another book's text. */
export class BookSearch {
	private readonly indexes = new Map<string, KeywordIndex>();

	/** Bring the book's index up to date with the notes as they are now (deterministic; no model), then search it. */
	async search(vault: VaultPort, book: Book, chapters: readonly Chapter[], query: string, limit = 20): Promise<SearchOutcome> {
		const index = this.indexes.get(book.id) ?? new KeywordIndex();
		this.indexes.set(book.id, index);
		const withNotes = chapters.filter((c) => c.notePath !== null && vault.exists(c.notePath));
		const known = new Set(withNotes.map((c) => c.id));
		for (const c of chapters) if (!known.has(c.id)) index.removeChapter(c.id);
		const texts = new Map<string, string>();
		for (const c of withNotes) {
			const text = await vault.read(c.notePath as string);
			texts.set(c.id, text);
			const revision = revisionOf(text);
			if (index.revisionOf(c.id) !== revision) index.setChapter(c.id, revision, passagesOf(text));
		}
		const hits = index.search(query, limit);
		const all = (await listAllEntities(vault, book)).entities;
		const mentions = new Map<string, { names: Map<string, string>; found: ReturnType<typeof findOccurrences> }>();
		const results: SearchResult[] = [];
		for (const h of hits) {
			const chapter = withNotes.find((c) => c.id === h.passage.chapterId) as Chapter;
			let m = mentions.get(chapter.id);
			if (!m) {
				const evidence = await loadEvidence(vault, book, chapter.id);
				const corrections = await loadCorrections(vault, book, chapter.id);
				const present = entitiesForChapter(all, [...(evidence?.items.map((i) => i.entityId) ?? []), ...corrections.manual.map((x) => x.entityId)]);
				m = { names: new Map(present.map((e) => [e.id, e.name])), found: findOccurrences(texts.get(chapter.id) as string, activeEntities(present), corrections) };
				mentions.set(chapter.id, m);
			}
			const names = m.names;
			const named = [...new Set(m.found.filter((o) => o.from >= h.passage.start && o.to <= h.passage.end).map((o) => names.get(o.entityId) as string))];
			results.push({ ref: refOf(book, h.passage), chapter: chapter.designation, notePath: chapter.notePath as string, snippet: snippet(h.passage.text, h.matched), score: h.score, entities: named, provenance: "manuscript" });
		}
		return { query, results, passagesIndexed: index.size, chaptersIndexed: withNotes.length, missingChapters: chapters.filter((c) => !known.has(c.id)).map((c) => c.designation) };
	}
}

const refOf = (book: Book, p: IndexedPassage): PassageRef => ({ bookId: book.id, chapterId: p.chapterId, passageId: p.id, sourceRevision: p.sourceRevision, start: p.start, end: p.end });
