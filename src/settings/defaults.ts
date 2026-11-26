import type { DeviceAiSettings } from "../core/ai/connection";
import type { LogLevel } from "../logger";

/**
 * `logLevel` is shared and synced with the plugin's data. `device` belongs to this device only (a phone reaches the model
 * server by a different address than the desktop) and is stored in device-local storage, never in synced data.
 */
export interface BookHarnessSettings {
	logLevel: LogLevel;
	/** Which recognized mentions are highlighted in the editor. Off by switch or per kind; the text is never changed. */
	highlight: { enabled: boolean; character: boolean; place: boolean; object: boolean; other: boolean };
	device: DeviceAiSettings;
}

export const DEFAULT_SETTINGS: BookHarnessSettings = {
	logLevel: "error",
	highlight: { enabled: true, character: true, place: true, object: true, other: true },
	device: { endpoint: "", generationModel: "", embeddingModel: "" },
};

const LEVELS: readonly LogLevel[] = ["error", "warn", "info", "debug"];
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Merge saved data over the defaults, ignoring unknown or mistyped values (saved files can be hand-edited or newer). */
export function normalizeSettings(shared: unknown, device: unknown): BookHarnessSettings {
	const o = shared && typeof shared === "object" ? (shared as Record<string, unknown>) : {};
	const d = device && typeof device === "object" ? (device as Record<string, unknown>) : {};
	const h = o.highlight && typeof o.highlight === "object" ? (o.highlight as Record<string, unknown>) : {};
	const on = (k: keyof BookHarnessSettings["highlight"]): boolean => (typeof h[k] === "boolean" ? h[k] : DEFAULT_SETTINGS.highlight[k]);
	return {
		highlight: { enabled: on("enabled"), character: on("character"), place: on("place"), object: on("object"), other: on("other") },
		logLevel: LEVELS.find((l) => l === o.logLevel) ?? DEFAULT_SETTINGS.logLevel,
		device: { endpoint: text(d.endpoint), generationModel: text(d.generationModel), embeddingModel: text(d.embeddingModel) },
	};
}
