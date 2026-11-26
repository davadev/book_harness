// @vitest-environment happy-dom
import { EditorState, StateEffect } from "@codemirror/state";
import { EditorView, type DecorationSet } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { highlightExtension, setHighlights, type HighlightItem } from "../platform/editor/entity-highlights";

const TEXT = "Philip Marlowe met Anna.";
const item = (over: Partial<HighlightItem> = {}): HighlightItem => ({ entityId: "en_p", type: "character", name: "Philip Marlowe", from: 0, to: 14, text: "Philip Marlowe", ...over });

function marks(state: EditorState): Array<{ from: number; to: number; cls: string; id: string }> {
	const out: Array<{ from: number; to: number; cls: string; id: string }> = [];
	for (const source of state.facet(EditorView.decorations)) {
		(source as DecorationSet).between(0, state.doc.length, (from, to, deco) => {
			const spec = deco.spec as { class: string; attributes: Record<string, string> };
			out.push({ from, to, cls: spec.class, id: spec.attributes["data-bh-entity"] as string });
		});
	}
	return out;
}

describe("entity highlights", () => {
	const make = (onSelect = vi.fn()) => ({ ext: highlightExtension(onSelect), onSelect });

	it("marks mentions by kind without changing the text, and shows nothing until told", () => {
		const { ext } = make();
		let state = EditorState.create({ doc: TEXT, extensions: [ext] });
		expect(marks(state)).toEqual([]);
		state = state.update({ effects: setHighlights.of([item(), item({ entityId: "en_a", type: "place", name: "Anna", from: 19, to: 23, text: "Anna" })]) }).state;
		expect(marks(state)).toEqual([{ from: 0, to: 14, cls: "bh-ent bh-ent-character", id: "en_p" }, { from: 19, to: 23, cls: "bh-ent bh-ent-place", id: "en_a" }]);
		expect(state.doc.toString()).toBe(TEXT);
	});

	it("follows typing before a mention, drops a mention that is edited, and ignores other transactions", () => {
		const { ext } = make();
		let state = EditorState.create({ doc: TEXT, extensions: [ext] }).update({ effects: setHighlights.of([item()]) }).state;
		const moved = state.update({ changes: { from: 0, insert: "Dr. " } }).state;
		expect(marks(moved)[0]).toMatchObject({ from: 4, to: 18 });
		expect(marks(state.update({ selection: { anchor: 3 } }).state)).toEqual(marks(state));
		state = state.update({ changes: { from: 2, to: 3, insert: "X" } }).state;
		expect(marks(state)).toEqual([]);
		const gone = EditorState.create({ doc: TEXT, extensions: [ext] }).update({ effects: setHighlights.of([item()]) }).state.update({ changes: { from: 0, to: 14 } }).state;
		expect(marks(gone)).toEqual([]);
	});

	it("ignores effects that are not about highlights", () => {
		const { ext } = make();
		const unrelated = StateEffect.define<number>();
		let state = EditorState.create({ doc: TEXT, extensions: [ext] }).update({ effects: setHighlights.of([item()]) }).state;
		state = state.update({ effects: unrelated.of(1), changes: { from: 0, insert: "X" } }).state;
		expect(marks(state)[0]).toMatchObject({ from: 1, to: 15 });
	});

	it("tells the plugin which entity was tapped, without stopping the editor handling the tap", () => {
		const { ext, onSelect } = make();
		const parent = document.body.appendChild(document.createElement("div"));
		const view = new EditorView({ parent, doc: TEXT, extensions: [ext] });
		view.dispatch({ effects: setHighlights.of([item()]) });
		const el = view.dom.querySelector("[data-bh-entity]") as HTMLElement;
		expect(el.getAttribute("aria-label")).toBe("Philip Marlowe (character)");
		const click = new MouseEvent("click", { bubbles: true, cancelable: true });
		el.dispatchEvent(click);
		expect(onSelect).toHaveBeenCalledWith("en_p");
		expect(click.defaultPrevented).toBe(false);
		onSelect.mockClear();
		view.contentDOM.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(onSelect).not.toHaveBeenCalled();
		view.destroy();
	});
});
