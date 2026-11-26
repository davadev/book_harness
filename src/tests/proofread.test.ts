import { describe, expect, it } from "vitest";
import { registerBook } from "../core/books";
import { addChapter } from "../core/chapters";
import { GuardedVault } from "../core/guarded-vault";
import { ModelError } from "../core/ai/errors";
import type { NetRequest, NetworkPort } from "../core/ai/network";
import { OllamaClient } from "../core/ai/ollama";
import { PROOFREAD_PROMPT, applyFixes, checkCorrection, coveragePath, coverageView, defaultProofreadPrompt, loadCoverage, proofreadChapter, settleCoverage } from "../core/proofread";
import { applyAccepted, decide, listProposals } from "../core/proposals";
import { hashText, proseSegments } from "../core/segmentation";
import { FakeVault, counterRandom } from "./__mocks__/fakeVault";

const NOTE = `---
title: One
---
# Chapter heading

The captian walked to the [[Harbour]] at dawn.

> A quoted line, not touched.

- a list item, also not touched

\`\`\`
code with a typpo

and a blank line
\`\`\`

She did'nt answer. The tide came in.
Second line of the same paragraph.

![[map.png]]
`;

/** Scripted model: replies by paragraph text; mocked, says nothing about real quality. */
function modelFor(fixes: Record<string, string | Error>, calls: string[] = []): NetworkPort & { calls: string[] } {
	return {
		calls,
		request: (req: NetRequest) => {
			const user = (JSON.parse(req.body!).messages as Array<{ content: string }>).at(-1)!.content;
			const paragraph = /<paragraph>\n([\s\S]*?)\n<\/paragraph>/.exec(user)![1]!;
			calls.push(paragraph);
			const fix = fixes[paragraph];
			if (fix instanceof Error) return Promise.reject(fix);
			return Promise.resolve({ status: 200, text: JSON.stringify({ message: { content: JSON.stringify({ corrected: fix ?? paragraph }) } }) });
		},
	};
}

async function setup(text = NOTE) {
	const raw = new FakeVault({ "Book/one.md": text });
	const vault = new GuardedVault(raw);
	const rnd = counterRandom();
	const book = await registerBook(vault, "Book", "Book", "en", rnd);
	const chapter = await addChapter(vault, book, [], { designation: "Chapter 1", notePath: "Book/one.md" }, rnd);
	const deps = (net: NetworkPort, extra = {}) => ({ client: new OllamaClient(net, "http://h:1"), model: "m", prompt: defaultProofreadPrompt(), now: () => "t", sleep: () => Promise.resolve(), random: rnd, ...extra });
	return { raw, vault, book, chapter, deps };
}

const P1 = "The captian walked to the [[Harbour]] at dawn.";
const P2 = "She did'nt answer. The tide came in.\nSecond line of the same paragraph.";

describe("segmentation", () => {
	it("finds only plain prose paragraphs, with exact offsets", () => {
		const segs = proseSegments(NOTE);
		expect(segs.map((s) => s.text)).toEqual([P1, P2]);
		for (const s of segs) expect(NOTE.slice(s.start, s.end)).toBe(s.text);
		expect(segs[0]?.hash).toBe(hashText(P1));
	});

	it("handles CRLF, indentation, unclosed fences and a body without properties", () => {
		expect(proseSegments("  Indented line.\r\n\r\nNext one.\r\n").map((s) => s.text)).toEqual(["Indented line.", "Next one."]);
		expect(proseSegments("Before.\n\n~~~\nfence\n~~~\n\nAfter.").map((s) => s.text)).toEqual(["Before.", "After."]);
		expect(proseSegments("Text.\n\n```\nnever closed\n\nstill code").map((s) => s.text)).toEqual(["Text."]);
		expect(proseSegments("```\nx\n```y\n\nProse after.").map((s) => s.text)).toEqual(["Prose after."]);
		expect(proseSegments("")).toEqual([]);
	});
});

