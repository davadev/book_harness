import type { Book } from "./books";
import { KeywordIndex, snippet, type IndexedPassage } from "./bm25";
import type { Chapter } from "./chapters";
import { activeEntities, listAllEntities } from "./entities";
import { VectorIndex, type IndexStatus, type IndexStorePort } from "./embeddings";
import { loadEvidence } from "./extraction";
import { KnowledgeGraph, buildGraph, expandPassage, type GraphInput, type PassageContext } from "./graph";
import { entitiesForChapter, findOccurrences, loadCorrections } from "./occurrences";
import { passagesOf } from "./passages";
import type { VaultPort } from "./ports";
import { revisionOf } from "./revision";
import { fuse } from "./rrf";
import { normalize, nearest, vectorKey } from "./vectors";
import type { OllamaClient } from "./ai/ollama";

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
	/** 1-based rank in the keyword list and in the meaning list; null when that search did not return it. */
	channels: { keyword: number | null; meaning: number | null };
}

export interface MeaningInfo {
	requested: boolean;
	/** Whether meaning results were actually mixed in. */
	used: boolean;
	status: IndexStatus | null;
	/** Why meaning search was not used, in plain words. */
	note: string | null;
}

export interface SearchOutcome {
	query: string;
	/** What the search was narrowed to. */
	filter: SearchFilter;
	results: SearchResult[];
	/** What the index covers right now, so the author can see how much was searched. */
	passagesIndexed: number;
	chaptersIndexed: number;
	/** Chapters without a note are not searchable; they are named so a gap is not mistaken for "not found". */
	missingChapters: string[];
	meaning: MeaningInfo;
}

/** Narrow a search to one chapter and/or to passages that name one entity. */
export interface SearchFilter {
	chapterId?: string;
	entityId?: string;
}

export interface Semantic {
	client: OllamaClient;
	model: string;
	store: IndexStorePort;
}

const POOL = 50;

/** One keyword index and one meaning index per book, so a search can never see another book's text. */
export class BookSearch {
	private readonly indexes = new Map<string, KeywordIndex>();
	private readonly vectors = new Map<string, VectorIndex>();

	/** Bring the keyword index up to date with the notes as they are now (deterministic; no model). */
	private async sync(vault: VaultPort, book: Book, chapters: readonly Chapter[]) {
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
		return { index, withNotes, texts, missing: chapters.filter((c) => !known.has(c.id)) };
	}

	private async vectorIndex(book: Book, store: IndexStorePort): Promise<VectorIndex> {
		let v = this.vectors.get(book.id);
		if (!v) {
			v = new VectorIndex(book.id);
			await v.load(store);
			this.vectors.set(book.id, v);
		}
		return v;
	}

	/** How much of the book the meaning index covers for this model. Reads files and the local index only: no model call. */
	async meaningStatus(vault: VaultPort, book: Book, chapters: readonly Chapter[], store: IndexStorePort, model: string): Promise<IndexStatus> {
		const { index } = await this.sync(vault, book, chapters);
		return (await this.vectorIndex(book, store)).status(index.passages().map((p) => ({ chapterId: p.chapterId, id: p.id })), model);
	}

	/** Embed one chapter's passages that are missing from the meaning index. Only ever runs because the author asked. */
	async buildChapterVectors(vault: VaultPort, book: Book, chapters: readonly Chapter[], chapter: Chapter, semantic: Semantic, signal?: AbortSignal): Promise<number> {
		const { index, missing } = await this.sync(vault, book, chapters);
		const vectors = await this.vectorIndex(book, semantic.store);
		await vectors.dropChapters(semantic.store, missing.map((c) => c.id));
		return vectors.buildChapter(semantic.client, semantic.store, semantic.model, chapter.id, index.passages().filter((p) => p.chapterId === chapter.id), signal);
	}

	/**
	 * The book's graph and a bounded view of everything around one passage: who is named in it, what each chapter's text
	 * supports about them, who else appears with them. Built from the notes as they are now; nothing is inferred by a model.
	 */
	async context(vault: VaultPort, book: Book, chapters: readonly Chapter[], ref: Pick<PassageRef, "chapterId" | "passageId">): Promise<PassageContext> {
		const { index, withNotes, texts } = await this.sync(vault, book, chapters);
		const all = (await listAllEntities(vault, book)).entities;
		const evidence = (await Promise.all(withNotes.map((c) => loadEvidence(vault, book, c.id)))).filter((e): e is NonNullable<typeof e> => e !== null);
		const mentions: Array<GraphInput["mentions"][number]> = [];
		const present = new Map<string, (typeof all)[number]>();
		for (const c of withNotes) {
			const corrections = await loadCorrections(vault, book, c.id);
			const ids = [...(evidence.find((e) => e.chapterId === c.id)?.items.map((i) => i.entityId) ?? []), ...corrections.manual.map((x) => x.entityId)];
			const here = entitiesForChapter(all, ids);
			for (const e of here) present.set(e.id, e);
			for (const o of findOccurrences(texts.get(c.id) as string, activeEntities(here), corrections)) mentions.push({ chapterId: c.id, entityId: o.entityId, from: o.from, to: o.to, source: o.source });
		}
		const input: GraphInput = { chaptersInOrder: withNotes.map((c) => ({ id: c.id, designation: c.designation })), passages: index.passages().map((p) => ({ chapterId: p.chapterId, passageId: p.id, start: p.start, end: p.end })), entities: [...present.values()], mentions, evidence };
		const graph: KnowledgeGraph = buildGraph(input);
		return expandPassage(graph, input, ref);
	}

