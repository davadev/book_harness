/**
 * Level-gated console logging. Obsidian asks plugins not to log during normal operation, so
 * everything except errors is off unless the user raises the level in settings.
 */
export type LogLevel = "error" | "warn" | "info" | "debug";

const RANK: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };
const PREFIX = "[Book Harness]";

let current: LogLevel = "error";

export function setLogLevel(level: LogLevel): void {
	current = level;
}

export function logDebug(...args: unknown[]): void {
	if (RANK.debug <= RANK[current]) console.debug(PREFIX, ...args);
}

export function logWarn(...args: unknown[]): void {
	if (RANK.warn <= RANK[current]) console.warn(PREFIX, ...args);
}

/** Errors always go out: a failure the user has to report is worth a console line. */
export function logError(...args: unknown[]): void {
	console.error(PREFIX, ...args);
}
