import { diffBlocks } from "./align";
import type { Block } from "./blocks";

/**
 * What an explicit "update translation" would do, worked out from three texts: the source the translation was last made
 * from, the source now, and the translation as the author has it now. Pure and deterministic: no model, nothing written.
 * Nothing the author wrote in the translation is overwritten: a paragraph they edited whose source also changed is a
 * conflict for them to decide.
 */
export interface SegmentBaseline {
	id: string;
	sourceText: string;
	/** The translation as last written by this plugin; null when there is none yet. */
	targetText: string | null;
	translatable: boolean;
}

export type Action =
	/** Keep the translation block exactly as it is now. */
	| "keep"
	/** The source paragraph changed and the translation was not touched: translate it again. */
	| "retranslate"
	/** A new source paragraph (or one whose translation is missing): translate it. */
	| "translate"
	/** A block that is not translated (code, rules, embeds): copy it from the source. */
	| "copy"
	/** A person must decide before anything is changed here. */
	| "conflict";

export interface PlanItem {
	/** Index in the current source. */
	now: number;
	/** Existing segment this continues, or null for a new one. */
	segmentId: string | null;
	action: Action;
	/** The translation text now, when there is one (kept for "keep" and shown to the author in conflicts). */
	target: string | null;
	/** Why this needs a decision. */
	reason?: string;
}

export interface RemovedItem {
	segmentId: string;
	target: string | null;
	/** True when the author had edited this translation: it is then not dropped silently. */
	edited: boolean;
}

export interface SyncPlan {
	items: PlanItem[];
	/** Segments whose source paragraph is gone. Unedited ones are dropped; edited ones are conflicts. */
	removed: RemovedItem[];
	/** Blocks the author added to the translation that match nothing in the source; always kept, after the block they followed. */
	extras: Array<{ text: string; after: string | null }>;
	counts: { keep: number; retranslate: number; translate: number; copy: number; conflict: number; dropped: number };
	/** True when the translation and its baselines already agree with the source: nothing to do. */
	upToDate: boolean;
}

type TargetState = { kind: "untouched"; text: string } | { kind: "edited"; text: string } | { kind: "deleted" } | { kind: "unclear" } | { kind: "none" };

function targetStates(baseline: readonly SegmentBaseline[], current: readonly Block[]): { states: TargetState[]; extras: Array<{ text: string; after: string | null }> } {
	const states: TargetState[] = baseline.map(() => ({ kind: "none" }));
	const withText = baseline.map((s, i) => ({ s, i })).filter((x) => x.s.targetText !== null);
	const changes = diffBlocks(withText.map((x) => x.s.targetText as string), current.map((b) => b.text));
	const extras: Array<{ text: string; after: string | null }> = [];
	const extra = (now: number) => extras.push({ text: current[now]?.text, after: now > 0 ? (current[now - 1]?.text) : null });
	const at = (k: number) => (withText[k] as { i: number }).i;
	for (const c of changes) {
		if (c.kind === "same" || c.kind === "moved") states[at(c.old)] = { kind: "untouched", text: current[c.now]?.text };
		else if (c.kind === "modified") states[at(c.old)] = { kind: "edited", text: current[c.now]?.text };
		else if (c.kind === "removed") states[at(c.old)] = { kind: "deleted" };
		else if (c.kind === "added") extra(c.now);
		else if (c.kind === "unclear" && c.old.length === c.now.length) {
			// the same number of blocks on both sides of a stretch: each is the author's rewrite of the one in the same place
			c.old.forEach((k, j) => (states[at(k)] = { kind: "edited", text: current[c.now[j]]?.text }));
		} else {
			// restructured beyond recognition: every block of theirs is kept as it is, and the paragraphs it replaced need a decision
			for (const k of Array.isArray(c.old) ? c.old : [c.old]) states[at(k)] = { kind: "unclear" };
			for (const n of Array.isArray(c.now) ? c.now : [c.now]) extra(n);
		}
	}
	return { states, extras };
}

export function planSync(baseline: readonly SegmentBaseline[], currentSource: readonly Block[], currentTarget: readonly Block[]): SyncPlan {
	const { states, extras } = targetStates(baseline, currentTarget);
	const changes = diffBlocks(baseline.map((s) => s.sourceText), currentSource.map((b) => b.text));
	const items: PlanItem[] = [];
	const removed: RemovedItem[] = [];
	const counts = { keep: 0, retranslate: 0, translate: 0, copy: 0, conflict: 0, dropped: 0 };
	const push = (item: PlanItem) => {
		items.push(item);
		counts[item.action]++;
	};
	const textOf = (s: TargetState): string | null => (s.kind === "untouched" || s.kind === "edited" ? s.text : null);
	for (const c of changes) {
		if (c.kind === "removed") {
			const st = states[c.old];
			const seg = baseline[c.old];
			if (st.kind === "edited" || st.kind === "unclear") removed.push({ segmentId: seg.id, target: textOf(st), edited: true });
			else {
				removed.push({ segmentId: seg.id, target: textOf(st), edited: false });
				counts.dropped++;
			}
			continue;
		}
		if (c.kind === "added") {
			const block = currentSource[c.now];
			push({ now: c.now, segmentId: null, action: block.translatable ? "translate" : "copy", target: null });
			continue;
		}
		if (c.kind === "split" || c.kind === "merged" || c.kind === "unclear") {
			const olds = Array.isArray(c.old) ? c.old : [c.old];
			const news = Array.isArray(c.now) ? c.now : [c.now];
			for (const n of news) push({ now: n, segmentId: null, action: (currentSource[n]).translatable ? "conflict" : "copy", target: null, reason: "The source paragraphs were split, merged or rewritten so the old translation cannot be matched with them. Decide what the translation should be." });
			for (const o of olds) {
				const edited = (baseline[o]).translatable;
				removed.push({ segmentId: (baseline[o]).id, target: textOf(states[o]), edited });
				if (!edited) counts.dropped++;
			}
			continue;
		}
		const seg = baseline[c.old];
		const st = states[c.old];
		const block = currentSource[c.now];
		const changed = c.kind === "modified";
		if (!block.translatable) {
			push({ now: c.now, segmentId: seg.id, action: changed || st.kind === "none" || st.kind === "deleted" ? "copy" : "keep", target: textOf(st) });
		} else if (st.kind === "unclear") {
			push({ now: c.now, segmentId: seg.id, action: "conflict", target: null, reason: "Your translation was rearranged so this paragraph cannot be found in it. Decide what it should say." });
		} else if (st.kind === "deleted" || st.kind === "none") {
			push({ now: c.now, segmentId: seg.id, action: "translate", target: null });
		} else if (!changed) push({ now: c.now, segmentId: seg.id, action: "keep", target: st.text });
		else if (st.kind === "edited") push({ now: c.now, segmentId: seg.id, action: "conflict", target: st.text, reason: "The source paragraph changed and you had edited this translation. Choose which to keep." });
		else push({ now: c.now, segmentId: seg.id, action: "retranslate", target: st.text });
	}
	items.sort((a, b) => a.now - b.now);
	const upToDate = items.every((i) => i.action === "keep") && removed.length === 0;
	return { items, removed, extras, counts, upToDate };
}
