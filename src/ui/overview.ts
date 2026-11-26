import { CHAPTER_STATUSES, type ChapterStatus } from "../core/status";
import type { Book } from "../core/books";
import type { Entity } from "../core/entities";
import type { SearchResult } from "../core/search";
import type { Overview, PanelContext } from "../core/panel-model";
import type { JobRecord } from "../core/jobs";
import type { ChapterStats } from "../core/task-state";

/** Everything the overview can ask the platform to do. Each is an explicit author action. */
export interface BookActions {
	openNote(path: string): void;
	setStatus(chapterId: string, status: ChapterStatus): void;
	move(chapterId: string, direction: "up" | "down"): void;
	rename(chapterId: string, designation: string): void;
	unbind(chapterId: string): void;
	promoteActive(path: string): void;
	planChapter(): void;
	updateStats(): void;
	summarize(): void;
	proofread(): void;
	decideEdits(proposalId: string, editIds: string[], decision: "accepted" | "rejected"): void;
	applyProposal(proposalId: string): void;
	extractEntities(): void;
	mergeDuplicate(fromId: string, intoId: string): void;
	keepDistinct(aId: string, bId: string): void;
	closeEntity(): void;
	search(query: string): void;
	openPassage(result: SearchResult): void;
	addEntity(): void;
	renameEntity(id: string, current: string): void;
	addAlias(id: string): void;
	mergeEntity(id: string): void;
	removeAlias(id: string): void;
	splitEntity(id: string): void;
	archiveEntity(id: string): void;
	addTodo(): void;
	completeTodo(manualId: string): void;
	cancelJob(jobId: string): void;
	dismissJob(jobId: string): void;
}

export interface OverviewActions {
	registerFolder(): void;
	/** Actions that need a book; only requested once a book is in context. */
	forBook(book: Book): BookActions;
}

const STATUS_LABEL: Record<ChapterStatus, string> = {
	planned: "Planned",
	drafting: "Drafting",
	written: "Written",
	revising: "Revising",
	finalized: "Finalized",
};

const JOB_LABEL: Record<JobRecord["state"], string> = {
	running: "Running",
	completed: "Finished",
	canceled: "Canceled",
	interrupted: "Interrupted",
	dismissed: "",
};

const KIND_LABEL: Record<JobRecord["kind"], string> = { "stats.words": "Word count", "chapter.summary": "Chapter summaries", proofread: "Proofreading", "entities.extract": "Finding entities" };

function renderJob(root: HTMLElement, job: JobRecord, actions: BookActions): void {
	const box = root.createDiv({ cls: "bh-job" });
	const done = job.items.filter((i) => i.state === "done").length;
	box.createEl("strong", { text: `${KIND_LABEL[job.kind]} ${JOB_LABEL[job.state].toLowerCase()}: ${done} of ${job.items.length} chapters` });
	if (job.state === "interrupted") box.createDiv({ cls: "bh-note", text: "The app closed before it finished. Nothing was restarted; run it again if you want the rest." });
	for (const item of job.items.filter((i) => i.message && i.state !== "pending")) box.createDiv({ cls: "bh-note", text: `${item.designation}: ${item.message}` });
	const label = job.state === "running" ? "Cancel" : "Dismiss";
	box.createEl("button", { cls: "bh-button", text: label }).addEventListener("click", () => (job.state === "running" ? actions.cancelJob(job.id) : actions.dismissJob(job.id)));
}

