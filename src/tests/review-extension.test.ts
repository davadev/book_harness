// @vitest-environment happy-dom
import { EditorState, StateEffect, type Extension } from "@codemirror/state";
import { EditorView, type DecorationSet } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import type { InlineEdit } from "../core/review";
import { reviewExtension, setReviewEdits } from "../platform/editor/review-extension";
import { installObsidianDom } from "./__mocks__/obsidianDom";

installObsidianDom();

const TEXT = "The captian walked home.";
const edit = (over: Partial<InlineEdit> = {}): InlineEdit => ({ proposalId: "pr_a", editId: "e1", from: 4, to: 11, original: "captian", replacement: "captain", decision: "pending", ...over });

function stateWith(ext: Extension, doc = TEXT) {
	return EditorState.create({ doc, extensions: [ext] });
}

function decorationsOf(state: EditorState): Array<{ from: number; to: number; cls: string | null; widget: boolean }> {
	const out: Array<{ from: number; to: number; cls: string | null; widget: boolean }> = [];
	for (const source of state.facet(EditorView.decorations)) {
		const set = (typeof source === "function" ? source({} as EditorView) : source) as DecorationSet;
		set.between(0, state.doc.length, (from, to, deco) => {
			const spec = deco.spec as { class?: string; widget?: unknown };
			out.push({ from, to, cls: spec.class ?? null, widget: spec.widget !== undefined });
		});
	}
	return out;
}

describe("review extension state", () => {
	it("shows nothing until suggestions are set, then marks the original and adds the suggestion after it", () => {
		const ext = reviewExtension(() => undefined);
		let state = stateWith(ext);
		expect(decorationsOf(state)).toEqual([]);
		state = state.update({ effects: setReviewEdits.of([edit()]) }).state;
		expect(decorationsOf(state)).toEqual([
			{ from: 4, to: 11, cls: "bh-del", widget: false },
			{ from: 11, to: 11, cls: null, widget: true },
		]);
		expect(state.doc.toString()).toBe(TEXT);
	});

	it("draws a pure insertion as the suggestion alone", () => {
		const state = stateWith(reviewExtension(() => undefined)).update({ effects: setReviewEdits.of([edit({ from: 4, to: 4, original: "" })]) }).state;
		expect(decorationsOf(state)).toEqual([{ from: 4, to: 4, cls: null, widget: true }]);
	});

	it("follows the suggestion when text is typed before it", () => {
		let state = stateWith(reviewExtension(() => undefined)).update({ effects: setReviewEdits.of([edit()]) }).state;
		state = state.update({ changes: { from: 0, insert: "Yesterday " } }).state;
		expect(decorationsOf(state)[0]).toMatchObject({ from: 14, to: 21 });
		expect(state.doc.sliceString(14, 21)).toBe("captian");
	});

	it("drops a suggestion when the author edits inside it, rather than showing it against changed text", () => {
		let state = stateWith(reviewExtension(() => undefined)).update({ effects: setReviewEdits.of([edit()]) }).state;
		state = state.update({ changes: { from: 6, to: 7, insert: "X" } }).state;
		expect(decorationsOf(state)).toEqual([]);
		let deleted = stateWith(reviewExtension(() => undefined)).update({ effects: setReviewEdits.of([edit()]) }).state;
		deleted = deleted.update({ changes: { from: 4, to: 11 } }).state;
		expect(decorationsOf(deleted)).toEqual([]);
	});

	it("leaves decorations alone for transactions that change neither text nor suggestions", () => {
		const base = stateWith(reviewExtension(() => undefined)).update({ effects: setReviewEdits.of([edit()]) }).state;
		const after = base.update({ selection: { anchor: 2 } }).state;
		expect(decorationsOf(after)).toEqual(decorationsOf(base));
	});

	it("ignores effects that are not about suggestions", () => {
		const unrelated = StateEffect.define<number>();
		let state = stateWith(reviewExtension(() => undefined)).update({ effects: setReviewEdits.of([edit()]) }).state;
		state = state.update({ effects: unrelated.of(1), changes: { from: 0, insert: "X" } }).state;
		expect(decorationsOf(state)[0]).toMatchObject({ from: 5, to: 12 });
	});

	it("replaces the whole set when told to", () => {
		let state = stateWith(reviewExtension(() => undefined)).update({ effects: setReviewEdits.of([edit()]) }).state;
		state = state.update({ effects: setReviewEdits.of([]) }).state;
		expect(decorationsOf(state)).toEqual([]);
	});
});

