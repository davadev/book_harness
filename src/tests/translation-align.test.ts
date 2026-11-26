import { describe, expect, it } from "vitest";
import { diffBlocks, similarity } from "../core/translation/align";
import { joinBlocks, splitBlocks } from "../core/translation/blocks";

const kinds = (c: ReturnType<typeof diffBlocks>) => c.map((x) => x.kind).sort();
const P1 = "The keeper climbed the stairs slowly, counting every step in the dark.";
const P2 = "Below him the sea was warm, and it came in from the east.";
const P3 = "Nobody spoke of the lamp again after that night.";
const P4 = "In the morning the harbour master wrote four lines in the log.";

describe("blocks", () => {
	it("splits a chapter at blank lines and passes structure through untouched", () => {
		const text = "---\ntitle: X\n---\n# Chapter 1\n\nA paragraph\nwith two lines.\n\n> A quote\n\n```js\ncode\n\nmore code\n```\n\n![[map.png]]\n\n| a | b |\n\n---\n\n%% note %%\n\n<div>html</div>\n\nLast one.\n";
		const blocks = splitBlocks(text);
		expect(blocks.map((b) => b.translatable)).toEqual([true, true, true, false, false, false, false, false, false, true]);
		expect(blocks[1]?.text).toBe("A paragraph\nwith two lines.");
		expect(blocks[3]?.text).toContain("more code");
		expect(blocks.map((b) => b.text)).not.toContain("title: X");
		expect(joinBlocks(blocks.slice(0, 2).map((b) => b.text))).toBe("# Chapter 1\n\nA paragraph\nwith two lines.\n");
		expect(splitBlocks("a\r\n\r\nb").map((b) => b.text)).toEqual(["a", "b"]);
		expect(splitBlocks("")).toEqual([]);
		expect(splitBlocks("~~~\nx\n~~~\nafter").map((b) => b.translatable)).toEqual([false, true]);
		expect(splitBlocks("````\n```\ninner\n```\n````").length).toBe(1);
		expect(splitBlocks("```\nopen but never closed\n").length).toBe(1);
	});
});

describe("alignment", () => {
	it("measures how alike two blocks are", () => {
		expect(similarity(P1, P1)).toBe(1);
		expect(similarity(P1, P2)).toBeLessThan(0.2);
		expect(similarity("", "")).toBe(1);
		expect(similarity("", "a")).toBe(0);
		expect(similarity("!", "?")).toBe(0);
		expect(similarity("Der Mann, die Frau", "der mann die frau")).toBe(1);
	});
	it("recognises untouched, edited, added and removed blocks by content", () => {
		const edited = P2.replace("warm", "cold");
		const c = diffBlocks([P1, P2, P3], [P1, edited, P3, P4]);
		expect(kinds(c)).toEqual(["added", "modified", "same", "same"]);
		expect(c).toContainEqual({ kind: "modified", old: 1, now: 1 });
		expect(c).toContainEqual({ kind: "added", now: 3 });
		const removed = diffBlocks([P1, P2, P3], [P1, P3]);
		expect(removed).toContainEqual({ kind: "removed", old: 1 });
		expect(diffBlocks([P1], [P1])).toEqual([{ kind: "same", old: 0, now: 0 }]);
		expect(diffBlocks([], [])).toEqual([]);
	});
	it("does not depend on position: an inserted block shifts nothing, a moved block is a move", () => {
		const inserted = diffBlocks([P1, P2], [P1, P4, P2]);
		expect(inserted).toContainEqual({ kind: "same", old: 1, now: 2 });
		expect(inserted).toContainEqual({ kind: "added", now: 1 });
		const moved = diffBlocks([P1, P2, P3, P4], [P1, P3, P4, P2]);
		expect(kinds(moved)).toEqual(["moved", "same", "same", "same"]);
		expect(moved).toContainEqual({ kind: "moved", old: 1, now: 3 });
	});
	it("recognises an exact split and an exact merge, and says when it cannot tell", () => {
		const a = "The sea was warm. It came in from the east.";
		const split = diffBlocks([P1, a, P3], [P1, "The sea was warm.", "It came in from the east.", P3]);
		expect(split).toContainEqual({ kind: "split", old: 1, now: [1, 2] });
		const merged = diffBlocks([P1, "The sea was warm.", "It came in from the east.", P3], [P1, a, P3]);
		expect(merged).toContainEqual({ kind: "merged", old: [1, 2], now: 1 });
		const unclear = diffBlocks([P1, P2, P3], [P1, "A completely different paragraph about nothing alike.", P3]);
		expect(unclear).toContainEqual({ kind: "unclear", old: [1], now: [1] });
		const several = diffBlocks([P1, P2, P3], [P4, "Totally unrelated words appear here instead."]);
		expect(several.some((x) => x.kind === "unclear")).toBe(true);
	});
	it("skips a leading new block to pair the edited one that follows it", () => {
		const c = diffBlocks([P1, P2], [P4, P2.replace("warm", "cold")]);
		expect(c).toContainEqual({ kind: "modified", old: 1, now: 1 });
		expect(c.some((x) => x.kind === "unclear")).toBe(true);
	});
	it("pairs several edited blocks in order within one stretch", () => {
		const before = [P1, P2, P3];
		const now = [P1.replace("slowly", "quietly"), P2.replace("warm", "cold"), P3.replace("lamp", "light")];
		expect(kinds(diffBlocks(before, now))).toEqual(["modified", "modified", "modified"]);
		const skewed = diffBlocks([P1, P2], [P2.replace("warm", "cold"), P1.replace("slowly", "quietly")]);
		expect(skewed.filter((x) => x.kind === "modified").length).toBeGreaterThanOrEqual(1);
		const gap = diffBlocks([P1, P2, P3], [P1, P2.replace("warm", "cold"), P4, P3]);
		expect(gap).toContainEqual({ kind: "modified", old: 1, now: 1 });
		expect(gap).toContainEqual({ kind: "added", now: 2 });
	});
});
