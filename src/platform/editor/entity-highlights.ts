import { RangeSet, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

/** One mention to draw: where it is now, which entity it is, and how to label it. */
export interface HighlightItem {
	entityId: string;
	type: string;
	name: string;
	from: number;
	to: number;
	text: string;
}

export const setHighlights = StateEffect.define<HighlightItem[]>();

interface State {
	items: HighlightItem[];
	decorations: DecorationSet;
}

function build(items: readonly HighlightItem[]): DecorationSet {
	return RangeSet.of(
		items.map((i) => Decoration.mark({ class: `bh-ent bh-ent-${i.type}`, attributes: { "data-bh-entity": i.entityId, "aria-label": `${i.name} (${i.type})` } }).range(i.from, i.to)),
		true,
	);
}

/**
 * Marks recognized mentions in the real Markdown editor without changing the text. A tap or click on one tells the
 * plugin which entity it is, so its history can be shown beside the chapter. If the author edits inside a mention, that
 * highlight is dropped instead of being left on words that are no longer the same.
 */
export function highlightExtension(onSelect: (entityId: string) => void): Extension {
	const field = StateField.define<State>({
		create: () => ({ items: [], decorations: Decoration.none }),
		update(value, tr) {
			let items = value.items;
			for (const effect of tr.effects) if (effect.is(setHighlights)) items = effect.value;
			if (tr.docChanged && items === value.items) {
				items = items.flatMap((i) => {
					const from = tr.changes.mapPos(i.from, 1);
					const to = tr.changes.mapPos(i.to, -1);
					return to - from === i.to - i.from && tr.newDoc.sliceString(from, to) === i.text ? [{ ...i, from, to }] : [];
				});
			}
			if (items === value.items && !tr.docChanged) return value;
			return { items, decorations: build(items) };
		},
		provide: (f) => EditorView.decorations.from(f, (v) => v.decorations),
	});
	const clicks = EditorView.domEventHandlers({
		click(event) {
			const hit = (event.target as HTMLElement | null)?.closest?.("[data-bh-entity]");
			const id = hit?.getAttribute("data-bh-entity");
			if (id) onSelect(id);
			return false;
		},
	});
	return [field, clicks];
}
