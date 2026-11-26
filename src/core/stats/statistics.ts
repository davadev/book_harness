import { maskProse, WORD } from "../words";
import { adjectiveSupport, looksLikeAdjective, type AdjectiveSupport } from "./adjectives";
import { stopwordsFor } from "./stopwords";

/**
 * Deterministic text statistics. No model is involved and nothing here judges the writing: a word used often is a fact,
 * not a defect, and fictional names are left out of the lists. Every figure points back to places in the text.
 */
export interface StatsChapterInput {
	id: string;
	designation: string;
	text: string;
}

export interface Occurrence {
	chapterId: string;
	designation: string;
	start: number;
	end: number;
}

export interface WordRow {
	word: string;
	count: number;
	per1000: number;
	chapters: number;
	occurrences: Occurrence[];
}

export interface ChapterMetrics {
	id: string;
	designation: string;
	words: number;
	unique: number;
	sentences: number;
	averageSentence: number;
	longestSentence: number;
	paragraphs: number;
}

export interface Cluster {
	word: string;
	count: number;
	/** The window, in words, the occurrences fall within. */
	span: number;
	first: Occurrence;
	occurrences: Occurrence[];
}

export interface Phrase {
	phrase: string;
	count: number;
	occurrences: Occurrence[];
}

export interface BookStatistics {
	language: string;
	/** Whether a stopword list exists for the language; without one, function words appear in the frequency list. */
	stopwords: boolean;
	totalWords: number;
	uniqueWords: number;
	chapters: ChapterMetrics[];
	frequent: WordRow[];
	clusters: Cluster[];
	phrases: Phrase[];
	adjectives: { support: AdjectiveSupport; rows: WordRow[] };
}

export interface StatsOptions {
	language: string;
	/** Words that are not counted in the lists: names of characters, places and so on, plus anything the author adds. */
	ignore: ReadonlySet<string>;
	top?: number;
	clusterWindow?: number;
	clusterMin?: number;
	phraseMin?: number;
}

const MAX_OCCURRENCES = 200;
const key = (w: string): string => w.normalize("NFC").toLowerCase();

interface Tok {
	word: string;
	start: number;
	end: number;
}

function tokens(masked: string): Tok[] {
	return Array.from(masked.matchAll(WORD), (m) => ({ word: key(m[0]), start: m.index, end: m.index + m[0].length }));
}

