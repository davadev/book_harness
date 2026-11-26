import { CHAPTER_STATUSES, type ChapterStatus } from "../core/status";
import type { Book } from "../core/books";
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

const KIND_LABEL: Record<JobRecord["kind"], string> = { "stats.words": "Word count", "chapter.summary": "Chapter summaries" };

function renderJob(root: HTMLElement, job: JobRecord, actions: BookActions): void {
	const box = root.createDiv({ cls: "bh-job" });
	const done = job.items.filter((i) => i.state === "done").length;
	box.createEl("strong", { text: `${KIND_LABEL[job.kind]} ${JOB_LABEL[job.state].toLowerCase()}: ${done} of ${job.items.length} chapters` });
	if (job.state === "interrupted") box.createDiv({ cls: "bh-note", text: "The app closed before it finished. Nothing was restarted; run it again if you want the rest." });
	for (const item of job.items.filter((i) => i.message && i.state !== "pending")) box.createDiv({ cls: "bh-note", text: `${item.designation}: ${item.message}` });
	const label = job.state === "running" ? "Cancel" : "Dismiss";
	box.createEl("button", { cls: "bh-button", text: label }).addEventListener("click", () => (job.state === "running" ? actions.cancelJob(job.id) : actions.dismissJob(job.id)));
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
	bar.createEl("button", { cls: "bh-button", text: "Update word counts" }).addEventListener("click", () => bookActions.updateStats());

	if (!overview) return;
	for (const job of overview.jobs) renderJob(root, job, bookActions);
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
