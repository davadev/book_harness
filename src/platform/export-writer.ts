import { normalizePath, type App } from "obsidian";

/**
 * Export files are derived output, not manuscript and not managed state: they are written to an `exports` folder inside
 * the book's folder, where the author (or a sync plugin) can find them. Nothing here touches a chapter note.
 */
export async function writeExport(app: App, folder: string, fileName: string, bytes: Uint8Array): Promise<string> {
	const dir = normalizePath(`${folder}/exports`);
	if (!(await app.vault.adapter.exists(dir))) await app.vault.adapter.mkdir(dir);
	const path = normalizePath(`${dir}/${fileName}`);
	await app.vault.adapter.writeBinary(path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
	return path;
}

/** A file name safe on every platform and sync service, from the book title. */
export function exportFileName(title: string, stamp: string, draft: boolean): string {
	const slug = title.normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "book";
	return `${slug}${draft ? "-draft" : ""}-${stamp.slice(0, 10)}.epub`;
}
