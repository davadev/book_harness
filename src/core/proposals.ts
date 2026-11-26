import { MANAGED_FOLDER, type Book } from "./books";
import type { Chapter } from "./chapters";
import { GuardedVault, mintWriteCapability } from "./guarded-vault";
import { isId, newId, type RandomPort } from "./ids";
import { ManagedNoteError, parseManagedNote, serializeManagedNote } from "./managed-note";
import type { VaultPort } from "./ports";
import { revisionOf } from "./revision";

const PROPOSAL_SCHEMA = 1;
const FENCE = /```bh-records\n([\s\S]*?)\n```/;
const ANCHOR = 40;

export type EditDecision = "pending" | "accepted" | "rejected" | "applied" | "conflict";
const DECISIONS: readonly EditDecision[] = ["pending", "accepted", "rejected", "applied", "conflict"];

/** One change to the manuscript, expressed against the exact text the proposal was made from. */
export interface ProposedEdit {
	id: string;
	/** Offsets in the full note text at `Proposal.baseRevision`. Never used on text that has changed (see `applyAccepted`). */
	from: number;
	to: number;
	original: string;
	replacement: string;
	/** Text just before and after, used to find the same place again if the note was edited elsewhere. */
	before: string;
	after: string;
	rationale?: string;
	decision: EditDecision;
}

export interface Proposal {
	id: string;
	bookId: string;
	chapterId: string;
	origin: { action: string; model?: string; promptId?: string };
	baseRevision: string;
	createdAt: string;
	edits: ProposedEdit[];
}

export const proposalPath = (book: Book, id: string): string => `${book.folder}/${MANAGED_FOLDER}/proposals/${id}.md`;

function serialize(p: Proposal): string {
	const open = p.edits.filter((e) => e.decision === "pending" || e.decision === "accepted").length;
	return serializeManagedNote({
		frontmatter: { bh_schema: PROPOSAL_SCHEMA, bh_type: "proposal", bh_id: p.id, bh_book: p.bookId, chapter: p.chapterId, action: p.origin.action, base_revision: p.baseRevision },
		body: `# Proposed changes\n\n${p.edits.length} change${p.edits.length === 1 ? "" : "s"}, ${open} still open. These are suggestions: the chapter itself is changed only when you accept a change and apply it.\n\n\`\`\`bh-records\n${JSON.stringify(p, null, 1)}\n\`\`\`\n`,
	});
}

function parse(text: string, book: Book): Proposal {
	const note = parseManagedNote(text);
	if (note.frontmatter.bh_type !== "proposal") throw new ManagedNoteError("This note is not a proposal.");
	if (note.frontmatter.bh_schema > PROPOSAL_SCHEMA) throw new ManagedNoteError("Written by a newer Book Harness; update the plugin.");
	const m = FENCE.exec(note.body);
	if (!m) throw new ManagedNoteError("Proposal has no records block.");
	let data: unknown;
	try {
		data = JSON.parse(m[1]);
	} catch {
		throw new ManagedNoteError("Proposal records are not valid JSON.");
	}
	const p = data as Partial<Proposal> | null;
	if (!p || typeof p !== "object" || !isId(p.id, "pr") || p.bookId !== book.id || typeof p.chapterId !== "string" || typeof p.baseRevision !== "string" || !Array.isArray(p.edits) || !p.origin || typeof p.origin.action !== "string") throw new ManagedNoteError("Proposal record is malformed.");
	const edits = p.edits.filter(
		(e): e is ProposedEdit => !!e && typeof e === "object" && typeof e.id === "string" && Number.isInteger(e.from) && Number.isInteger(e.to) && e.from <= e.to && typeof e.original === "string" && typeof e.replacement === "string" && typeof e.before === "string" && typeof e.after === "string" && DECISIONS.includes(e.decision),
	);
	return { ...(p as Proposal), edits };
}

export async function listProposals(vault: VaultPort, book: Book): Promise<{ proposals: Proposal[]; problems: string[] }> {
	const prefix = `${book.folder}/${MANAGED_FOLDER}/proposals/`;
	const proposals: Proposal[] = [];
	const problems: string[] = [];
	for (const path of vault.markdownPaths().filter((p) => p.startsWith(prefix)).sort()) {
		try {
			proposals.push(parse(await vault.read(path), book));
		} catch (e) {
			problems.push(`${path}: ${e instanceof ManagedNoteError ? e.message : String(e)}`);
		}
	}
	return { proposals, problems };
}

async function persist(vault: VaultPort, book: Book, p: Proposal): Promise<void> {
	const path = proposalPath(book, p.id);
	if (!vault.exists(path)) {
		await vault.create(path, serialize(p));
		return;
	}
	const before = await vault.read(path);
	if (!(await vault.replaceIfUnchanged(path, before, serialize(p)))) throw new Error("A proposal changed on another device; try again.");
}

