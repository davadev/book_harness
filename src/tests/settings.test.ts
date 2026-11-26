import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "../settings/defaults";

describe("normalizeSettings", () => {
	it("returns defaults for missing or non-object data", () => {
		expect(normalizeSettings(null, undefined)).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings("x", 5)).toEqual(DEFAULT_SETTINGS);
	});

	it("keeps a valid saved level and ignores unknown ones", () => {
		expect(normalizeSettings({ logLevel: "debug" }, null).logLevel).toBe("debug");
		expect(normalizeSettings({ logLevel: "loud" }, null).logLevel).toBe("error");
	});

	it("keeps highlight switches that are real booleans and falls back to on for anything else", () => {
		expect(normalizeSettings({ highlight: { enabled: false, place: false, character: "no", object: 0 } }, null).highlight).toEqual({ enabled: false, character: true, place: false, object: true, other: true });
		expect(normalizeSettings({ highlight: "x" }, null).highlight).toEqual(DEFAULT_SETTINGS.highlight);
	});

	it("reads device settings only from the device record, trimmed, and ignores mistyped values", () => {
		expect(normalizeSettings({ device: { endpoint: "http://synced" } }, { endpoint: " http://phone:11434 ", generationModel: 5, embeddingModel: "m" }).device).toEqual({ endpoint: "http://phone:11434", generationModel: "", embeddingModel: "m" });
	});
});
