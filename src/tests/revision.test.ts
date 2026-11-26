import { describe, expect, it } from "vitest";
import { bodyOf, fingerprint, normalizeBody, revisionOf } from "../core/revision";
import { countWords } from "../core/words";

describe("revision", () => {
	it("is a stable sha256 of the body, identical for the same text", () => {
		expect(revisionOf("Hello.\n")).toMatch(/^sha256:[0-9a-f]{64}$/);
		expect(revisionOf("Hello.\n")).toBe(revisionOf("Hello.\n"));
	});

	it("matches a published SHA-256 test vector", () => {
		expect(revisionOf("abc")).toBe("sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
	});

	it("ignores properties and line-ending style but notices any prose change", () => {
		const a = "---\ntitle: X\n---\nOne.\nTwo.\n";
		expect(revisionOf(a)).toBe(revisionOf("---\ntitle: Y\ntags: [z]\n---\nOne.\nTwo.\n"));
		expect(revisionOf(a)).toBe(revisionOf("---\r\ntitle: X\r\n---\r\nOne.\r\nTwo.\r\n"));
		expect(revisionOf(a)).toBe(revisionOf("One.\nTwo.\n"));
		expect(revisionOf(a)).not.toBe(revisionOf("One.\nTwo. \n"));
		expect(revisionOf(a)).not.toBe(revisionOf("One.\nTwo!\n"));
	});

	it("hashes non-ASCII text by its UTF-8 bytes", () => {
		expect(revisionOf("Příliš žluťoučký kůň")).not.toBe(revisionOf("Prilis zlutoucky kun"));
		expect(normalizeBody("---\na: 1\n---\nx\r\ny")).toBe("x\ny");
		expect(bodyOf("no properties")).toBe("no properties");
	});

	it("fingerprints are independent of key order and sensitive to every part", () => {
		const a = fingerprint({ task: "t", version: 1, source: "r" });
		expect(a).toBe(fingerprint({ source: "r", version: 1, task: "t" }));
		expect(a).not.toBe(fingerprint({ task: "t", version: 2, source: "r" }));
		expect(a).not.toBe(fingerprint({ task: "t", version: 1, source: "r2" }));
		expect(a).toMatch(/^fp:[0-9a-f]{32}$/);
	});
});

describe("countWords", () => {
	it("counts words across the three V1 languages, hyphenated words and contractions as one", () => {
		expect(countWords("The old captain didn't sleep.")).toBe(5);
		expect(countWords("Příliš žluťoučký kůň úpěl ďábelské ódy.")).toBe(6);
		expect(countWords("Größe, Straße, Äpfel – Übung.")).toBe(4);
		expect(countWords("a well-known 3.14 value")).toBe(5);
		expect(countWords("")).toBe(0);
		expect(countWords("... --- !!!")).toBe(0);
	});

	it("does not count properties, code, comments or hidden notes", () => {
		expect(countWords("---\ntitle: Many words in the title\n---\nOne two.\n```js\nlots of code here\n```\n<!-- hidden note -->\n%%private%% three")).toBe(3);
		expect(countWords("~~~\nfenced\n~~~ visible")).toBe(1);
	});
});