describe("correction checks", () => {
	it("accepts a small, safe fix", () => {
		expect(checkCorrection(P1, P1.replace("captian", "captain"))).toEqual([]);
	});

	it("rejects empty text, changed line breaks, changed links and rewrites", () => {
		expect(checkCorrection(P1, "  ")).toEqual(["The corrected paragraph is empty."]);
		expect(checkCorrection(P2, P2.replace("\n", " "))).toContain("The number of line breaks changed; keep them exactly.");
		expect(checkCorrection(P1, P1.replace("[[Harbour]]", "Harbour"))).toContain("Links, URLs or inline code changed; keep them exactly.");
		expect(checkCorrection("See https://a.example/x and `code`.", "See https://a.example/y and `code`.")).toContain("Links, URLs or inline code changed; keep them exactly.");
		expect(checkCorrection(P1, "Short.")).toContain("The paragraph's length changed too much; correct it, do not rewrite it.");
		expect(checkCorrection("one two three four five six seven eight nine ten", "one two three four five six seven eight nine tennnn")).toEqual([]);
		expect(checkCorrection("The old captain slept soundly through the long storm.", "A tired sailor dozed deeply during that whole gale.")).toContain("Too many words changed; correct only clear mistakes.");
	});
});

describe("proofreading a chapter (AC-P-1)", () => {
	it("sends only prose paragraphs, one per call, and turns fixes into a proposal without touching the chapter", async () => {
		const { raw, vault, book, chapter, deps } = await setup();
		const net = modelFor({ [P1]: P1.replace("captian", "captain"), [P2]: P2.replace("did'nt", "didn't") });
		const report = await proofreadChapter(vault, book, chapter, deps(net));
		expect(net.calls).toEqual([P1, P2]);
		expect(report).toMatchObject({ checked: 2, proposed: 2, unchanged: 0, failed: [], skippedReviewed: 0, stale: false });
		expect(raw.files.get("Book/one.md")).toBe(NOTE);
		expect(report.proposal?.edits.map((e) => [e.original, e.replacement])).toEqual([["captian", "captain"], ["did'nt", "didn't"]]);
		expect(coverageView(NOTE, await loadCoverage(vault, book, chapter.id))).toEqual({ total: 2, reviewed: 0, waiting: 2, pending: 0 });
	});

	it("keeps the original and reports a paragraph whose answer breaks the rules or whose call fails", async () => {
		const { raw, vault, book, chapter, deps } = await setup();
		const net = modelFor({ [P1]: P1.replace("[[Harbour]]", "harbour"), [P2]: new ModelError("timeout", "slow") });
		const report = await proofreadChapter(vault, book, chapter, deps(net, { sleep: () => Promise.resolve() }));
		expect(report.proposal).toBeNull();
		expect(report.failed).toHaveLength(2);
		expect(report.failed[0]).toMatch(/^Paragraph 1: Links, URLs or inline code changed/);
		expect(report.failed[1]).toBe("Paragraph 2: slow");
		expect(raw.files.get("Book/one.md")).toBe(NOTE);
		expect(coverageView(NOTE, await loadCoverage(vault, book, chapter.id))).toEqual({ total: 2, reviewed: 0, waiting: 0, pending: 2 });
	});

	it("reports an empty answer and passes cancellation through", async () => {
		const { vault, book, chapter, deps } = await setup();
		expect((await proofreadChapter(vault, book, chapter, deps(modelFor({ [P1]: "", [P2]: P2 })))).failed[0]).toMatch(/^Paragraph 1: The corrected paragraph is empty\.$/);
		await expect(proofreadChapter(vault, book, chapter, deps(modelFor({ [P1]: new ModelError("canceled", "Canceled."), [P2]: P2 })))).rejects.toMatchObject({ kind: "canceled" });
	});

	it("skips paragraphs that are waiting for a decision, and a deliberate full rerun replaces their suggestions", async () => {
		const { vault, book, chapter, deps } = await setup();
		const fixes = { [P1]: P1.replace("captian", "captain"), [P2]: P2.replace("did'nt", "didn't") };
		const first = await proofreadChapter(vault, book, chapter, deps(modelFor(fixes)));
		const idle = modelFor(fixes);
		const second = await proofreadChapter(vault, book, chapter, deps(idle));
		expect(idle.calls).toEqual([]);
		expect(second).toMatchObject({ checked: 0, skippedReviewed: 2, proposal: null });
		const rerun = await proofreadChapter(vault, book, chapter, deps(modelFor(fixes), { all: true }));
		expect(rerun.proposal?.id).not.toBe(first.proposal?.id);
		expect((await loadCoverage(vault, book, chapter.id)).proposed.map((p) => p.proposalId)).toEqual([rerun.proposal!.id, rerun.proposal!.id]);
	});

	it("treats an answer without the expected field as a failed paragraph, not as a correction", async () => {
		const { vault, book, chapter, deps } = await setup();
		const odd: NetworkPort = { request: () => Promise.resolve({ status: 200, text: JSON.stringify({ message: { content: JSON.stringify({ other: 1 }) } }) }) };
		const report = await proofreadChapter(vault, book, chapter, deps(odd));
		expect(report.failed).toHaveLength(2);
		expect(report.failed[0]).toMatch(/The corrected paragraph is empty/);
	});

	it("marks paragraphs with nothing to fix as reviewed, and skips them next time (AC-P-3)", async () => {
		const { vault, book, chapter, deps } = await setup();
		const first = modelFor({});
		const r1 = await proofreadChapter(vault, book, chapter, deps(first));
		expect(r1).toMatchObject({ unchanged: 2, proposed: 0, proposal: null });
		expect(coverageView(NOTE, await loadCoverage(vault, book, chapter.id))).toEqual({ total: 2, reviewed: 2, waiting: 0, pending: 0 });
		const second = modelFor({});
		const r2 = await proofreadChapter(vault, book, chapter, deps(second));
		expect(second.calls).toEqual([]);
		expect(r2).toMatchObject({ checked: 0, skippedReviewed: 2 });
		const third = modelFor({});
		await proofreadChapter(vault, book, chapter, deps(third, { all: true }));
		expect(third.calls).toEqual([P1, P2]);
	});

	it("after a manual edit only the edited paragraph is pending again", async () => {
		const { raw, vault, book, chapter, deps } = await setup();
		await proofreadChapter(vault, book, chapter, deps(modelFor({})));
		raw.files.set("Book/one.md", NOTE.replace("at dawn", "at dusk"));
		const net = modelFor({});
		await proofreadChapter(vault, book, chapter, deps(net));
		expect(net.calls).toEqual([P1.replace("dawn", "dusk")]);
	});

	it("records nothing if the chapter changed while the model was working", async () => {
		const { raw, vault, book, chapter, deps } = await setup();
		const net = modelFor({ [P1]: P1.replace("captian", "captain") });
		const wrapped: NetworkPort = { request: (r) => { raw.files.set("Book/one.md", NOTE + "\nExtra.\n"); return net.request(r); } };
		const report = await proofreadChapter(vault, book, chapter, deps(wrapped));
		expect(report).toMatchObject({ stale: true, proposal: null });
		expect((await listProposals(vault, book)).proposals).toEqual([]);
		expect(raw.files.has(coveragePath(book, chapter.id))).toBe(false);
	});

	it("refuses a planned chapter", async () => {
		const { vault, book, chapter, deps } = await setup();
		await expect(proofreadChapter(vault, book, { ...chapter, notePath: null }, deps(modelFor({})))).rejects.toThrow(/no manuscript note/);
		expect(PROOFREAD_PROMPT.version).toBe(2);
	});
});

