import { describe, expect, it } from "vitest";
import { registerBook } from "../core/books";
import { addChapter } from "../core/chapters";
import { diffText } from "../core/diff";
import { GuardedVault } from "../core/guarded-vault";
import { createProposal, listProposals } from "../core/proposals";
import { applyProposalById, decideEdits, inlineEditsFor } from "../core/review";
import { FakeVault, counterRandom } from "./__mocks__/fakeVault";

const TEXT = "The captian walked home. Teh end.";
const FIXED = "The captain walked home. The end.";

async function setup() {
	const raw = new FakeVault({ "Book/one.md": TEXT });
	const vault = new GuardedVault(raw);
	const rnd = counterRandom();
	const book = await registerBook(vault, "Book", "Book", "en", rnd);
	const chapter = await addChapter(vault, book, [], { designation: "Chapter 1", notePath: "Book/one.md" }, rnd);
	const proposal = await createProposal(vault, book, chapter, TEXT, { action: "proofread" }, diffText(TEXT, FIXED).map((h) => ({ from: h.from, to: h.to, replacement: h.replacement })), rnd, "t");
	return { raw, vault, book, chapter, proposal };
}

describe("inlineEditsFor", () => {
	it("places open changes in the current text, sorted, and skips decided ones and other chapters", async () => {
		const { proposal, chapter } = await setup();
		const edits = inlineEditsFor([proposal], chapter.id, TEXT);
		expect(edits.map((e) => [e.editId, e.from, e.to, e.original, e.replacement, e.decision])).toEqual([["e1", 4, 11, "captian", "captain", "pending"], ["e2", 25, 28, "Teh", "The", "pending"]]);
		expect(inlineEditsFor([proposal], "ch_other", TEXT)).toEqual([]);
		const decided = { ...proposal, edits: proposal.edits.map((e, i) => ({ ...e, decision: i === 0 ? ("rejected" as const) : ("accepted" as const) })) };
		expect(inlineEditsFor([decided], chapter.id, TEXT).map((e) => [e.editId, e.decision])).toEqual([["e2", "accepted"]]);
		expect(inlineEditsFor([{ ...proposal, edits: proposal.edits.map((e) => ({ ...e, decision: "applied" as const })) }], chapter.id, TEXT)).toEqual([]);
	});

	it("re-finds a change after unrelated edits and hides one that can no longer be placed with certainty", async () => {
		const { proposal, chapter } = await setup();
		const moved = "New opening. " + TEXT;
		expect(inlineEditsFor([proposal], chapter.id, moved).map((e) => e.from)).toEqual([17, 38]);
		expect(inlineEditsFor([proposal], chapter.id, "Rewritten entirely.")).toEqual([]);
		expect(inlineEditsFor([proposal], chapter.id, TEXT + " " + TEXT)).toEqual([]);
	});
});

describe("deciding and applying", () => {
	it("records a decision and settles coverage; accepting then applying changes only that change", async () => {
		const { raw, vault, book, chapter } = await setup();
		const [p] = (await listProposals(vault, book)).proposals;
		await decideEdits(vault, book, [chapter], p!.id, ["e1"], "accepted");
		const result = await applyProposalById(vault, book, [chapter], p!.id);
		expect(result).toMatchObject({ applied: 1, conflicts: [] });
		expect(raw.files.get("Book/one.md")).toBe("The captain walked home. Teh end.");
	});

	it("reports a proposal or chapter that no longer exists", async () => {
		const { vault, book, chapter } = await setup();
		const [p] = (await listProposals(vault, book)).proposals;
		await expect(decideEdits(vault, book, [chapter], "pr_missing", ["e1"], "accepted")).rejects.toThrow(/no longer exists/);
		await expect(applyProposalById(vault, book, [chapter], "pr_missing")).rejects.toThrow(/no longer exists/);
		await expect(decideEdits(vault, book, [], p!.id, ["e1"], "accepted")).rejects.toThrow(/chapter this proposal belongs to no longer exists/);
	});
});
