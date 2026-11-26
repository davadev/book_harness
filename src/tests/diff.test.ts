import { describe, expect, it } from "vitest";
import { applyHunks, diffText } from "../core/diff";

describe("diffText", () => {
	it("returns nothing for equal text", () => {
		expect(diffText("same", "same")).toEqual([]);
		expect(diffText("", "")).toEqual([]);
	});

	it("finds the smallest word-level replacements with exact offsets", () => {
		const a = "The captian walked to the harbour.";
		const b = "The captain walked to the harbor.";
		const hunks = diffText(a, b);
		expect(hunks).toEqual([{ from: 4, to: 11, original: "captian", replacement: "captain" }, { from: 26, to: 33, original: "harbour", replacement: "harbor" }]);
		expect(applyHunks(a, hunks)).toBe(b);
	});

	it("handles insertions, deletions and replacements at the start, middle and end", () => {
		const cases: Array<[string, string]> = [
			["", "new"],
			["gone", ""],
			["a b c", "x a b c"],
			["a b c", "a b c y"],
			["a b c", "a c"],
			["a b c", "a x y c"],
			["one two three", "three two one"],
			["Hello, world!", "Hello world"],
			["Příliš žluťoučký kůň", "Příliš žlutoučký kůň úpěl"],
			["x", "y"],
		];
		for (const [a, b] of cases) expect(applyHunks(a, diffText(a, b))).toBe(b);
	});

	it("never touches text outside the changed words", () => {
		const a = "  Leading   spaces stay.\n\nSecond [[Link]] paragraph.  ";
		const b = "  Leading   spaces stay.\n\nSecond [[Link]] paragraphs.  ";
		const hunks = diffText(a, b);
		expect(hunks).toHaveLength(1);
		expect(hunks[0]).toMatchObject({ original: "paragraph", replacement: "paragraphs" });
	});

	it("round-trips on random edits (property test, seeded)", () => {
		let seed = 12345;
		const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
		const words = ["the", "old", "captain", "slept", "—", "harbour,", "Příliš", "ß", "x"];
		for (let run = 0; run < 200; run++) {
			const make = () => Array.from({ length: Math.floor(rnd() * 12) }, () => words[Math.floor(rnd() * words.length)]).join(rnd() < 0.5 ? " " : "  ");
			const a = make();
			const b = rnd() < 0.5 ? make() : a.split(" ").filter(() => rnd() < 0.8).join(" ");
			expect(applyHunks(a, diffText(a, b))).toBe(b);
		}
	});
});
