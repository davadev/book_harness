import { afterEach, describe, expect, it, vi } from "vitest";
import { logDebug, logError, logWarn, setLogLevel } from "../logger";

afterEach(() => {
	setLogLevel("error");
	vi.restoreAllMocks();
});

describe("logger", () => {
	it("logs only errors by default", () => {
		const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
		logDebug("d");
		logWarn("w");
		logError("e");
		expect(debug).not.toHaveBeenCalled();
		expect(warn).not.toHaveBeenCalled();
		expect(error).toHaveBeenCalledWith("[Book Harness]", "e");
	});

	it("logs warnings and debug when the level is raised", () => {
		const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		setLogLevel("warn");
		logWarn("w");
		logDebug("d");
		expect(warn).toHaveBeenCalledTimes(1);
		expect(debug).not.toHaveBeenCalled();
		setLogLevel("debug");
		logDebug("d");
		expect(debug).toHaveBeenCalledTimes(1);
	});
});
