import { normalizePath, type App, type PluginManifest } from "obsidian";
import type { IndexStorePort } from "../core/embeddings";

/**
 * Derived data (meaning vectors) lives in this plugin's own folder on this device: not in the book, not synced as notes,
 * and always safe to delete (it is rebuilt on request). The only code besides the vault port that writes files.
 */
export function createIndexStore(app: App, manifest: PluginManifest): IndexStorePort {
	const dir = normalizePath(`${manifest.dir ?? `${app.vault.configDir}/plugins/${manifest.id}`}/indexes`);
	const file = (key: string) => normalizePath(`${dir}/${key.replace(/[^A-Za-z0-9_.-]/g, "_")}`);
	return {
		async read(key) {
			const path = file(key);
			return (await app.vault.adapter.exists(path)) ? app.vault.adapter.readBinary(path) : null;
		},
		async write(key, data) {
			if (!(await app.vault.adapter.exists(dir))) await app.vault.adapter.mkdir(dir);
			await app.vault.adapter.writeBinary(file(key), data);
		},
	};
}