describe("fixes instead of rewriting", () => {
	/** Scripted model that answers with a list of fixes, in the order the calls come. */
	const fixing = (answers: unknown[], seen: string[] = []): NetworkPort & { seen: string[] } => {
		let i = 0;
		return { seen, request: (req: NetRequest) => {
			seen.push((JSON.parse(req.body!).messages as Array<{ content: string }>).map((m) => m.content).join("\n---\n"));
			const a = answers[Math.min(i++, answers.length - 1)];
			return Promise.resolve({ status: 200, text: JSON.stringify({ message: { content: typeof a === "string" ? a : JSON.stringify(a) } }) });
		} };
	};

	it("applies each fix once, at a whole word, and lists what could not be applied", () => {
		expect(applyFixes("The captian saw a captian.", [{ wrong: "captian", right: "captain" }])).toEqual({ corrected: "The captain saw a captian.", missing: [] });
		expect(applyFixes("Two stairs and a stair.", [{ wrong: "stair", right: "step" }])).toEqual({ corrected: "Two stairs and a step.", missing: [] });
		expect(applyFixes("Pre-stair work.", [{ wrong: "stair", right: "step" }]).corrected).toBe("Pre-step work.");
		expect(applyFixes("The tide.", [{ wrong: "tyde", right: "tide" }, { wrong: "The", right: "A" }])).toEqual({ corrected: "A tide.", missing: ["tyde"] });
		expect(applyFixes("Wait... what?", [{ wrong: "...", right: "…" }]).corrected).toBe("Wait… what?");
		expect(applyFixes("unstairs", [{ wrong: "stairs", right: "x" }])).toEqual({ corrected: "unstairs", missing: ["stairs"] });
		expect(applyFixes("stairsx and stairs", [{ wrong: "stairs", right: "steps" }]).corrected).toBe("stairsx and steps");
	});

	it("turns a list of fixes into one proposal, sends only the paragraph, and leaves a paragraph with no fixes alone", async () => {
		const { vault, book, chapter, deps } = await setup();
		const net = fixing([{ fixes: [{ wrong: "captian", right: "captain" }] }, { fixes: [] }]);
		const report = await proofreadChapter(vault, book, chapter, deps(net));
		expect(report).toMatchObject({ checked: 2, proposed: 1, unchanged: 1, failed: [] });
		expect(report.proposal?.edits).toHaveLength(1);
		expect(report.proposal?.edits[0]).toMatchObject({ original: "captian", replacement: "captain" });
		expect(net.seen[0]).toContain("<paragraph>\nThe captian walked");
		expect(net.seen[0]).not.toContain("Second line of the same paragraph");
	});

	it("asks again when a fix names a word that is not in the paragraph, and reports it when it stays wrong", async () => {
		const { vault, book, chapter, deps } = await setup();
		const net = fixing([{ fixes: [{ wrong: "captin", right: "captain" }] }, { fixes: [{ wrong: "captian", right: "captain" }] }, { fixes: [] }]);
		const report = await proofreadChapter(vault, book, chapter, deps(net));
		expect(net.seen[1]).toContain("is not in the paragraph as a whole word");
		expect(report.proposed).toBe(1);
		const stubborn = await proofreadChapter(vault, book, chapter, deps(fixing([{ fixes: [{ wrong: "captin", right: "captain" }] }]), { all: true }));
		expect(stubborn.failed[0]).toMatch(/Paragraph 1: .*not in the paragraph/);
	});

	it("ignores empty or unchanged fixes and malformed entries, and still understands a whole corrected paragraph", async () => {
		const { vault, book, chapter, deps } = await setup();
		const junk = { fixes: [null, 5, { wrong: "", right: "x" }, { wrong: "tide", right: "tide" }, { wrong: 3, right: 4 }] };
		const r = await proofreadChapter(vault, book, chapter, deps(fixing([junk, '{"corrected": "She didn\'t answer. The tide came in.\\nSecond line of the same paragraph."}', "[1]"])));
		expect(r.unchanged).toBe(1);
		expect(r.proposed).toBe(1);
		const nothing = await proofreadChapter(vault, book, chapter, deps(fixing(["null", "5"]), { all: true }));
		expect(nothing.checked + nothing.failed.length).toBe(2);
	});
});

