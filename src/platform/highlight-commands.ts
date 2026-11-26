import { Notice, type App, type Editor, type MarkdownView } from "obsidian";
import { activeEntities, listAllEntities } from "../core/entities";
import { linkOccurrence, removeOccurrence } from "../core/occurrences";
import type { EditorHighlights } from "./editor-highlights";
import { createGuardedVault } from "./guarded-vault";
import { PickModal } from "./pick-modal";

/** Link the selected words to an entity the author picks. Remembered in a managed note; the chapter is not changed. */
export async function linkSelection(app: App, highlights: EditorHighlights, editor: Editor, view: MarkdownView): Promise<void> {
	const path = view.file?.path;
	if (!path || editor.getSelection() === "") {
		new Notice("Select the words you want to link first.", 8000);
		return;
	}
	const text = editor.getValue();
	const from = editor.posToOffset(editor.getCursor("from"));
	const to = editor.posToOffset(editor.getCursor("to"));
	const ctx = await highlights.contextFor(path, text);
	if (!ctx) {
		new Notice("This note is not a chapter of a registered book.", 8000);
		return;
	}
	const vault = createGuardedVault(app);
	const entities = activeEntities((await listAllEntities(vault, ctx.book)).entities);
	const [first] = entities;
	if (!first) {
		new Notice("There are no entities yet. Add one first.", 8000);
		return;
	}
	new PickModal(app, `Link “${text.slice(from, to)}” to…`, entities.map((e) => ({ value: e.id, label: `${e.name} (${e.type})` })), null, "Link", (id) => {
		void linkOccurrence(vault, ctx.book, ctx.chapter.id, text, id, from, to).then(
			() => highlights.schedule(),
			(e: unknown) => new Notice(e instanceof Error ? e.message : String(e), 8000),
		);
	}).open();
}

/** Remove the highlight under the cursor (it was wrong). Remembered, so it does not come back. */
export async function removeHighlightAtCursor(app: App, highlights: EditorHighlights, editor: Editor, view: MarkdownView): Promise<void> {
	const path = view.file?.path;
	const text = editor.getValue();
	const ctx = path ? await highlights.contextFor(path, text) : null;
	const at = editor.posToOffset(editor.getCursor());
	const hit = ctx?.occurrences.find((o) => at >= o.from && at <= o.to);
	if (!ctx || !hit) {
		new Notice("There is no highlight at the cursor.", 8000);
		return;
	}
	try {
		await removeOccurrence(createGuardedVault(app), ctx.book, ctx.chapter.id, text, hit);
		highlights.schedule();
	} catch (e) {
		new Notice(e instanceof Error ? e.message : String(e), 8000);
	}
}
