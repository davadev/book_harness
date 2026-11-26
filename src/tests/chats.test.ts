import { describe, expect, it } from "vitest";
import type { AskResult } from "../core/agent/ask";
import { loadAnswers, retireAnswer, saveAnswer } from "../core/agent/chats";
import { registerBook } from "../core/books";
import { GuardedVault } from "../core/guarded-vault";
import { FakeVault, counterRandom } from "./__mocks__/fakeVault";

const result = (question: string): AskResult => ({ question, answer: `Answer to ${question}`, status: "answered", citations: [{ label: "P1", quote: "a quote", chapter: "Chapter 1", result: { ref: { bookId: "b", chapterId: "c", passageId: "p", sourceRevision: "r", start: 0, end: 5 }, chapter: "Chapter 1", notePath: "Book/one.md", snippet: "s", score: 1, entities: [], provenance: "manuscript", channels: { keyword: 1, meaning: null } } }], dropped: 0, issues: [], excerpts: 1, chapters: ["Chapter 1"], usedChronology: false });

async function setup() {
	const raw = new FakeVault({});
	const vault = new GuardedVault(raw);
	const rnd = counterRandom();
	const book = await registerBook(vault, "Book", "Book", "en", rnd);
	return { raw, vault, book, rnd };
}

describe("saved answers", () => {
	it("are kept as readable notes, newest first, and can be removed without deleting the note", async () => {
		const { raw, vault, book, rnd } = await setup();
		const a = await saveAnswer(vault, book, result("First?"), "2026-11-26T10:00:00Z", rnd);
		const b = await saveAnswer(vault, book, result("Second?"), "2026-11-26T11:00:00Z", rnd);
		expect(raw.files.get(a.path)).toContain("# First?\n\nAnswer to First?");
		expect(raw.files.get(a.path)).toContain("- Chapter 1: “a quote”");
		const { answers, problems } = await loadAnswers(vault, book);
		expect(problems).toEqual([]);
		expect(answers.map((x) => x.result.question)).toEqual(["Second?", "First?"]);
		expect((await loadAnswers(vault, book, 1)).answers).toHaveLength(1);
		await retireAnswer(vault, book, b);
		expect((await loadAnswers(vault, book)).answers.map((x) => x.result.question)).toEqual(["First?"]);
		expect(raw.files.get(b.path)).toContain("retired: true");
		raw.replaceIfUnchanged = () => Promise.resolve(false);
		await expect(retireAnswer(vault, book, a)).rejects.toThrow(/changed on another device/);
	});
	it("order answers asked at the same moment in a stable way", async () => {
		const { vault, book, rnd } = await setup();
		await saveAnswer(vault, book, result("One?"), "2026-11-26T10:00:00Z", rnd);
		await saveAnswer(vault, book, result("Two?"), "2026-11-26T10:00:00Z", rnd);
		const first = (await loadAnswers(vault, book)).answers.map((x) => x.id);
		expect((await loadAnswers(vault, book)).answers.map((x) => x.id)).toEqual(first);
		expect(first).toEqual([...first].sort().reverse());
	});
	it("report notes that cannot be read instead of hiding them", async () => {
		const { raw, vault, book, rnd } = await setup();
		const a = await saveAnswer(vault, book, result("Q?"), "2026-11-26T10:00:00Z", rnd);
		const good = raw.files.get(a.path)!;
		const bad = async (text: string, why: RegExp) => {
			raw.files.set(`${a.path.replace(a.id, "cv_zzzzzzzzzzzzzzzz")}`, text);
			const r = await loadAnswers(vault, book);
			expect(r.problems.join()).toMatch(why);
			expect(r.answers).toHaveLength(1);
		};
		await bad(good.replace("bh_type: chat", "bh_type: other").replace(a.id, "cv_zzzzzzzzzzzzzzzz"), /not a saved answer/);
		await bad(good.replace("bh_schema: 1", "bh_schema: 9").replace(a.id, "cv_zzzzzzzzzzzzzzzz"), /newer Book Harness/);
		await bad(good.replace("```bh-records", "```x").replace(a.id, "cv_zzzzzzzzzzzzzzzz"), /no records block/);
		await bad(good.replace(/```bh-records\n[\s\S]*\n```/, "```bh-records\nnull\n```").replace(a.id, "cv_zzzzzzzzzzzzzzzz"), /malformed/);
		await bad(good.replace(/```bh-records\n[\s\S]*\n```/, "```bh-records\n{oops\n```").replace(a.id, "cv_zzzzzzzzzzzzzzzz"), /JSON|Unexpected|position/i);
		raw.files.set(a.path.replace(a.id, "cv_zzzzzzzzzzzzzzzz"), "not a note");
		expect((await loadAnswers(vault, book)).problems.join()).toMatch(/frontmatter/i);
	});
});