function renderSearch(root: HTMLElement, overview: Overview, actions: BookActions): void {
	const box = root.createDiv({ cls: "bh-search" });
	const form = box.createDiv({ cls: "bh-actions" });
	const input = form.createEl("input", { cls: "bh-input", type: "search", placeholder: "Search this book", attr: { "aria-label": "Search this book" } });
	input.value = overview.search?.query ?? "";
	const go = () => actions.search(input.value);
	form.createEl("button", { cls: "bh-button", text: "Search" }).addEventListener("click", go);
	// Searching happens on Enter or the button, never on every keystroke: the field keeps focus and the phone keyboard stays open.
	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter") go();
	});
	const s = overview.search;
	if (!s) return;
	box.createDiv({ cls: "bh-note", text: `Keyword search over ${s.passagesIndexed} passages in ${s.chaptersIndexed} chapter${s.chaptersIndexed === 1 ? "" : "s"}, up to date with your notes.${s.missingChapters.length ? ` Not searched, no note yet: ${s.missingChapters.join(", ")}.` : ""}` });
	if (s.results.length === 0) box.createDiv({ cls: "bh-empty", text: `Nothing found for “${s.query}”. Words are matched exactly as written; this does not mean the idea is absent from the book.` });
	for (const r of s.results) {
		const row = box.createDiv({ cls: "bh-result" });
		row.createEl("button", { cls: "bh-link", text: r.chapter }).addEventListener("click", () => actions.openPassage(r));
		row.createDiv({ cls: "bh-note", text: r.snippet });
		if (r.entities.length > 0) row.createDiv({ cls: "bh-note", text: `Mentions: ${r.entities.join(", ")}` });
	}
}

