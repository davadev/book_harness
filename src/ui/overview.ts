import { CHAPTER_STATUSES, type ChapterStatus } from "../core/chapters";
import type { Book } from "../core/books";
import type { Overview, PanelContext } from "../core/panel-model";

/** Everything the overview can ask the platform to do. Each is an explicit author action. */
export interface BookActions {
	openNote(path: string): void;
	setStatus(chapterId: string, status: ChapterStatus): void;
	move(chapterId: string, direction: "up" | "down"): void;
	rename(chapterId: string, designation: string): void;
	unbind(chapterId: string): void;
	promoteActive(path: string): void;
	planChapter(): void;
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

	if (!overview) return;
	if (overview.conflicts.length > 0) {
		const box = root.createDiv({ cls: "bh-callout" });
		box.createEl("strong", { text: "Needs your decision" });
		for (const c of overview.conflicts) box.createDiv({ text: c.detail });
	}
	if (overview.gaps.length > 0) root.createDiv({ cls: "bh-note", text: `Missing numbers: ${overview.gaps.join(", ")}.` });
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
