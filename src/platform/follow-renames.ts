import type { TAbstractFile, App } from "obsidian";
import { listBooks } from "../core/books";
import { followRename } from "../core/chapters";
import { logWarn } from "../logger";
import { createGuardedVault } from "./guarded-vault";

/** When the author renames or moves a chapter's note in Obsidian, the managed chapter record follows. */
export async function onVaultRename(app: App, file: TAbstractFile, oldPath: string): Promise<void> {
	try {
		const vault = createGuardedVault(app);
		const { books } = await listBooks(vault);
		await followRename(vault, books, oldPath, file.path);
	} catch (e) {
		logWarn("could not follow a rename:", e);
	}
}
