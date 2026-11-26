import type { Book } from "./books";
import type { Chapter } from "./chapters";
import type { GuardedVault } from "./guarded-vault";
import { settleCoverage } from "./proofread";
import { applyAccepted, decide, listProposals, locate, type ApplyResult, type Proposal } from "./proposals";
import { revisionOf } from "./revision";

/** A suggested change placed in the text the author has open right now. */
export interface InlineEdit {
	proposalId: string;
	editId: string;
	from: number;
	to: number;
	original: string;
	replacement: string;
	decision: "pending" | "accepted";
}

/**
 * Where each still-open change of a chapter's proposals belongs in `text` (the current note). A change is shown only when
 * it can be placed with certainty: the same words at the same offsets, or the same words with the same surroundings found
 * exactly once. Others stay visible in the panel as "could not be placed".
 */
export function inlineEditsFor(proposals: readonly Proposal[], chapterId: string, text: string): InlineEdit[] {
	const revision = revisionOf(text);
	const out: InlineEdit[] = [];
	for (const p of proposals.filter((x) => x.chapterId === chapterId)) {
		for (const e of p.edits) {
			if (e.decision !== "pending" && e.decision !== "accepted") continue;
			const at = locate(text, e, revision === p.baseRevision);
			if (at !== null) out.push({ proposalId: p.id, editId: e.id, from: at, to: at + e.original.length, original: e.original, replacement: e.replacement, decision: e.decision });
		}
	}
	return out.sort((a, b) => a.from - b.from);
}

/** Record a decision and move paragraphs whose changes are now all decided into "reviewed". */
export async function decideEdits(vault: GuardedVault, book: Book, chapters: readonly Chapter[], proposalId: string, editIds: readonly string[], decision: "accepted" | "rejected"): Promise<void> {
	const proposal = (await listProposals(vault, book)).proposals.find((p) => p.id === proposalId);
	if (!proposal) throw new Error("That proposal no longer exists.");
	const updated = await decide(vault, book, proposal, editIds, decision);
	await settleCoverage(vault, book, chapterOf(chapters, updated), [updated]);
}

/** Apply the accepted changes of one proposal (the manuscript gate) and update proofreading coverage. */
export async function applyProposalById(vault: GuardedVault, book: Book, chapters: readonly Chapter[], proposalId: string): Promise<ApplyResult> {
	const proposal = (await listProposals(vault, book)).proposals.find((p) => p.id === proposalId);
	if (!proposal) throw new Error("That proposal no longer exists.");
	const chapter = chapterOf(chapters, proposal);
	const result = await applyAccepted(vault, book, chapter, proposal);
	await settleCoverage(vault, book, chapter, [result.proposal]);
	return result;
}

function chapterOf(chapters: readonly Chapter[], p: Proposal): Chapter {
	const chapter = chapters.find((c) => c.id === p.chapterId);
	if (!chapter) throw new Error("The chapter this proposal belongs to no longer exists.");
	return chapter;
}
