import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { MarkdownView, Notice, type App } from "obsidian";
import { bookForPath, listBooks, type Book } from "../core/books";
import { listChapters, type Chapter } from "../core/chapters";
import { listProposals } from "../core/proposals";
import { applyProposalById, decideEdits, inlineEditsFor, type InlineEdit } from "../core/review";
import { logWarn } from "../logger";
import { reviewExtension, setReviewEdits } from "./editor/review-extension";
import { createGuardedVault } from "./guarded-vault";
import { announceApplied } from "./panel-view";

/** Obsidian does not type the CodeMirror view behind an editor; this is the one place that reaches for it. */
export function editorViewOf(view: MarkdownView): EditorView | null {
	const cm = (view.editor as unknown as { cm?: EditorView }).cm;
	return cm ?? null;
}

/**
 * Keeps the open chapters' editors in step with the suggested changes stored for them, and carries out the author's
 * clicks on them. It reads the proposals; the only thing it ever changes in a chapter is an accepted change applied
 * through the manuscript gate.
 */
export class EditorReview {
	private readonly shown = new WeakMap<EditorView, string>();
	private readonly context = new Map<string, { book: Book; chapters: Chapter[] }>();
	private running = false;
	private again = false;
	private timer = 0;

	constructor(private readonly app: App) {}

	/** What the buttons inside the editor call. */
	readonly onDecide = (edit: InlineEdit, decision: "accepted" | "rejected"): void => {
		void this.decide(edit, decision);
	};

	extension(): Extension {
		return reviewExtension(this.onDecide);
	}

	/** Many events (every autosave) ask for a refresh; coalesce them. */
	schedule(): void {
		window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => void this.refresh(), 400);
	}

	cancel(): void {
		window.clearTimeout(this.timer);
	}

	async refresh(): Promise<void> {
		if (this.running) {
			this.again = true;
			return;
		}
		this.running = true;
		try {
			const vault = createGuardedVault(this.app);
			const { books } = await listBooks(vault);
			for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
				const view = leaf.view;
				if (!(view instanceof MarkdownView) || !view.file) continue;
				const cm = editorViewOf(view);
				if (!cm) continue;
				const path = view.file.path;
				const book = bookForPath(books, path);
				const edits = book ? await this.editsFor(vault, book, path, view.editor.getValue()) : [];
				const key = JSON.stringify(edits);
				if (this.shown.get(cm) !== key) {
					this.shown.set(cm, key);
					cm.dispatch({ effects: setReviewEdits.of(edits) });
				}
			}
		} catch (e) {
			logWarn("could not update suggested changes in the editor:", e);
		} finally {
			this.running = false;
			if (this.again) {
				this.again = false;
				void this.refresh();
			}
		}
	}

	private async editsFor(vault: ReturnType<typeof createGuardedVault>, book: Book, path: string, text: string): Promise<InlineEdit[]> {
		const { chapters } = await listChapters(vault, book);
		const chapter = chapters.find((c) => c.notePath === path);
		if (!chapter) return [];
		const edits = inlineEditsFor((await listProposals(vault, book)).proposals, chapter.id, text);
		for (const e of edits) this.context.set(e.proposalId, { book, chapters });
		return edits;
	}

	/** Accept applies at once (the author clicked it, in the chapter itself); reject only records the decision. */
	private async decide(edit: InlineEdit, decision: "accepted" | "rejected"): Promise<void> {
		const ctx = this.context.get(edit.proposalId);
		try {
			if (!ctx) throw new Error("That suggestion is no longer available.");
			const vault = createGuardedVault(this.app);
			await decideEdits(vault, ctx.book, ctx.chapters, edit.proposalId, [edit.editId], decision);
			if (decision === "accepted") announceApplied(await applyProposalById(vault, ctx.book, ctx.chapters, edit.proposalId));
		} catch (e) {
			new Notice(e instanceof Error ? e.message : String(e), 8000);
		}
		await this.refresh();
	}
}
