import { describe, expect, it } from "vitest";
import { hashText } from "../core/segmentation";
import type { Block } from "../core/translation/blocks";
import { planSync, type SegmentBaseline } from "../core/translation/sync";

const block = (text: string, translatable = true): Block => ({ text, hash: hashText(text), translatable });
const S = ["The keeper climbed the stairs slowly, counting every step.", "Below him the sea was warm and came in from the east.", "Nobody spoke of the lamp again after that night."];
const T = ["Der Wärter stieg langsam die Treppe hinauf und zählte jede Stufe.", "Unter ihm war das Meer warm und kam von Osten herein.", "Niemand sprach nach jener Nacht wieder von der Lampe."];
const base = (): SegmentBaseline[] => S.map((s, i) => ({ id: `sg${i}`, sourceText: s, targetText: T[i] as string, translatable: true }));
const blocks = (xs: string[]) => xs.map((x) => block(x));
const actions = (p: ReturnType<typeof planSync>) => p.items.map((i) => i.action);

describe("translation sync plan", () => {
	it("does nothing when nothing changed", () => {
		const p = planSync(base(), blocks(S), blocks(T));
		expect(actions(p)).toEqual(["keep", "keep", "keep"]);
		expect(p.upToDate).toBe(true);
		expect(p.counts).toMatchObject({ keep: 3, conflict: 0 });
		expect(planSync([], [], []).upToDate).toBe(true);
	});
	it("retranslates only the paragraph whose source changed, when the translation was left alone", () => {
		const changed = [S[0] as string, (S[1] as string).replace("warm", "cold"), S[2] as string];
		const p = planSync(base(), blocks(changed), blocks(T));
		expect(actions(p)).toEqual(["keep", "retranslate", "keep"]);
		expect(p.items[1]).toMatchObject({ segmentId: "sg1", target: T[1] });
		expect(p.upToDate).toBe(false);
	});
	it("never overwrites an edited translation: source change plus manual edit is a conflict", () => {
		const changed = [S[0] as string, (S[1] as string).replace("warm", "cold"), S[2] as string];
		const edited = [T[0] as string, "Unter ihm war das Meer sehr warm und kam von Osten herein.", T[2] as string];
		const p = planSync(base(), blocks(changed), blocks(edited));
		expect(actions(p)).toEqual(["keep", "conflict", "keep"]);
		expect(p.items[1]?.target).toBe(edited[1]);
		expect(p.items[1]?.reason).toContain("you had edited");
		// an edit to a paragraph whose source did not change is simply kept
		const quiet = planSync(base(), blocks(S), blocks(edited));
		expect(actions(quiet)).toEqual(["keep", "keep", "keep"]);
		expect(quiet.items[1]?.target).toBe(edited[1]);
		expect(quiet.upToDate).toBe(true);
	});
	it("translates new paragraphs wherever they were inserted, without caring about positions", () => {
		const extra = "In the morning the harbour master wrote four lines in the log.";
		const p = planSync(base(), blocks([S[0] as string, extra, S[1] as string, S[2] as string]), blocks(T));
		expect(actions(p)).toEqual(["keep", "translate", "keep", "keep"]);
		expect(p.items[1]?.segmentId).toBeNull();
		expect(p.items[2]).toMatchObject({ segmentId: "sg1", target: T[1] });
	});
	it("drops an unedited translation whose source paragraph is gone, and refuses to drop an edited one silently", () => {
		const p = planSync(base(), blocks([S[0] as string, S[2] as string]), blocks(T));
		expect(p.removed).toEqual([{ segmentId: "sg1", target: T[1], edited: false }]);
		expect(p.counts.dropped).toBe(1);
		const edited = [T[0] as string, "Das Meer war warm.", T[2] as string];
		const q = planSync(base(), blocks([S[0] as string, S[2] as string]), blocks(edited));
		expect(q.removed).toEqual([{ segmentId: "sg1", target: "Das Meer war warm.", edited: true }]);
		expect(q.counts.dropped).toBe(0);
	});
	it("treats a moved paragraph as a move, keeping its translation", () => {
		const p = planSync(base(), blocks([S[1] as string, S[0] as string, S[2] as string]), blocks(T));
		expect(p.items.map((i) => [i.segmentId, i.action])).toEqual([["sg1", "keep"], ["sg0", "keep"], ["sg2", "keep"]]);
		expect(p.items[0]?.target).toBe(T[1]);
	});
	it("asks a person when it cannot tell what became what", () => {
		const p = planSync(base(), blocks([S[0] as string, "A completely different paragraph about other things entirely.", S[2] as string]), blocks(T));
		expect(actions(p)).toEqual(["keep", "conflict", "keep"]);
		expect(p.removed).toEqual([{ segmentId: "sg1", target: T[1], edited: true }]);
		const split = planSync(base(), blocks([S[0] as string, "Below him the sea was warm", "and came in from the east.", S[2] as string]), blocks(T));
		expect(split.counts.conflict).toBe(2); // a split is never resolved silently
		expect(split.removed).toEqual([{ segmentId: "sg1", target: T[1], edited: true }]);
	});
	it("asks a person when the translation was rearranged beyond recognition", () => {
		const p = planSync(base(), blocks(S), blocks(["Ganz anderer Text, der zu nichts passt.", "Noch etwas völlig anderes hier."]));
		expect(p.items.every((i) => i.action === "conflict" || i.action === "keep")).toBe(true);
		expect(p.extras.map((e) => e.text)).toEqual(["Ganz anderer Text, der zu nichts passt.", "Noch etwas völlig anderes hier."]);
		const merged = planSync(base(), blocks(S), blocks([`${T[0] as string} ${T[1] as string}`, T[2] as string]));
		expect(merged.items.some((i) => i.action === "conflict")).toBe(true);
	});
	it("re-translates a paragraph whose translation the author deleted, and counts blocks they added", () => {
		const p = planSync(base(), blocks(S), blocks([T[0] as string, T[2] as string, "Eine Anmerkung der Übersetzerin."]));
		expect(actions(p)).toEqual(["keep", "translate", "keep"]);
		expect(p.extras).toEqual([{ text: "Eine Anmerkung der Übersetzerin.", after: T[2] }]);
	});
	it("treats a translation the author split in two as something to decide, and keeps both halves", () => {
		const base2: SegmentBaseline[] = [{ id: "sg0", sourceText: S[0] as string, targetText: "Satz eins. Satz zwei.", translatable: true }];
		const p = planSync(base2, blocks([S[0] as string]), blocks(["Satz eins.", "Satz zwei."]));
		expect(p.items[0]?.action).toBe("conflict");
		expect(p.extras.map((e) => e.text)).toEqual(["Satz eins.", "Satz zwei."]);
	});
	it("treats two source paragraphs merged into one as something to decide", () => {
		const two: SegmentBaseline[] = [{ id: "sgA", sourceText: "The sea was warm.", targetText: "Das Meer war warm.", translatable: true }, { id: "sgB", sourceText: "It came in from the east.", targetText: "Es kam von Osten.", translatable: true }];
		const p = planSync(two, blocks(["The sea was warm. It came in from the east."]), blocks(["Das Meer war warm.", "Es kam von Osten."]));
		expect(p.items.map((i) => i.action)).toEqual(["conflict"]);
		expect(p.removed.map((r) => r.segmentId)).toEqual(["sgA", "sgB"]);
	});
	it("copies a changed or missing non-translated block, and drops one whose non-translated source is gone without asking", () => {
		const embed = (n: string) => block(`![[${n}.png]]`, false);
		const b: SegmentBaseline[] = [{ id: "sgA", sourceText: "![[a.png]]", targetText: null, translatable: false }, { id: "sgB", sourceText: "![[b.png]]", targetText: "![[b.png]]", translatable: false }, { id: "sgC", sourceText: "![[c.png]]", targetText: "![[c.png]]", translatable: false }];
		const p = planSync(b, [embed("a"), embed("b")], [embed("c")]);
		expect(p.items.map((i) => i.action)).toEqual(["copy", "copy"]);
		expect(p.removed).toEqual([{ segmentId: "sgC", target: "![[c.png]]", edited: false }]);
		const gone = planSync([{ id: "sgX", sourceText: "![[x.png]]", targetText: "![[x.png]]", translatable: false }, { id: "sgY", sourceText: S[0] as string, targetText: T[0] as string, translatable: true }], [block(S[0] as string)], [block(T[0] as string)]);
		expect(gone.removed).toEqual([{ segmentId: "sgX", target: null, edited: false }]);
	});
	it("copies blocks that are not translated and translates segments that never had a translation", () => {
		const code = block("```\nx\n```", false);
		const b: SegmentBaseline[] = [{ id: "sgA", sourceText: "![[map.png]]", targetText: "![[map.png]]", translatable: false }, { id: "sgB", sourceText: S[0] as string, targetText: null, translatable: true }];
		const p = planSync(b, [block("![[map.png]]", false), block(S[0] as string), code], [block("![[map.png]]", false)]);
		expect(actions(p)).toEqual(["keep", "translate", "copy"]);
		const changed = planSync(b, [block("![[other.png]]", false), block(S[0] as string)], [block("![[map.png]]", false)]);
		expect(changed.items[0]?.action).toBe("copy");
	});
});
