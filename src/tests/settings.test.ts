import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "../settings/defaults";

describe("normalizeSettings", () => {
	it("returns defaults for missing or non-object data", () => {
		expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings("x")).toEqual(DEFAULT_SETTINGS);
	});

	it("keeps a valid saved level and ignores unknown ones", () => {
		expect(normalizeSettings({ logLevel: "debug" }).logLevel).toBe("debug");
		expect(normalizeSettings({ logLevel: "loud" }).logLevel).toBe("error");
	});
});
