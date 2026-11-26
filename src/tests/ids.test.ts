import { describe, expect, it } from "vitest";
import { isId, newId, type RandomPort } from "../core/ids";

const fixed = (bytes: number[]): RandomPort => ({ bytes: (n) => Uint8Array.from({ length: n }, (_, i) => bytes[i % bytes.length] ?? 0) });

describe("ids", () => {
	it("encodes 80 random bits as 16 base32 characters with a prefix", () => {
		expect(newId("bk", fixed([0]))).toBe("bk_aaaaaaaaaaaaaaaa");
		expect(newId("ch", fixed([255]))).toBe("ch_7777777777777777");
	});

	it("accepts only well-formed ids of the expected prefix", () => {
		const id = newId("en", fixed([1, 2, 3]));
		expect(isId(id)).toBe(true);
		expect(isId(id, "en")).toBe(true);
		expect(isId(id, "ch")).toBe(false);
		expect(isId("en_short")).toBe(false);
		expect(isId("EN_aaaaaaaaaaaaaaaa")).toBe(false);
		expect(isId(42)).toBe(false);
	});
});
