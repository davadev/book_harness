import type { Passage } from "./passages";

const K1 = 1.2;
const B = 0.75;
const TOKEN = /[\p{L}\p{N}]+/gu;

/** Lowercase whole words. No stemming, so invented words and names are found exactly as written. */
export function tokenize(text: string): string[] {
	return (text.normalize("NFC").toLowerCase().match(TOKEN) ?? []);
}

export interface IndexedPassage extends Passage {
	chapterId: string;
	sourceRevision: string;
}

export interface Hit {
	passage: IndexedPassage;
	score: number;
	/** Query words that occur in this passage. */
	matched: string[];
}

/**
 * Keyword index over passages of ONE book (it is created per book, so results can never mix books). Pure and in memory;
 * rebuilt from the chapters at any time.
 */
export class KeywordIndex {
	private readonly docs = new Map<string, { passage: IndexedPassage; tf: Map<string, number>; length: number }>();
	private readonly revisions = new Map<string, string>();

	revisionOf(chapterId: string): string | undefined {
		return this.revisions.get(chapterId);
	}

	get size(): number {
		return this.docs.size;
	}

	/** Replace everything stored for a chapter. Cheap enough to do on every change; no model is involved. */
	setChapter(chapterId: string, sourceRevision: string, passages: readonly Passage[]): void {
		this.removeChapter(chapterId);
		this.revisions.set(chapterId, sourceRevision);
		for (const p of passages) {
			const tf = new Map<string, number>();
			const tokens = tokenize(p.text);
			for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
			this.docs.set(`${chapterId}:${p.ordinal}`, { passage: { ...p, chapterId, sourceRevision }, tf, length: tokens.length });
		}
	}

	removeChapter(chapterId: string): void {
		this.revisions.delete(chapterId);
		for (const key of [...this.docs.keys()]) if (key.startsWith(`${chapterId}:`)) this.docs.delete(key);
	}

	search(query: string, limit = 20): Hit[] {
		const terms = [...new Set(tokenize(query))];
		if (terms.length === 0 || this.docs.size === 0) return [];
		const n = this.docs.size;
		let total = 0;
		for (const d of this.docs.values()) total += d.length;
		const avg = total / n;
		const df = new Map(terms.map((t) => [t, [...this.docs.values()].filter((d) => d.tf.has(t)).length]));
		const phrase = query.trim().toLowerCase();
		const hits: Hit[] = [];
		for (const d of this.docs.values()) {
			let score = 0;
			const matched: string[] = [];
			for (const t of terms) {
				const f = d.tf.get(t);
				if (f === undefined) continue;
				matched.push(t);
				const idf = Math.log(1 + (n - (df.get(t) as number) + 0.5) / ((df.get(t) as number) + 0.5));
				score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.length) / avg)));
			}
			if (matched.length === 0) continue;
			// A passage containing the whole phrase as written ranks above one that merely has the words.
			if (terms.length > 1 && d.passage.text.toLowerCase().includes(phrase)) score *= 1.5;
			hits.push({ passage: d.passage, score, matched });
		}
		return hits.sort((a, b) => b.score - a.score || a.passage.chapterId.localeCompare(b.passage.chapterId) || a.passage.ordinal - b.passage.ordinal).slice(0, limit);
	}
}

/** A short excerpt around the first matched word, cut on word boundaries. */
export function snippet(text: string, words: readonly string[], radius = 90): string {
	const lower = text.toLowerCase();
	const at = words.map((w) => lower.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
	let from = Math.max(0, at - radius);
	let to = Math.min(text.length, at + radius);
	if (from > 0) from = text.indexOf(" ", from) < 0 ? from : text.indexOf(" ", from) + 1;
	if (to < text.length) to = text.lastIndexOf(" ", to) > from ? text.lastIndexOf(" ", to) : to;
	return `${from > 0 ? "…" : ""}${text.slice(from, to).replace(/\s+/g, " ").trim()}${to < text.length ? "…" : ""}`;
}
