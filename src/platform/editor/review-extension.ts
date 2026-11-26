import { RangeSet, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import type { InlineEdit } from "../../core/review";

/** Replace the set of suggested changes shown in this editor. Dispatched by the review manager, never by typing. */
export const setReviewEdits = StateEffect.define<InlineEdit[]>();

export type DecideHandler = (edit: InlineEdit, decision: "accepted" | "rejected") => void;

/** The suggested replacement, drawn after the struck-through original with accept and reject buttons. */
class SuggestionWidget extends WidgetType {
	constructor(private readonly edit: InlineEdit, private readonly decide: DecideHandler) {
		super();
	}

	eq(other: SuggestionWidget): boolean {
		return other.edit.proposalId === this.edit.proposalId && other.edit.editId === this.edit.editId && other.edit.replacement === this.edit.replacement && other.edit.decision === this.edit.decision;
	}

	toDOM(): HTMLElement {
		const wrap = createSpan({ cls: "bh-suggestion" });
		wrap.createEl("ins", { cls: "bh-ins", text: this.edit.replacement === "" ? "(remove)" : this.edit.replacement });
		const add = (label: string, aria: string, decision: "accepted" | "rejected") => {
			const b = wrap.createEl("button", { cls: "bh-suggestion-button", text: label, attr: { "aria-label": aria } });
			// mousedown would move the caret into the widget and steal focus from the editor; keep the author's place.
			b.addEventListener("mousedown", (e) => e.preventDefault());
			b.addEventListener("click", (e) => {
				e.preventDefault();
				this.decide(this.edit, decision);
			});
		};
		add("Accept", `Accept the change: ${this.edit.original} to ${this.edit.replacement}`, "accepted");
		add("Reject", `Reject the change: ${this.edit.original} to ${this.edit.replacement}`, "rejected");
		return wrap;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

interface ReviewState {
	edits: InlineEdit[];
	decorations: DecorationSet;
}

function build(edits: readonly InlineEdit[], decide: DecideHandler): DecorationSet {
	const ranges = edits.flatMap((e) => [
		...(e.from < e.to ? [Decoration.mark({ class: "bh-del", attributes: { "data-bh-edit": e.editId } }).range(e.from, e.to)] : []),
		Decoration.widget({ widget: new SuggestionWidget(e, decide), side: 1 }).range(e.to),
	]);
	return RangeSet.of(ranges, true);
}

/**
 * Shows suggested changes in the real Markdown editor without touching the text: the original stays in the document,
 * struck through, with the suggestion beside it. If the author types inside a suggested range, that suggestion is dropped
 * from the editor (the panel still lists it) rather than being shown against text that no longer matches.
 */
export function reviewExtension(decide: DecideHandler): Extension {
	const field = StateField.define<ReviewState>({
		create: () => ({ edits: [], decorations: Decoration.none }),
		update(value, tr) {
			let edits = value.edits;
			for (const effect of tr.effects) if (effect.is(setReviewEdits)) edits = effect.value;
			if (tr.docChanged && edits === value.edits) {
				edits = edits.flatMap((e) => {
					const from = tr.changes.mapPos(e.from, 1);
					const to = tr.changes.mapPos(e.to, -1);
					const intact = to - from === e.to - e.from && tr.newDoc.sliceString(from, to) === e.original;
					return intact ? [{ ...e, from, to }] : [];
				});
			}
			if (edits === value.edits && !tr.docChanged) return value;
			return { edits, decorations: build(edits, decide) };
		},
		provide: (f) => EditorView.decorations.from(f, (v) => v.decorations),
	});
	return [field];
}