describe("suggestion widget", () => {
	function widgetDom(e: InlineEdit, decide = vi.fn()) {
		const state = stateWith(reviewExtension(decide)).update({ effects: setReviewEdits.of([e]) }).state;
		let dom: HTMLElement | null = null;
		let widget: { eq: (o: unknown) => boolean; ignoreEvent: () => boolean } | null = null;
		for (const source of state.facet(EditorView.decorations)) {
			(source as DecorationSet).between(0, state.doc.length, (_f, _t, deco) => {
				const w = (deco.spec as { widget?: { toDOM: (v: unknown) => HTMLElement } & typeof widget }).widget;
				if (w) {
					dom = w.toDOM({ dom: document.createElement("div") });
					widget = w as never;
				}
			});
		}
		return { dom: dom as unknown as HTMLElement, widget: widget as unknown as { eq: (o: unknown) => boolean; ignoreEvent: () => boolean }, decide };
	}

	it("shows the suggested text with labelled Accept and Reject buttons that report the decision", () => {
		const { dom, decide } = widgetDom(edit());
		expect(dom.querySelector("ins")?.textContent).toBe("captain");
		const [accept, reject] = Array.from(dom.querySelectorAll("button"));
		expect(accept?.getAttribute("aria-label")).toBe("Accept the change: captian to captain");
		const down = new MouseEvent("mousedown", { cancelable: true });
		accept!.dispatchEvent(down);
		expect(down.defaultPrevented).toBe(true);
		accept!.click();
		expect(decide).toHaveBeenLastCalledWith(expect.objectContaining({ editId: "e1" }), "accepted");
		reject!.click();
		expect(decide).toHaveBeenLastCalledWith(expect.objectContaining({ editId: "e1" }), "rejected");
	});

	it("says what a deletion removes and compares by content", () => {
		const a = widgetDom(edit({ replacement: "" }));
		expect(a.dom.querySelector("ins")?.textContent).toBe("(remove)");
		expect(a.widget.ignoreEvent()).toBe(false);
		expect(a.widget.eq(widgetDom(edit({ replacement: "" })).widget)).toBe(true);
		expect(a.widget.eq(widgetDom(edit({ replacement: "x" })).widget)).toBe(false);
		expect(a.widget.eq(widgetDom(edit({ replacement: "", decision: "accepted" })).widget)).toBe(false);
		expect(a.widget.eq(widgetDom(edit({ replacement: "", editId: "e2" })).widget)).toBe(false);
		expect(a.widget.eq(widgetDom(edit({ replacement: "", proposalId: "pr_b" })).widget)).toBe(false);
	});
});

describe("in a real editor view", () => {
	it("mounts, shows the suggestion in the page, and keeps the document untouched", () => {
		const parent = document.body.appendChild(document.createElement("div"));
		const view = new EditorView({ parent, doc: TEXT, extensions: [reviewExtension(() => undefined)] });
		view.dispatch({ effects: setReviewEdits.of([edit()]) });
		expect(view.dom.querySelector(".bh-del")?.textContent).toBe("captian");
		expect(view.dom.querySelector(".bh-suggestion ins")?.textContent).toBe("captain");
		expect(view.state.doc.toString()).toBe(TEXT);
		view.destroy();
	});
});
