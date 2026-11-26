import { describe, expect, it } from "vitest";
import { adjectiveSupport, looksLikeAdjective } from "../core/stats/adjectives";
import { analyzeBook } from "../core/stats/statistics";
import { stopwordsFor } from "../core/stats/stopwords";
import { countWords, maskProse } from "../core/words";

const opts = (language = "en", ignore: string[] = []) => ({ language, ignore: new Set(ignore) });

describe("prose masking", () => {
	it("keeps positions and removes properties, code and comments", () => {
		const text = "---\ntitle: Secret words\n---\nBody ```\ncode here\n``` end %% note %% <!-- c --> done";
		const masked = maskProse(text);
		expect(masked).toHaveLength(text.length);
		expect(masked.indexOf("Body")).toBe(text.indexOf("Body"));
		expect(masked).not.toMatch(/Secret|code|note/);
		expect(countWords(text)).toBe(3);
		expect(maskProse("a\n```\nx\n```\nb")).toContain("\n");
	});
});

describe("statistics", () => {
	const one = { id: "c1", designation: "Chapter 1", text: "---\ntitle: T\n---\nThe lamp burned. The lamp burned low! Nora Voss watched the lamp, and the lamp burned on.\n\nA quiet dark room." };
	const two = { id: "c2", designation: "Chapter 2", text: "Nora said nothing at all. The lighthouse stood, and the lighthouse stood still." };

	it("counts words, unique words, sentences and paragraphs per chapter and for the book", () => {
		const s = analyzeBook([one, two], opts("en", ["nora", "voss"]));
		expect(s.totalWords).toBe(34);
		expect(s.chapters[0]).toMatchObject({ id: "c1", words: 21, sentences: 4, paragraphs: 2, longestSentence: 10 });
		expect(s.chapters[0]?.averageSentence).toBe(5.3);
		expect(s.chapters[1]).toMatchObject({ words: 13, sentences: 2, paragraphs: 1 });
		expect(s.uniqueWords).toBeGreaterThan(10);
		expect(s.stopwords).toBe(true);
	});
	it("lists frequent words without function words and fictional names, with a rate and navigable places", () => {
		const text = one.text;
		const s = analyzeBook([one, two], opts("en", ["Nora", "Voss"]));
		const lamp = s.frequent[0];
		expect(lamp).toMatchObject({ word: "lamp", count: 4, chapters: 1 });
		expect(lamp?.per1000).toBeCloseTo((4 / 34) * 1000, 0);
		for (const o of lamp?.occurrences ?? []) expect(text.slice(o.start, o.end).toLowerCase()).toBe("lamp");
		expect(s.frequent.map((r) => r.word)).not.toContain("the");
		expect(s.frequent.map((r) => r.word)).not.toContain("nora");
		expect(s.frequent.find((r) => r.word === "lighthouse")?.chapters).toBe(1);
	});
	it("without a stopword list function words are shown and that is stated", () => {
		const s = analyzeBook([{ id: "c", designation: "C", text: "alpha beta alpha beta alpha" }], opts("xx"));
		expect(s.stopwords).toBe(false);
		expect(s.frequent[0]?.word).toBe("alpha");
		expect(stopwordsFor("xx")).toBeNull();
		expect(stopwordsFor("de")).toBe(stopwordsFor("de"));
	});
	it("finds a word used often in a short stretch, but not the same count spread thin", () => {
		const burst = "storm ".repeat(5) + "filler ".repeat(40);
		const spread = ("storm " + "other words here ".repeat(60)).repeat(5);
		const s = analyzeBook([{ id: "a", designation: "A", text: burst }, { id: "b", designation: "B", text: spread }], opts("en", ["filler", "other", "words", "here"]));
		expect(s.clusters).toHaveLength(1);
		expect(s.clusters[0]).toMatchObject({ word: "storm", count: 5 });
		expect(s.clusters[0]?.first.chapterId).toBe("a");
		const long = analyzeBook([{ id: "a", designation: "A", text: `${"storm ".repeat(3)}${"x ".repeat(400)}${"storm ".repeat(7)}` }], opts("en"));
		expect(long.clusters.map((c) => c.count)).toEqual([7]);
	});
	it("reports repeated three-word phrases and ignores phrases of only function words", () => {
		const text = "she turned the key. she turned the key again. then she turned the key. one of the cats. one of the dogs. one of the men.";
		const s = analyzeBook([{ id: "a", designation: "A", text }], opts("en"));
		const phrases = s.phrases.map((p) => p.phrase);
		expect(phrases).toContain("turned the key");
		expect(phrases).not.toContain("one of the");
		expect(s.phrases.find((p) => p.phrase === "turned the key")?.count).toBe(3);
	});
	it("guesses adjectives only where it can, and labels the guess", () => {
		const en = analyzeBook([{ id: "a", designation: "A", text: "A dark and dangerous night. A famous, careful, pale man was beautiful and lonely. Family only early." }], opts("en"));
		expect(en.adjectives.support.mode).toBe("heuristic");
		expect(en.adjectives.rows.map((r) => r.word).sort()).toEqual(["beautiful", "careful", "dangerous", "dark", "famous", "pale"]);
		const de = analyzeBook([{ id: "a", designation: "A", text: "Der alte, gefährliche Mann sah die kleinen Hunde. Ein wunderbarer Tag, ein König." }], opts("de"));
		expect(de.adjectives.rows.map((r) => r.word).sort()).toEqual(["alte", "gefährliche", "kleinen", "wunderbarer"]);
		for (const lang of ["cs", "sk", "fr"]) {
			const s = analyzeBook([{ id: "a", designation: "A", text: "Velký starý dům." }], opts(lang));
			expect(s.adjectives.support.mode).toBe("unavailable");
			expect(s.adjectives.rows).toEqual([]);
		}
		expect(adjectiveSupport("cs").note).toContain("Nothing is guessed");
		expect(adjectiveSupport("fr").note).toContain("No adjective analysis");
		expect(looksLikeAdjective("fr", "grand")).toBe(false);
		expect(looksLikeAdjective("en", "bad")).toBe(false); // too short to judge
	});
	it("breaks ties between clusters by span and then alphabetically, and ignores stretches with no words", () => {
		const s = analyzeBook([{ id: "a", designation: "A", text: "Wait... !!! alpha beta alpha beta alpha beta alpha beta alpha beta" }], opts("en"));
		expect(s.clusters.map((c) => c.word)).toEqual(["alpha", "beta"]);
		const tight = analyzeBook([{ id: "a", designation: "A", text: "alpha alpha alpha alpha alpha beta x beta x beta x beta x beta" }], opts("en"));
		expect(tight.clusters.map((c) => c.word)).toEqual(["alpha", "beta"]);
	});
	it("handles an empty book", () => {
		const s = analyzeBook([], opts());
		expect(s).toMatchObject({ totalWords: 0, uniqueWords: 0, chapters: [], frequent: [], clusters: [], phrases: [] });
		const blank = analyzeBook([{ id: "a", designation: "A", text: "" }], opts());
		expect(blank.chapters[0]).toMatchObject({ words: 0, sentences: 0, averageSentence: 0, longestSentence: 0, paragraphs: 0 });
		expect(blank.frequent).toEqual([]);
	});
});
