import type { DeviceAiSettings } from "../core/ai/connection";
import type { LogLevel } from "../logger";

/**
 * `logLevel` is shared and synced with the plugin's data. `device` belongs to this device only (a phone reaches the model
 * server by a different address than the desktop) and is stored in device-local storage, never in synced data.
 */
export interface BookHarnessSettings {
	logLevel: LogLevel;
	device: DeviceAiSettings;
}

export const DEFAULT_SETTINGS: BookHarnessSettings = {
	logLevel: "error",
	device: { endpoint: "", generationModel: "", embeddingModel: "" },
};

const LEVELS: readonly LogLevel[] = ["error", "warn", "info", "debug"];
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Merge saved data over the defaults, ignoring unknown or mistyped values (saved files can be hand-edited or newer). */
export function normalizeSettings(shared: unknown, device: unknown): BookHarnessSettings {
	const o = shared && typeof shared === "object" ? (shared as Record<string, unknown>) : {};
	const d = device && typeof device === "object" ? (device as Record<string, unknown>) : {};
	return {
		logLevel: LEVELS.find((l) => l === o.logLevel) ?? DEFAULT_SETTINGS.logLevel,
		device: { endpoint: text(d.endpoint), generationModel: text(d.generationModel), embeddingModel: text(d.embeddingModel) },
	};
}
