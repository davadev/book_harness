import type { OllamaClient } from "./ai/ollama";
import { normalize, parseVectors, serializeVectors, vectorKey, type VectorEntry, type VectorFile } from "./vectors";

export type Freshness = "missing" | "current" | "partial" | "incompatible";

export interface IndexStatus {
	state: Freshness;
	/** Passages that currently have a usable vector, and passages in the book. */
	indexed: number;
	total: number;
	/** The model the stored vectors were made with, if any. */
	builtWith: string | null;
}

/** Where derived data lives: the plugin's own folder, device-local, never in the book. Anything missing is "not built". */
export interface IndexStorePort {
	read(key: string): Promise<ArrayBuffer | null>;
	write(key: string, data: ArrayBuffer): Promise<void>;
}

const BATCH = 16;

export interface PassageKey {
	chapterId: string;
	id: string;
}

/**
 * The meaning index of one book. Vectors are tied to the model that made them: a different model, or different text,
 * makes them stale, never silently reused. Disposable and rebuildable at any time.
 */
export class VectorIndex {
	private file: VectorFile | null = null;

	constructor(private readonly bookId: string) {}

	private get key(): string {
		return `${this.bookId}.bin`;
	}

	async load(store: IndexStorePort): Promise<void> {
		const data = await store.read(this.key);
		this.file = data ? parseVectors(data) : null;
	}

	private async save(store: IndexStorePort): Promise<void> {
		await store.write(this.key, serializeVectors(this.file as VectorFile));
	}

	status(passages: readonly PassageKey[], model: string): IndexStatus {
		if (!this.file) return { state: "missing", indexed: 0, total: passages.length, builtWith: null };
		if (this.file.model !== model) return { state: "incompatible", indexed: 0, total: passages.length, builtWith: this.file.model };
		const have = new Set(this.file.entries.map((e) => vectorKey(e.chapterId, e.passageId)));
		const indexed = passages.filter((p) => have.has(vectorKey(p.chapterId, p.id))).length;
		return { state: indexed === passages.length && passages.length > 0 ? "current" : "partial", indexed, total: passages.length, builtWith: this.file.model };
	}

	/** Vectors that are usable right now: made by this model, for passages that still exist with the same words. */
	usable(passages: readonly PassageKey[], model: string): VectorEntry[] {
		if (!this.file || this.file.model !== model) return [];
		const live = new Set(passages.map((p) => vectorKey(p.chapterId, p.id)));
		return this.file.entries.filter((e) => live.has(vectorKey(e.chapterId, e.passageId)));
	}

	/**
	 * Embed what a chapter is missing, in small batches, and drop vectors of passages that no longer exist. Saved at the
	 * end, so cancelling part-way keeps what was stored before and wastes nothing already saved.
	 */
	async buildChapter(client: OllamaClient, store: IndexStorePort, model: string, chapterId: string, passages: ReadonlyArray<PassageKey & { text: string }>, signal?: AbortSignal): Promise<number> {
		if (this.file && this.file.model !== model) this.file = null;
		const kept = (this.file?.entries ?? []).filter((e) => e.chapterId !== chapterId || passages.some((p) => p.id === e.passageId));
		const have = new Set(kept.map((e) => vectorKey(e.chapterId, e.passageId)));
		const todo = passages.filter((p) => !have.has(vectorKey(chapterId, p.id)));
		const added: VectorEntry[] = [];
		let dims = this.file?.dims ?? 0;
		for (let i = 0; i < todo.length; i += BATCH) {
			const batch = todo.slice(i, i + BATCH);
			const r = await client.embed(model, batch.map((p) => p.text), signal);
			batch.forEach((p, n) => {
				const vector = normalize(r.embeddings[n]);
				dims = vector.length;
				added.push({ chapterId, passageId: p.id, vector });
			});
		}
		const consistent = [...kept, ...added].filter((e) => e.vector.length === dims);
		this.file = { model, dims, entries: consistent };
		await this.save(store);
		return added.length;
	}

	/** Forget vectors of chapters that no longer exist. */
	async dropChapters(store: IndexStorePort, chapterIds: readonly string[]): Promise<void> {
		if (!this.file || chapterIds.length === 0) return;
		const before = this.file.entries.length;
		this.file = { ...this.file, entries: this.file.entries.filter((e) => !chapterIds.includes(e.chapterId)) };
		if (this.file.entries.length !== before) await this.save(store);
	}
}