describe("review and settling coverage (AC-P-3)", () => {
	async function proposed() {
		const s = await setup();
		const net = modelFor({ [P1]: P1.replace("captian", "captain"), [P2]: P2.replace("did'nt", "didn't") });
		const report = await proofreadChapter(s.vault, s.book, s.chapter, s.deps(net));
		return { ...s, proposal: report.proposal! };
	}

	it("rejecting counts as reviewed; accepting and applying does not queue the paragraph for proofreading again", async () => {
		const { raw, vault, book, chapter, proposal, deps } = await proposed();
		const rejected = await decide(vault, book, proposal, ["e2"], "rejected");
		const accepted = await decide(vault, book, rejected, ["e1"], "accepted");
		let c = await settleCoverage(vault, book, chapter, [accepted]);
		expect(coverageView(raw.files.get("Book/one.md")!, c)).toMatchObject({ reviewed: 1, waiting: 1, pending: 0 });
		const result = await applyAccepted(vault, book, chapter, accepted);
		c = await settleCoverage(vault, book, chapter, [result.proposal]);
		const now = raw.files.get("Book/one.md")!;
		expect(now).toContain("The captain walked");
		expect(coverageView(now, c)).toEqual({ total: 2, reviewed: 2, waiting: 0, pending: 0 });
		const net = modelFor({});
		await proofreadChapter(vault, book, chapter, deps(net));
		expect(net.calls).toEqual([]);
	});

	it("keeps undecided and unplaceable paragraphs waiting, and ignores proposals it has not been given", async () => {
		const { raw, vault, book, chapter, proposal } = await proposed();
		expect(coverageView(raw.files.get("Book/one.md")!, await settleCoverage(vault, book, chapter, [proposal]))).toMatchObject({ waiting: 2 });
		expect(coverageView(raw.files.get("Book/one.md")!, await settleCoverage(vault, book, chapter, []))).toMatchObject({ waiting: 2 });
		const conflicted = { ...proposal, edits: proposal.edits.map((e) => ({ ...e, decision: "conflict" as const })) };
		expect(coverageView(raw.files.get("Book/one.md")!, await settleCoverage(vault, book, chapter, [conflicted]))).toMatchObject({ waiting: 2 });
	});

	it("does not rewrite the coverage note when nothing changed", async () => {
		const { raw, vault, book, chapter, proposal } = await proposed();
		const before = raw.writes.length;
		await settleCoverage(vault, book, chapter, [proposal]);
		expect(raw.writes.length).toBe(before);
	});
});

