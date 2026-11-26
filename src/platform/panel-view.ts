import { ItemView, Notice, TFile, type WorkspaceLeaf } from "obsidian";
import { listBooks, type Book } from "../core/books";
import { addChapter, bindNote, listChapters, readingOrder, setDesignation, setOrder, setStatus, type Chapter } from "../core/chapters";
import type { ChapterStatus } from "../core/status";
import { buildOverview, orderToMove, resolveContext } from "../core/panel-model";
import { chapterStats, updateAllStats, type ChapterStats } from "../core/task-state";
import { renderOverview, type BookActions, type OverviewActions } from "../ui/overview";
import { createGuardedVault } from "./guarded-vault";
import { PromptModal } from "./prompt-modal";
import { platformRandom } from "./random";
import { registerActiveFolder } from "./register-book";

export const PANEL_VIEW_TYPE = "book-harness-panel";

export class BookHarnessView extends ItemView {
	private dirty = true;
	private drawing = false;
	private timer = 0;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return PANEL_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Book Harness";
	}

	getIcon(): string {
		return "book-open";
	}

	onOpen(): Promise<void> {
		const refresh = () => this.scheduleRefresh();
		// Only notes the panel reads trigger a redraw: managed records, or any rename/delete (a chapter's note may move).
		const managed = (f: { path: string }) => f.path.includes("/_book-harness/");
		this.registerEvent(this.app.workspace.on("file-open", refresh));
		this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => (leaf === this.leaf ? this.showAgain() : undefined)));
		this.registerEvent(this.app.vault.on("modify", (f) => (managed(f) ? refresh() : undefined)));
		this.registerEvent(this.app.vault.on("create", (f) => (managed(f) ? refresh() : undefined)));
		this.registerEvent(this.app.vault.on("delete", refresh));
		this.registerEvent(this.app.vault.on("rename", refresh));
		this.register(() => window.clearTimeout(this.timer));
		this.markDirty();
		return Promise.resolve();
	}

	private scheduleRefresh(): void {
		window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => this.markDirty(), 150);
	}

	/** Mark stale; draw only when the panel is on screen (playbook: never draw while hidden). */
	markDirty(): void {
		this.dirty = true;
		if (typeof this.containerEl.isShown !== "function" || this.containerEl.isShown()) void this.draw();
	}

	/** Called when the panel becomes visible again. */
	showAgain(): void {
		if (this.dirty) void this.draw();
	}

	async draw(): Promise<void> {
		if (this.drawing) return;
		this.drawing = true;
		try {
			this.dirty = false;
			const vault = createGuardedVault(this.app);
			const { books, problems: bookProblems } = await listBooks(vault);
			const active = this.app.workspace.getActiveFile()?.path ?? null;
			const loaded = await Promise.all(books.map((b) => listChapters(vault, b)));
			const chapters = loaded.flatMap((r) => r.chapters);
			const problems = [...bookProblems, ...loaded.flatMap((r) => r.problems)].map((p) => `${p.path}: ${p.reason}`);
			const ctx = resolveContext(books, active, chapters);
			const book = ctx.kind === "book" ? ctx.book : null;
			const shown = book ? chapters.filter((c) => c.bookId === book.id) : [];
			const stats = new Map<string, ChapterStats>();
			for (const c of shown) stats.set(c.id, await chapterStats(vault, book as Book, c));
			const overview = book ? buildOverview(book, shown, active, (p) => vault.exists(p), stats) : null;
			renderOverview(this.contentEl, ctx, overview, this.actions(chapters), problems);
		} catch (e) {
			this.contentEl.empty();
			this.contentEl.createEl("p", { cls: "bh-empty", text: `Book Harness could not read this book: ${e instanceof Error ? e.message : String(e)}` });
		} finally {
			this.drawing = false;
			if (this.dirty) void this.draw();
		}
	}

	private actions(allChapters: Chapter[]): OverviewActions {
		return { registerFolder: () => registerActiveFolder(this.app), forBook: (book) => this.bookActions(book, allChapters.filter((c) => c.bookId === book.id)) };
	}

	private bookActions(book: Book, chapters: Chapter[]): BookActions {
		const vault = createGuardedVault(this.app);
		const fail = (e: unknown) => new Notice(e instanceof Error ? e.message : String(e), 8000);
		const run = (work: Promise<unknown>) => void work.then(() => this.markDirty(), fail);
		const find = (id: string): Chapter => chapters.find((c) => c.id === id) as Chapter;
		return {
			openNote: (path) => {
				const f = this.app.vault.getAbstractFileByPath(path);
				if (f instanceof TFile) void this.app.workspace.getLeaf(false).openFile(f);
			},
			setStatus: (id: string, status: ChapterStatus) => run(setStatus(vault, book, find(id), status)),
			move: (id, direction) => {
				const order = orderToMove(readingOrder(chapters), id, direction);
				if (order === null) new Notice("These chapters share an order value. Resolve that first.", 8000);
				else run(setOrder(vault, book, find(id), order));
			},
			rename: (id, current) => new PromptModal(this.app, "Rename chapter", "Designation", current, (v) => run(setDesignation(vault, book, chapters, find(id), v))).open(),
			unbind: (id) => run(bindNote(vault, book, chapters, find(id), null)),
			promoteActive: (path) => new PromptModal(this.app, "Make this note a chapter", "Designation", "", (v) => run(addChapter(vault, book, chapters, { designation: v, notePath: path }, platformRandom))).open(),
			updateStats: () =>
				void updateAllStats(vault, book, chapters, () => new Date().toISOString()).then((r) => {
					new Notice(`Counted ${r.committed} chapter${r.committed === 1 ? "" : "s"}.${r.discarded.length ? ` Not stored: ${r.discarded.join(" ")}` : ""}${r.failed.length ? ` Failed: ${r.failed.join(" ")}` : ""}`, 8000);
					this.markDirty();
				}),
			planChapter: () => new PromptModal(this.app, "Plan a chapter", "Designation", "", (v) => run(addChapter(vault, book, chapters, { designation: v }, platformRandom))).open(),
		};
	}
}