/** Sentences are cut at . ! ? … followed by a space or a closing quote; abbreviations make this approximate. */
function sentenceLengths(masked: string): number[] {
	const out: number[] = [];
	for (const m of masked.matchAll(/[^.!?…]+(?:[.!?…]+["”’»)]*|$)/g)) {
		const n = (m[0].match(WORD) ?? []).length;
		if (n > 0) out.push(n);
	}
	return out;
}

const paragraphCount = (masked: string): number => masked.split(/\n\s*\n/).filter((p) => p.match(WORD) !== null).length;

export function analyzeBook(chapters: readonly StatsChapterInput[], options: StatsOptions): BookStatistics {
	const stop = stopwordsFor(options.language);
	const top = options.top ?? 30;
	const windowSize = options.clusterWindow ?? 300;
	const clusterMin = options.clusterMin ?? 5;
	const phraseMin = options.phraseMin ?? 3;
	const ignore = new Set([...options.ignore].map(key));
	const counted = (w: string) => w.length > 2 && !/^\d+$/.test(w) && !(stop?.has(w) ?? false) && !ignore.has(w);

	const metrics: ChapterMetrics[] = [];
	const perChapter: Array<{ chapter: StatsChapterInput; toks: Tok[] }> = [];
	const all = new Map<string, { count: number; chapters: Set<string>; occ: Occurrence[] }>();
	const unique = new Set<string>();
	let totalWords = 0;
	for (const chapter of chapters) {
		const masked = maskProse(chapter.text);
		const toks = tokens(masked);
		const lengths = sentenceLengths(masked);
		const words = new Set(toks.map((t) => t.word));
		for (const w of words) unique.add(w);
		totalWords += toks.length;
		metrics.push({ id: chapter.id, designation: chapter.designation, words: toks.length, unique: words.size, sentences: lengths.length, averageSentence: lengths.length === 0 ? 0 : Math.round((10 * lengths.reduce((a, b) => a + b, 0)) / lengths.length) / 10, longestSentence: Math.max(0, ...lengths), paragraphs: paragraphCount(masked) });
		perChapter.push({ chapter, toks });
		for (const t of toks) {
			if (!counted(t.word)) continue;
			const entry = all.get(t.word) ?? { count: 0, chapters: new Set<string>(), occ: [] };
			entry.count++;
			entry.chapters.add(chapter.id);
			if (entry.occ.length < MAX_OCCURRENCES) entry.occ.push({ chapterId: chapter.id, designation: chapter.designation, start: t.start, end: t.end });
			all.set(t.word, entry);
		}
	}
	const row = (word: string, e: { count: number; chapters: Set<string>; occ: Occurrence[] }): WordRow => ({ word, count: e.count, per1000: Math.round((10_000 * e.count) / totalWords) / 10, chapters: e.chapters.size, occurrences: e.occ });
	const byCount = (a: WordRow, b: WordRow) => b.count - a.count || a.word.localeCompare(b.word);
	const frequent = [...all].map(([w, e]) => row(w, e)).sort(byCount).slice(0, top);

	// A cluster: the same word `clusterMin` or more times within `windowSize` consecutive words of one chapter.
	const clusters: Cluster[] = [];
	for (const { chapter, toks } of perChapter) {
		const positions = new Map<string, number[]>();
		toks.forEach((t, i) => {
			if (counted(t.word)) positions.set(t.word, [...(positions.get(t.word) ?? []), i]);
		});
		for (const [word, at] of positions) {
			let i = 0;
			while (i + clusterMin <= at.length) {
				const span = (at[i + clusterMin - 1]) - (at[i]) + 1;
				if (span > windowSize) {
					i++;
					continue;
				}
				let j = i + clusterMin;
				while (j < at.length && (at[j]) - (at[i]) + 1 <= windowSize) j++;
				const group = at.slice(i, j).map((n) => toks[n]);
				const occurrences = group.map((t) => ({ chapterId: chapter.id, designation: chapter.designation, start: t.start, end: t.end }));
				clusters.push({ word, count: group.length, span: (at[j - 1]) - (at[i]) + 1, first: occurrences[0], occurrences });
				i = j;
			}
		}
	}
	clusters.sort((a, b) => b.count - a.count || a.span - b.span || a.word.localeCompare(b.word));

	// Repeated phrases: three words in a row, not made only of function words, seen `phraseMin` or more times.
	const grams = new Map<string, Occurrence[]>();
	for (const { chapter, toks } of perChapter)
		for (let i = 0; i + 3 <= toks.length; i++) {
			const three = toks.slice(i, i + 3);
			if (!three.some((t) => counted(t.word))) continue;
			const phrase = three.map((t) => t.word).join(" ");
			const list = grams.get(phrase) ?? [];
			if (list.length < MAX_OCCURRENCES) list.push({ chapterId: chapter.id, designation: chapter.designation, start: (three[0]).start, end: (three[2]).end });
			grams.set(phrase, list);
		}
	const phrases = [...grams].filter(([, o]) => o.length >= phraseMin).map(([phrase, occurrences]) => ({ phrase, count: occurrences.length, occurrences })).sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase)).slice(0, top);

	const support = adjectiveSupport(options.language);
	const adjectives = support.mode === "unavailable" ? [] : [...all].filter(([w]) => looksLikeAdjective(options.language, w)).map(([w, e]) => row(w, e)).sort(byCount).slice(0, top);
	return { language: options.language, stopwords: stop !== null, totalWords, uniqueWords: unique.size, chapters: metrics, frequent, clusters: clusters.slice(0, top), phrases, adjectives: { support, rows: adjectives } };
}