describe("stored coverage", () => {
	it.each([
		["a different note type", "bh_schema: 1\nbh_type: book\nbh_id: x", "", /not proofreading coverage/],
		["a newer schema", "bh_schema: 9\nbh_type: proofread\nbh_id: x", "", /newer Book Harness/],
		["no records", "bh_schema: 1\nbh_type: proofread\nbh_id: x", "text", /no records block/],
		["broken JSON", "bh_schema: 1\nbh_type: proofread\nbh_id: x", "```bh-records\n{oops\n```", /not valid JSON/],
	])("reports %s", async (_n, fm, body, reason) => {
		const { raw, vault, book, chapter } = await setup();
		raw.files.set(coveragePath(book, chapter.id), `---\n${fm}\n---\n${body}`);
		await expect(loadCoverage(vault, book, chapter.id)).rejects.toThrow(reason);
	});

	it("tolerates unusable fields and refuses to overwrite a changed note", async () => {
		const { raw, vault, book, chapter } = await setup();
		raw.files.set(coveragePath(book, chapter.id), `---\nbh_schema: 1\nbh_type: proofread\nbh_id: x\n---\n\`\`\`bh-records\n{"reviewed": [1, "a"], "proposed": [null, {"hash": 5}, {"hash":"h","text":"t","start":0,"proposalId":"p"}]}\n\`\`\``);
		expect(await loadCoverage(vault, book, chapter.id)).toEqual({ reviewed: ["a"], proposed: [{ hash: "h", text: "t", start: 0, proposalId: "p" }] });
		raw.files.set(coveragePath(book, chapter.id), `---\nbh_schema: 1\nbh_type: proofread\nbh_id: x\n---\n\`\`\`bh-records\nnull\n\`\`\``);
		expect(await loadCoverage(vault, book, chapter.id)).toEqual({ reviewed: [], proposed: [] });
		raw.files.set(coveragePath(book, chapter.id), `---\nbh_schema: 1\nbh_type: proofread\nbh_id: x\n---\n\`\`\`bh-records\n{"reviewed": "x"}\n\`\`\``);
		expect(await loadCoverage(vault, book, chapter.id)).toEqual({ reviewed: [], proposed: [] });
		const deps = { client: new OllamaClient(modelFor({}), "http://h:1"), model: "m", prompt: defaultProofreadPrompt(), now: () => "t", sleep: () => Promise.resolve(), random: counterRandom() };
		raw.replaceIfUnchanged = () => Promise.resolve(false);
		await expect(proofreadChapter(vault, book, chapter, deps)).rejects.toThrow(/another device/);
	});
});