export interface NewEdit {
	from: number;
	to: number;
	replacement: string;
	rationale?: string;
}

/**
 * Record proposed changes against `baseText`. The chapter is not touched: the proposal lives in a managed note until the
 * author accepts individual changes and applies them.
 */
export async function createProposal(vault: VaultPort, book: Book, chapter: Chapter, baseText: string, origin: Proposal["origin"], edits: readonly NewEdit[], random: RandomPort, now: string): Promise<Proposal> {
	const sorted = [...edits].sort((a, b) => a.from - b.from);
	sorted.forEach((e, i) => {
		if (e.from < 0 || e.to > baseText.length || e.from > e.to) throw new Error("A proposed change points outside the chapter.");
		if (i > 0 && e.from < (sorted[i - 1]).to) throw new Error("Proposed changes overlap.");
	});
	const proposal: Proposal = {
		id: newId("pr", random),
		bookId: book.id,
		chapterId: chapter.id,
		origin,
		baseRevision: revisionOf(baseText),
		createdAt: now,
		edits: sorted.map((e, i) => ({ id: `e${i + 1}`, from: e.from, to: e.to, original: baseText.slice(e.from, e.to), replacement: e.replacement, before: baseText.slice(Math.max(0, e.from - ANCHOR), e.from), after: baseText.slice(e.to, e.to + ANCHOR), rationale: e.rationale, decision: "pending" })),
	};
	await persist(vault, book, proposal);
	return proposal;
}

/** Record the author's decision for the listed changes. Already applied changes cannot be re-decided. */
export async function decide(vault: VaultPort, book: Book, proposal: Proposal, editIds: readonly string[], decision: "accepted" | "rejected" | "pending"): Promise<Proposal> {
	const fresh = parse(await vault.read(proposalPath(book, proposal.id)), book);
	const next = { ...fresh, edits: fresh.edits.map((e) => (editIds.includes(e.id) && e.decision !== "applied" ? { ...e, decision } : e)) };
	await persist(vault, book, next);
	return next;
}

export interface ApplyResult {
	applied: number;
	conflicts: string[];
	proposal: Proposal;
}

/** Where an accepted change belongs in the current text, or null when that cannot be told for certain. */
function locate(text: string, edit: ProposedEdit, sameRevision: boolean): number | null {
	if (sameRevision && text.slice(edit.from, edit.to) === edit.original) return edit.from;
	// The note was edited since: only the same words with the same surroundings, found exactly once, count as the same place.
	const needle = edit.before + edit.original + edit.after;
	const first = text.indexOf(needle);
	if (first < 0 || text.indexOf(needle, first + 1) >= 0) return null;
	return first + edit.before.length;
}

/**
 * Apply every accepted, not yet applied change in ONE write, if each can be located with certainty. A change that cannot
 * be placed is marked a conflict and left for the author; nothing is applied by raw offset to text that has changed.
 */
export async function applyAccepted(vault: GuardedVault, book: Book, chapter: Chapter, proposal: Proposal): Promise<ApplyResult> {
	if (chapter.notePath === null) throw new Error(`${chapter.designation} has no manuscript note.`);
	const text = await vault.read(chapter.notePath);
	const sameRevision = revisionOf(text) === proposal.baseRevision;
	const placed: Array<{ edit: ProposedEdit; at: number }> = [];
	const conflicts: string[] = [];
	for (const edit of proposal.edits.filter((e) => e.decision === "accepted")) {
		const at = locate(text, edit, sameRevision);
		if (at === null) conflicts.push(edit.id);
		else placed.push({ edit, at });
	}
	placed.sort((a, b) => a.at - b.at);
	for (let i = 1; i < placed.length; i++) {
		const prev = placed[i - 1];
		if ((placed[i] as { at: number }).at < prev.at + prev.edit.original.length) conflicts.push((placed[i] as { edit: ProposedEdit }).edit.id);
	}
	const usable = placed.filter((p) => !conflicts.includes(p.edit.id));
	let next = text;
	for (const { edit, at } of [...usable].reverse()) next = next.slice(0, at) + edit.replacement + next.slice(at + edit.original.length);
	if (usable.length > 0 && !(await vault.writeManuscript(mintWriteCapability(proposal.id, chapter.notePath), chapter.notePath, text, next))) throw new Error(`${chapter.designation} changed while the changes were being applied. Nothing was written; try again.`);
	const done = new Set(usable.map((u) => u.edit.id));
	const updated: Proposal = { ...proposal, edits: proposal.edits.map((e) => (done.has(e.id) ? { ...e, decision: "applied" } : conflicts.includes(e.id) ? { ...e, decision: "conflict" } : e)) };
	await persist(vault, book, updated);
	return { applied: usable.length, conflicts, proposal: updated };
}
