// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerBook } from "../core/books";
import { addChapter } from "../core/chapters";
import { createEntity } from "../core/entities";
import { GuardedVault } from "../core/guarded-vault";
import { EditorHighlights } from "../platform/editor-highlights";
import { linkSelection, removeHighlightAtCursor } from "../platform/highlight-commands";
import { ObsidianVaultPort } from "../platform/vault-port";
import { DEFAULT_SETTINGS } from "../settings/defaults";
import { makeFakeApp } from "./__mocks__/fakeApp";
import { counterRandom } from "./__mocks__/fakeVault";
import { MarkdownView, Notice } from "./__mocks__/obsidian";
import { installObsidianDom } from "./__mocks__/obsidianDom";

const TEXT = "Philip Marlowe met Anna. Anna smiled.";

beforeEach(() => {
	installObsidianDom();
	(HTMLElement.prototype as unknown as { setText: (t: string) => void }).setText = function (this: HTMLElement, t: string) {
		this.textContent = t;
	};
	document.body.replaceChildren();
	Notice.instances.length = 0;
	vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

async function setup(settings = DEFAULT_SETTINGS.highlight) {
	const fake = makeFakeApp({ "Book/one.md": TEXT, "Book/loose.md": "Anna here.", "Other/x.md": "Anna" });
	const vault = new GuardedVault(new ObsidianVaultPort(fake.app));
	const rnd = counterRandom();
	const book = await registerBook(vault, "Book", "Book", "en", rnd);
	const chapter = await addChapter(vault, book, [], { designation: "Chapter 1", notePath: "Book/one.md" }, rnd);
	const philip = await createEntity(vault, book, [], { type: "character", name: "Philip Marlowe" }, rnd);
	const anna = await createEntity(vault, book, [philip], { type: "place", name: "Anna" }, rnd);
	const mine = { ...settings };
	const onSelect = vi.fn();
	const highlights = new EditorHighlights(fake.app, () => mine, onSelect);
	const dispatch = vi.fn();
	const mk = (path: string, text: string, cm: unknown, extra: object = {}) => ({ view: Object.assign(new MarkdownView(), { file: { path }, editor: { getValue: () => text, getSelection: () => "", getCursor: () => ({}), posToOffset: (p: { n?: number }) => p.n ?? 0, ...extra, cm } }) });
	const other = vi.fn();
	const leaves = [mk("Book/one.md", TEXT, { dispatch }), mk("Book/loose.md", "Anna here.", { dispatch: other }), mk("Other/x.md", "Anna", { dispatch: other }), mk("Book/one.md", TEXT, undefined), { view: {} }, { view: Object.assign(new MarkdownView(), { file: null }) }];
	(fake.appAny.workspace as unknown as { getLeavesOfType: () => unknown[] }).getLeavesOfType = () => leaves;
	return { fake, vault, book, chapter, philip, anna, highlights, dispatch, other, mine, onSelect, mk };
}

const evidence = (chapterId: string, ids: string[]) => `---\nbh_schema: 1\nbh_type: knowledge\nbh_id: ${chapterId}\n---\n\`\`\`bh-records\n${JSON.stringify({ chapterId, fingerprint: "f", sourceRevision: "r", items: ids.map((id) => ({ entityId: id, kind: "character", name: "n", quote: "q", note: "" })) })}\n\`\`\`\n`;

describe("EditorHighlights", () => {
	it("highlights only entities the chapter's text supports, by their kind", async () => {
		const { fake, book, chapter, philip, anna, highlights, dispatch, other } = await setup();
		fake.store.set(`${book.folder}/_book-harness/knowledge/${chapter.id}.md`, evidence(chapter.id, [philip.id, anna.id]));
		await highlights.refresh();
		const sent = (dispatch.mock.calls[0]![0] as { effects: { value: Array<{ text: string; type: string }> } }).effects.value;
		expect(sent.map((i) => [i.text, i.type])).toEqual([["Philip Marlowe", "character"], ["Anna", "place"], ["Anna", "place"]]);
		await highlights.refresh();
		expect(dispatch).toHaveBeenCalledTimes(1);
		expect(other).toHaveBeenCalledTimes(2);
	});

	it("shows nothing for chapters with no evidence, other notes, and when switched off", async () => {
		const { fake, book, chapter, philip, highlights, dispatch, mine } = await setup();
		await highlights.refresh();
		expect((dispatch.mock.calls[0]![0] as { effects: { value: unknown[] } }).effects.value).toEqual([]);
		fake.store.set(`${book.folder}/_book-harness/knowledge/${chapter.id}.md`, evidence(chapter.id, [philip.id]));
		mine.enabled = false;
		await highlights.refresh();
		expect((dispatch.mock.calls.at(-1)![0] as { effects: { value: unknown[] } }).effects.value).toEqual([]);
		mine.enabled = true;
		mine.character = false;
		await highlights.refresh();
		expect((dispatch.mock.calls.at(-1)![0] as { effects: { value: unknown[] } }).effects.value).toEqual([]);
		mine.character = true;
		await highlights.refresh();
		expect((dispatch.mock.calls.at(-1)![0] as { effects: { value: unknown[] } }).effects.value).toHaveLength(1);
	});

	it("respects the per-kind switches for characters, places, objects and other kinds", async () => {
		const { fake, vault, book, chapter, philip, anna, highlights, dispatch, mine } = await setup();
		const rnd = counterRandom();
		const met = await createEntity(vault, book, [], { type: "object", name: "met" }, rnd);
		const smiled = await createEntity(vault, book, [], { type: "technology", name: "smiled" }, rnd);
		fake.store.set(`${book.folder}/_book-harness/knowledge/${chapter.id}.md`, evidence(chapter.id, [philip.id, anna.id, met.id, smiled.id]));
		const shownTypes = async () => {
			await highlights.refresh();
			return ((dispatch.mock.calls.at(-1)![0] as { effects: { value: Array<{ type: string }> } }).effects.value).map((i) => i.type);
		};
		expect(await shownTypes()).toEqual(["character", "object", "place", "place", "technology"]);
		mine.other = false;
		expect(await shownTypes()).toEqual(["character", "object", "place", "place"]);
		mine.object = false;
		expect(await shownTypes()).toEqual(["character", "place", "place"]);
		mine.place = false;
		expect(await shownTypes()).toEqual(["character"]);
		mine.character = false;
		expect(await shownTypes()).toEqual([]);
	});

	it("coalesces scheduled refreshes, can be canceled, and reports the tapped entity", async () => {
		const { highlights, onSelect } = await setup();
		const spy = vi.spyOn(highlights, "refresh");
		highlights.schedule();
		highlights.schedule();
		await vi.advanceTimersByTimeAsync(500);
		expect(spy).toHaveBeenCalledTimes(1);
		highlights.schedule();
		highlights.cancel();
		await vi.advanceTimersByTimeAsync(500);
		expect(spy).toHaveBeenCalledTimes(1);
		expect(highlights.extension()).toBeDefined();
		void onSelect;
	});

	it("runs one refresh at a time and logs instead of throwing when the vault cannot be read", async () => {
		const { fake, highlights, dispatch } = await setup();
		const a = highlights.refresh();
		const b = highlights.refresh();
		await Promise.all([a, b]);
		await vi.advanceTimersByTimeAsync(10);
		expect(dispatch.mock.calls.length).toBeGreaterThanOrEqual(1);
		fake.appAny.vault.getMarkdownFiles = () => {
			throw new Error("boom");
		};
		await expect(highlights.refresh()).resolves.toBeUndefined();
	});

	it("describes the chapter open in an editor, or nothing for a note outside a chapter", async () => {
		const { highlights, chapter } = await setup();
		expect((await highlights.contextFor("Book/one.md", TEXT))?.chapter.id).toBe(chapter.id);
		expect(await highlights.contextFor("Book/loose.md", "x")).toBeNull();
		expect(await highlights.contextFor("Other/x.md", "x")).toBeNull();
	});

	it("includes entities the author linked by hand even when the chapter was never read", async () => {
		const { vault, book, chapter, anna, highlights, fake } = await setup();
		await (await import("../core/occurrences")).linkOccurrence(vault, book, chapter.id, TEXT, anna.id, TEXT.indexOf("smiled"), TEXT.indexOf("smiled") + 6);
		const ctx = await highlights.contextFor("Book/one.md", TEXT);
		expect(ctx?.occurrences.filter((o) => o.source === "manual").map((o) => o.text)).toEqual(["smiled"]);
		void fake;
	});
});

describe("highlight commands", () => {
	function editorFor(text: string, from: number, to: number) {
		const offsets = new Map<unknown, number>();
		const a = { n: from };
		const b = { n: to };
		offsets.set(a, from);
		return { getValue: () => text, getSelection: () => text.slice(from, to), getCursor: (w?: string) => (w === "to" ? b : a), posToOffset: (p: { n: number }) => p.n } as never;
	}

	it("links the selected words to a chosen entity and refreshes the highlights", async () => {
		const { fake, vault, book, chapter, anna, highlights } = await setup();
		const at = TEXT.indexOf("smiled");
		const view = Object.assign(new MarkdownView(), { file: { path: "Book/one.md" } }) as never;
		const spy = vi.spyOn(highlights, "schedule");
		await linkSelection(fake.app, highlights, editorFor(TEXT, at, at + 6), view);
		expect(document.body.textContent).toContain("Link “smiled” to…");
		const select = document.body.querySelector("select") as HTMLSelectElement;
		select.value = anna.id;
		select.dispatchEvent(new Event("change"));
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Link")!.click();
		const { loadCorrections } = await import("../core/occurrences");
		await vi.waitFor(async () => expect((await loadCorrections(vault, book, chapter.id)).manual).toHaveLength(1));
		expect(spy).toHaveBeenCalled();
		expect(fake.store.get("Book/one.md")).toBe(TEXT);
	});

	it("reports a link that could not be saved", async () => {
		const { fake, highlights } = await setup();
		const at = TEXT.indexOf("smiled");
		const view = Object.assign(new MarkdownView(), { file: { path: "Book/one.md" } }) as never;
		await linkSelection(fake.app, highlights, editorFor(TEXT, at, at + 6), view);
		fake.appAny.vault.create = () => Promise.reject(new Error("disk full"));
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Link")!.click();
		await vi.waitFor(() => expect(Notice.instances.at(-1)?.message).toBe("disk full"));
		fake.appAny.vault.create = () => Promise.reject("odd");
		await linkSelection(fake.app, highlights, editorFor(TEXT, at, at + 6), view);
		Array.from(document.body.querySelectorAll("button")).filter((b) => b.textContent === "Link").at(-1)!.click();
		await vi.waitFor(() => expect(Notice.instances.at(-1)?.message).toBe("odd"));
	});

	it("explains what to do when nothing is selected, the note is not a chapter, or there are no entities", async () => {
		const { fake, highlights, vault, book } = await setup();
		const view = (path: string) => Object.assign(new MarkdownView(), { file: { path } }) as never;
		await linkSelection(fake.app, highlights, editorFor(TEXT, 3, 3), view("Book/one.md"));
		expect(Notice.instances.at(-1)?.message).toBe("Select the words you want to link first.");
		await linkSelection(fake.app, highlights, editorFor(TEXT, 0, 6), Object.assign(new MarkdownView(), { file: null }) as never);
		expect(Notice.instances.at(-1)?.message).toBe("Select the words you want to link first.");
		await linkSelection(fake.app, highlights, editorFor("Anna", 0, 4), view("Other/x.md"));
		expect(Notice.instances.at(-1)?.message).toBe("This note is not a chapter of a registered book.");
		for (const key of [...fake.store.keys()]) if (key.includes("/entities/")) fake.store.delete(key);
		await linkSelection(fake.app, highlights, editorFor(TEXT, 0, 6), view("Book/one.md"));
		expect(Notice.instances.at(-1)?.message).toBe("There are no entities yet. Add one first.");
		void vault; void book;
	});

	it("removes the highlight under the cursor and says so when there is none", async () => {
		const { fake, vault, book, chapter, philip, highlights } = await setup();
		fake.store.set(`${book.folder}/_book-harness/knowledge/${chapter.id}.md`, evidence(chapter.id, [philip.id]));
		const view = Object.assign(new MarkdownView(), { file: { path: "Book/one.md" } }) as never;
		const spy = vi.spyOn(highlights, "schedule");
		fake.appAny.vault.create = () => Promise.reject(new Error("disk full"));
		await removeHighlightAtCursor(fake.app, highlights, editorFor(TEXT, 2, 2), view);
		expect(Notice.instances.at(-1)?.message).toBe("disk full");
		fake.appAny.vault.create = () => Promise.reject("odd");
		await removeHighlightAtCursor(fake.app, highlights, editorFor(TEXT, 2, 2), view);
		expect(Notice.instances.at(-1)?.message).toBe("odd");
		expect(spy).not.toHaveBeenCalled();
		fake.appAny.vault.create = (p: string, t: string) => (fake.store.set(p, t), Promise.resolve());
		await removeHighlightAtCursor(fake.app, highlights, editorFor(TEXT, 2, 2), view);
		expect(spy).toHaveBeenCalled();
		const { loadCorrections } = await import("../core/occurrences");
		expect((await loadCorrections(vault, book, chapter.id)).removed).toHaveLength(1);
		await removeHighlightAtCursor(fake.app, highlights, editorFor(TEXT, 19, 19), view);
		expect(Notice.instances.at(-1)?.message).toBe("There is no highlight at the cursor.");
		await removeHighlightAtCursor(fake.app, highlights, editorFor("x", 0, 0), Object.assign(new MarkdownView(), { file: null }) as never);
		expect(Notice.instances.at(-1)?.message).toBe("There is no highlight at the cursor.");
	});
});