function renderSelected(root: HTMLElement, e: Entity, actions: BookActions): void {
	const box = root.createDiv({ cls: "bh-selected" });
	box.createEl("h4", { text: `${e.name} (${e.type})` });
	if (e.aliases.length > 0) box.createDiv({ cls: "bh-note", text: `Also: ${e.aliases.join(", ")}` });
	box.createDiv({ cls: "bh-body", text: e.body.replace(/^# .*\n+/, "").trim() });
	const controls = box.createDiv({ cls: "bh-actions" });
	controls.createEl("button", { cls: "bh-button", text: "Open note" }).addEventListener("click", () => actions.openNote(e.path));
	controls.createEl("button", { cls: "bh-button", text: "Close" }).addEventListener("click", () => actions.closeEntity());
}

function renderEntities(root: HTMLElement, overview: Overview, actions: BookActions): void {
	const box = root.createDiv({ cls: "bh-entities" });
	box.createEl("h4", { text: `Entities (${overview.entities.length})` });
	let kind = "";
	for (const e of overview.entities) {
		if (e.type !== kind) {
			kind = e.type;
			box.createDiv({ cls: "bh-note", text: kind });
		}
		const row = box.createDiv({ cls: "bh-entity" });
		row.createEl("button", { cls: "bh-link", text: e.name }).addEventListener("click", () => actions.openNote(e.path));
		if (e.aliases.length > 0) row.createDiv({ cls: "bh-note", text: `Also: ${e.aliases.join(", ")}` });
		const controls = row.createDiv({ cls: "bh-chapter-controls" });
		const add = (label: string, aria: string, fn: () => void) => controls.createEl("button", { cls: "bh-icon-button", text: label, attr: { "aria-label": aria } }).addEventListener("click", fn);
		add("Rename", `Rename ${e.name}`, () => actions.renameEntity(e.id, e.name));
		add("Add alias", `Add another name for ${e.name}`, () => actions.addAlias(e.id));
		add("Merge", `Merge ${e.name} into another ${e.type}`, () => actions.mergeEntity(e.id));
		if (e.aliases.length > 0) {
			add("Remove alias", `Remove one of the other names of ${e.name}`, () => actions.removeAlias(e.id));
			add("Split", `Move one of the other names of ${e.name} to a new entity`, () => actions.splitEntity(e.id));
		}
		add("Remove", `Remove ${e.name} from the list`, () => actions.archiveEntity(e.id));
	}
}

function renderProposal(root: HTMLElement, entry: Overview["proposals"][number], actions: BookActions): void {
	const { proposal, designation } = entry;
	const box = root.createDiv({ cls: "bh-proposal" });
	const open = proposal.edits.filter((e) => e.decision === "pending");
	const accepted = proposal.edits.filter((e) => e.decision === "accepted");
	box.createEl("strong", { text: `Suggested changes for ${designation}` });
	box.createDiv({ cls: "bh-note", text: "Your chapter is not changed until you accept a change and apply it." });
	for (const edit of proposal.edits.filter((e) => e.decision !== "rejected" && e.decision !== "applied")) {
		const row = box.createDiv({ cls: "bh-edit" });
		row.createSpan({ cls: "bh-context", text: `…${edit.before.slice(-24)}` });
		row.createEl("del", { text: edit.original === "" ? "(nothing)" : edit.original });
		row.createEl("ins", { text: edit.replacement === "" ? "(removed)" : edit.replacement });
		row.createSpan({ cls: "bh-context", text: `${edit.after.slice(0, 24)}…` });
		const state = { pending: "Not decided", accepted: "Accepted", conflict: "Could not be placed: the text changed", rejected: "", applied: "" }[edit.decision];
		row.createSpan({ cls: "bh-badge", text: state });
		const controls = row.createDiv({ cls: "bh-chapter-controls" });
		if (edit.decision !== "conflict") {
			controls.createEl("button", { cls: "bh-icon-button", text: "Accept", attr: { "aria-label": `Accept the change ${edit.original} to ${edit.replacement}` } }).addEventListener("click", () => actions.decideEdits(proposal.id, [edit.id], "accepted"));
		}
		controls.createEl("button", { cls: "bh-icon-button", text: "Reject", attr: { "aria-label": `Reject the change ${edit.original} to ${edit.replacement}` } }).addEventListener("click", () => actions.decideEdits(proposal.id, [edit.id], "rejected"));
	}
	const bulk = box.createDiv({ cls: "bh-actions" });
	if (open.length > 1) bulk.createEl("button", { cls: "bh-button", text: `Accept all ${open.length} undecided changes` }).addEventListener("click", () => actions.decideEdits(proposal.id, open.map((e) => e.id), "accepted"));
	if (open.length > 0) bulk.createEl("button", { cls: "bh-button", text: `Reject all ${open.length} undecided changes` }).addEventListener("click", () => actions.decideEdits(proposal.id, open.map((e) => e.id), "rejected"));
	if (accepted.length > 0) bulk.createEl("button", { cls: "bh-button mod-cta", text: `Apply ${accepted.length} accepted change${accepted.length === 1 ? "" : "s"} to the chapter` }).addEventListener("click", () => actions.applyProposal(proposal.id));
}

function statsLine(stats: ChapterStats): string {
	const words = stats.words === null ? "Not counted yet" : `${stats.words.toLocaleString("en-US")} words`;
	const state = { current: "", stale: " (out of date: the text changed since it was counted)", not_processed: "", failed: " (last count failed)", canceled: " (last count was canceled)" }[stats.status];
	return `${words}${state}`;
}

/**
 * Draws the overview. Never rebuilds an element that holds focus on its own: the caller redraws only when data changed.
 * State is conveyed by text and an icon-free label, never by colour alone.
 */
export function renderOverview(root: HTMLElement, ctx: PanelContext, overview: Overview | null, actions: OverviewActions, problems: readonly string[] = []): void {
	root.empty();
	root.addClass("bh-panel");
	// A failed read is not "no data": say what could not be read, whatever else the panel shows.
	if (problems.length > 0) {
		const box = root.createDiv({ cls: "bh-callout" });
		box.createEl("strong", { text: "Some Book Harness records could not be read" });
		for (const p of problems) box.createDiv({ text: p });
	}
	if (ctx.kind === "no-books") {
		root.createEl("p", { cls: "bh-empty", text: "No books yet. Register a folder as a book to begin." });
		root.createEl("button", { cls: "bh-button mod-cta", text: "Register this note's folder as a book" }).addEventListener("click", () => actions.registerFolder());
		return;
	}
	if (ctx.kind === "inactive") {
		root.createEl("p", {
			cls: "bh-empty",
			text: ctx.reason === "no-active-note" ? "Open a note to see its book." : "This note is not part of a registered book.",
		});
		root.createEl("button", { cls: "bh-button", text: "Register this note's folder as a book" }).addEventListener("click", () => actions.registerFolder());
		return;
	}
	const { book } = ctx;
	const bookActions = actions.forBook(book);
	root.createEl("h3", { cls: "bh-title", text: book.title });
	root.createDiv({ cls: "bh-meta", text: `${book.primaryLanguage}${book.targetLanguages.length ? ` → ${book.targetLanguages.join(", ")}` : ""}` });

	const bar = root.createDiv({ cls: "bh-actions" });
	if (ctx.role === "manuscript") bar.createEl("button", { cls: "bh-button mod-cta", text: "Make this note a chapter" }).addEventListener("click", () => bookActions.promoteActive(ctx.activePath));
	bar.createEl("button", { cls: "bh-button", text: "Plan a chapter" }).addEventListener("click", () => bookActions.planChapter());
	bar.createEl("button", { cls: "bh-button", text: "Add a to-do" }).addEventListener("click", () => bookActions.addTodo());
	bar.createEl("button", { cls: "bh-button", text: "Summarize chapters" }).addEventListener("click", () => bookActions.summarize());
	bar.createEl("button", { cls: "bh-button", text: "Find characters, places and objects" }).addEventListener("click", () => bookActions.extractEntities());
	bar.createEl("button", { cls: "bh-button", text: "Add an entity" }).addEventListener("click", () => bookActions.addEntity());
	bar.createEl("button", { cls: "bh-button", text: "Proofread chapters" }).addEventListener("click", () => bookActions.proofread());
	bar.createEl("button", { cls: "bh-button", text: "Update word counts" }).addEventListener("click", () => bookActions.updateStats());

	if (!overview) return;
	renderSearch(root, overview, bookActions);
	if (overview.selected) renderSelected(root, overview.selected, bookActions);
	for (const job of overview.jobs) renderJob(root, job, bookActions);
	for (const entry of overview.proposals) renderProposal(root, entry, bookActions);
	if (overview.duplicates.length > 0) {
		const box = root.createDiv({ cls: "bh-duplicates" });
		box.createEl("h4", { text: `Could these be the same? (${overview.duplicates.length})` });
		box.createDiv({ cls: "bh-note", text: "They share a word. Nothing is merged unless you say so." });
		for (const d of overview.duplicates) {
			const row = box.createDiv({ cls: "bh-entity" });
			row.createSpan({ text: `${d.a.name} and ${d.b.name} (${d.a.type}, both contain "${d.shared}") ` });
			const controls = row.createDiv({ cls: "bh-chapter-controls" });
			controls.createEl("button", { cls: "bh-icon-button", text: "Same: merge", attr: { "aria-label": `Merge ${d.b.name} into ${d.a.name}` } }).addEventListener("click", () => bookActions.mergeDuplicate(d.b.id, d.a.id));
			controls.createEl("button", { cls: "bh-icon-button", text: "Different", attr: { "aria-label": `${d.a.name} and ${d.b.name} are different` } }).addEventListener("click", () => bookActions.keepDistinct(d.a.id, d.b.id));
		}
	}
	if (overview.unsupported.length > 0) {
		const box = root.createDiv({ cls: "bh-callout" });
		box.createEl("strong", { text: "No chapter supports these any more" });
		for (const e of overview.unsupported) box.createDiv({ text: `${e.name} (${e.type}): the text it was found in has changed. Keep or remove it.` });
	}
	if (overview.entities.length > 0) renderEntities(root, overview, bookActions);
	if (overview.todos.length > 0) {
		const box = root.createDiv({ cls: "bh-todos" });
		box.createEl("h4", { text: `To do (${overview.todos.length})` });
		const items = box.createEl("ul");
		for (const t of overview.todos) {
			const li = items.createEl("li", { cls: `bh-todo bh-${t.severity}` });
			li.createSpan({ cls: "bh-badge", text: t.severity === "required" ? "Required" : "Note" });
			const notePath = t.notePath;
			if (notePath === undefined) li.createSpan({ text: ` ${t.message}` });
			else li.createEl("button", { cls: "bh-link", text: t.message }).addEventListener("click", () => bookActions.openNote(notePath));
			const manualId = t.manualId;
			if (manualId !== undefined) li.createEl("button", { cls: "bh-icon-button", text: "Done", attr: { "aria-label": `Mark done: ${t.message}` } }).addEventListener("click", () => bookActions.completeTodo(manualId));
		}
	}
	if (overview.rows.length === 0) {
		root.createEl("p", { cls: "bh-empty", text: "No chapters yet. Open a manuscript note and make it a chapter, or plan one." });
		return;
	}
	const list = root.createEl("ol", { cls: "bh-chapters" });
	for (const row of overview.rows) {
		const li = list.createEl("li", { cls: row.isActive ? "bh-chapter is-active" : "bh-chapter" });
		const head = li.createDiv({ cls: "bh-chapter-head" });
		const title = head.createEl("button", { cls: "bh-link", text: row.chapter.designation });
		title.addEventListener("click", () => {
			if (row.chapter.notePath !== null && !row.missingNote) bookActions.openNote(row.chapter.notePath);
		});
		if (row.isActive) head.createSpan({ cls: "bh-badge", text: "Open now" });
		if (row.chapter.notePath === null) head.createSpan({ cls: "bh-badge", text: "No file yet" });
		if (row.missingNote) head.createSpan({ cls: "bh-badge", text: "Note not found" });
		if (row.chapter.notePath !== null) li.createDiv({ cls: "bh-note", text: statsLine(row.stats) });
		if (row.summary.path !== null) {
			const summaryPath = row.summary.path;
			const line = li.createDiv({ cls: "bh-note" });
			line.createSpan({ text: row.summary.status === "stale" ? "Summary (out of date: the text, prompt or model changed) " : "Summary " });
			line.createEl("button", { cls: "bh-link", text: "Open" }).addEventListener("click", () => bookActions.openNote(summaryPath));
		}
		if (row.proofread !== null && row.proofread.total > 0) {
			const c = row.proofread;
			li.createDiv({ cls: "bh-note", text: `Proofreading: ${c.reviewed} of ${c.total} paragraphs reviewed${c.waiting ? `, ${c.waiting} waiting for your decision` : ""}${c.pending ? `, ${c.pending} not checked yet` : ""}.` });
		}
		const controls = li.createDiv({ cls: "bh-chapter-controls" });
		const select = controls.createEl("select", { cls: "bh-select dropdown", attr: { "aria-label": `Status of ${row.chapter.designation}` } });
		for (const s of CHAPTER_STATUSES) {
			const o = select.createEl("option", { text: STATUS_LABEL[s], value: s });
			o.selected = s === row.chapter.status;
		}
		select.addEventListener("change", () => bookActions.setStatus(row.chapter.id, select.value as ChapterStatus));
		const up = controls.createEl("button", { cls: "bh-icon-button", text: "Up", attr: { "aria-label": `Move ${row.chapter.designation} earlier` } });
		up.disabled = row.isFirst;
		up.addEventListener("click", () => bookActions.move(row.chapter.id, "up"));
		const down = controls.createEl("button", { cls: "bh-icon-button", text: "Down", attr: { "aria-label": `Move ${row.chapter.designation} later` } });
		down.disabled = row.isLast;
		down.addEventListener("click", () => bookActions.move(row.chapter.id, "down"));
		const rename = controls.createEl("button", { cls: "bh-icon-button", text: "Rename", attr: { "aria-label": `Rename ${row.chapter.designation}` } });
		rename.addEventListener("click", () => bookActions.rename(row.chapter.id, row.chapter.designation));
		if (row.chapter.notePath !== null) {
			const unbind = controls.createEl("button", { cls: "bh-icon-button", text: "Unlink", attr: { "aria-label": `Unlink the note from ${row.chapter.designation}` } });
			unbind.addEventListener("click", () => bookActions.unbind(row.chapter.id));
		}
	}
}
