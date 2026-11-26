import type { LogLevel } from "../logger";

/** Device/global settings only. Book-specific configuration lives in the book's own managed notes. */
export interface BookHarnessSettings {
	logLevel: LogLevel;
}

export const DEFAULT_SETTINGS: BookHarnessSettings = {
	logLevel: "error",
};

const LEVELS: readonly LogLevel[] = ["error", "warn", "info", "debug"];

/** Merge saved data over the defaults, ignoring unknown or mistyped values (data.json can be hand-edited or newer). */
export function normalizeSettings(raw: unknown): BookHarnessSettings {
	const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
	const logLevel = LEVELS.find((l) => l === o.logLevel) ?? DEFAULT_SETTINGS.logLevel;
	return { logLevel };
}