	async search(vault: VaultPort, book: Book, chapters: readonly Chapter[], query: string, limit = 20, semantic: Semantic | null = null, filter: SearchFilter = {}): Promise<SearchOutcome> {
		const { index, withNotes, texts, missing } = await this.sync(vault, book, chapters);
		const keyword = index.search(query, POOL);
		const meaning: MeaningInfo = { requested: semantic !== null, used: false, status: null, note: null };
		let ranked = keyword.map((h) => ({ key: vectorKey(h.passage.chapterId, h.passage.id), passage: h.passage, matched: h.matched, score: h.score, ranks: [keyword.indexOf(h) + 1, null] as [number | null, number | null] }));
		if (semantic) {
			const vectors = await this.vectorIndex(book, semantic.store);
			const keys = index.passages().map((p) => ({ chapterId: p.chapterId, id: p.id }));
			meaning.status = vectors.status(keys, semantic.model);
			const usable = vectors.usable(keys, semantic.model);
			if (usable.length === 0) meaning.note = meaning.status.state === "incompatible" ? `The meaning index was built with ${meaning.status.builtWith as string}; build it again for ${semantic.model}.` : "The meaning index has not been built yet.";
			else {
				try {
					const q = normalize((await semantic.client.embed(semantic.model, [query])).embeddings[0]);
					const near = nearest(q, usable.filter((e) => e.vector.length === q.length), POOL).filter((n) => n.similarity > 0);
					const fused = fuse([keyword.map((h) => ({ key: vectorKey(h.passage.chapterId, h.passage.id) })), near.map((n) => ({ key: vectorKey(n.entry.chapterId, n.entry.passageId) }))]);
					const passageOf = (key: string): IndexedPassage | undefined => keyword.find((h) => vectorKey(h.passage.chapterId, h.passage.id) === key)?.passage ?? index.passages().find((p) => vectorKey(p.chapterId, p.id) === key);
					ranked = fused.map((f) => {
						const passage = passageOf(f.key) as IndexedPassage;
						return { key: f.key, passage, matched: keyword.find((h) => vectorKey(h.passage.chapterId, h.passage.id) === f.key)?.matched ?? [], score: f.score, ranks: [f.ranks[0], f.ranks[1]] as [number | null, number | null] };
					});
					meaning.used = true;
					if (meaning.status.state !== "current") meaning.note = `The meaning index covers ${meaning.status.indexed} of ${meaning.status.total} passages; the rest were searched by keyword only.`;
				} catch (e) {
					meaning.note = `Meaning search was not used: ${(e as Error).message} Keyword results are shown.`;
				}
			}
		}
		const all = (await listAllEntities(vault, book)).entities;
		const mentions = new Map<string, { names: Map<string, string>; found: ReturnType<typeof findOccurrences> }>();
		const results: SearchResult[] = [];
		for (const h of ranked) {
			if (results.length >= limit) break;
			if (filter.chapterId !== undefined && h.passage.chapterId !== filter.chapterId) continue;
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
			const here = m.found.filter((o) => o.from >= h.passage.start && o.to <= h.passage.end);
			if (filter.entityId !== undefined && !here.some((o) => o.entityId === filter.entityId)) continue;
			const named = [...new Set(here.map((o) => names.get(o.entityId) as string))];
			results.push({ ref: refOf(book, h.passage), chapter: chapter.designation, notePath: chapter.notePath as string, snippet: snippet(h.passage.text, h.matched), score: h.score, entities: named, provenance: "manuscript", channels: { keyword: h.ranks[0], meaning: h.ranks[1] } });
		}
		return { query, filter, results, passagesIndexed: index.size, chaptersIndexed: withNotes.length, missingChapters: missing.map((c) => c.designation), meaning };
	}
}

const refOf = (book: Book, p: IndexedPassage): PassageRef => ({ bookId: book.id, chapterId: p.chapterId, passageId: p.id, sourceRevision: p.sourceRevision, start: p.start, end: p.end });
