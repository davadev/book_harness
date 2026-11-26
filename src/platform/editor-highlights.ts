import type { Extension } from "@codemirror/state";
import { MarkdownView, type App } from "obsidian";
import { bookForPath, listBooks, type Book } from "../core/books";
import { listChapters, type Chapter } from "../core/chapters";
import { activeEntities, listAllEntities, type Entity } from "../core/entities";
import { loadEvidence } from "../core/extraction";
import { entitiesForChapter, findOccurrences, loadCorrections, type Occurrence } from "../core/occurrences";
import { logWarn } from "../logger";
import type { BookHarnessSettings } from "../settings/defaults";
import { editorViewOf } from "./editor-review";
import { highlightExtension, setHighlights, type HighlightItem } from "./editor/entity-highlights";
import { createGuardedVault } from "./guarded-vault";

/** What is known about the chapter open in an editor right now. */
export interface ChapterContext {
	book: Book;
	chapter: Chapter;
	text: string;
	entities: Entity[];
	occurrences: Occurrence[];
}

/**
 * Keeps the editors in step with the entities recognized in each chapter. It only reads: highlights are drawn from the
 * chapter text and the entity records, and nothing here can change a chapter.
 */
export class EditorHighlights {
	private readonly shown = new WeakMap<object, string>();
	private running = false;
	private again = false;
	private timer = 0;

	constructor(private readonly app: App, private readonly settings: () => BookHarnessSettings["highlight"], private readonly onSelect: (entityId: string) => void) {}

	extension(): Extension {
		return highlightExtension(this.onSelect);
	}

	schedule(): void {
		window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => void this.refresh(), 400);
	}

	cancel(): void {
		window.clearTimeout(this.timer);
	}

	/** Chapter, text, entities and mentions for a note, or null when it is not a chapter of a registered book. */
	async contextFor(path: string, text: string): Promise<ChapterContext | null> {
		const vault = createGuardedVault(this.app);
		const book = bookForPath((await listBooks(vault)).books, path);
		if (!book) return null;
		const chapter = (await listChapters(vault, book)).chapters.find((c) => c.notePath === path);
		if (!chapter) return null;
		const all = (await listAllEntities(vault, book)).entities;
		const evidence = await loadEvidence(vault, book, chapter.id);
		const entities = entitiesForChapter(all, evidence?.items.map((i) => i.entityId) ?? []);
		const manualIds = (await loadCorrections(vault, book, chapter.id)).manual.map((m) => m.entityId);
		const present = [...new Map([...entities, ...entitiesForChapter(all, manualIds)].map((e) => [e.id, e])).values()];
		return { book, chapter, text, entities: activeEntities(present), occurrences: findOccurrences(text, present, await loadCorrections(vault, book, chapter.id)) };
	}

	async refresh(): Promise<void> {
		if (this.running) {
			this.again = true;
			return;
		}
		this.running = true;
		try {
			const s = this.settings();
			for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
				const view = leaf.view;
				if (!(view instanceof MarkdownView) || !view.file) continue;
				const cm = editorViewOf(view);
				if (!cm) continue;
				const ctx = s.enabled ? await this.contextFor(view.file.path, view.editor.getValue()) : null;
				const byId = new Map((ctx?.entities ?? []).map((e) => [e.id, e]));
				const items: HighlightItem[] = (ctx?.occurrences ?? []).flatMap((o) => {
					const e = byId.get(o.entityId) as Entity;
					const wanted = e.type === "character" ? s.character : e.type === "place" ? s.place : e.type === "object" ? s.object : s.other;
					return wanted ? [{ entityId: e.id, type: e.type, name: e.name, from: o.from, to: o.to, text: o.text }] : [];
				});
				const key = JSON.stringify(items);
				if (this.shown.get(cm) !== key) {
					this.shown.set(cm, key);
					cm.dispatch({ effects: setHighlights.of(items) });
				}
			}
		} catch (e) {
			logWarn("could not update highlights:", e);
		} finally {
			this.running = false;
			if (this.again) {
				this.again = false;
				void this.refresh();
			}
		}
	}
}
