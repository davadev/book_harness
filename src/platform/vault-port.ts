import { MarkdownView, TFile, normalizePath, type App } from "obsidian";
import type { RawVaultPort } from "../core/ports";

export class ObsidianVaultPort implements RawVaultPort {
	constructor(private readonly app: App) {}

	exists(path: string): boolean {
		return this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null;
	}

	async read(path: string): Promise<string> {
		return this.app.vault.read(this.file(path));
	}

	async create(path: string, text: string): Promise<void> {
		const np = normalizePath(path);
		const slash = np.lastIndexOf("/");
		const parent = slash < 0 ? "" : np.slice(0, slash);
		if (parent !== "" && !this.exists(parent)) await this.app.vault.createFolder(parent).catch(() => undefined);
		await this.app.vault.create(np, text);
	}

	async replaceIfUnchanged(path: string, expected: string, next: string): Promise<boolean> {
		let replaced = false;
		await this.app.vault.process(this.file(path), (current) => {
			if (current !== expected) return current;
			replaced = true;
			return next;
		});
		return replaced;
	}

	/**
	 * Apply an accepted change. If the note is open in an editor the edit goes through the editor as one change confined to
	 * the differing middle part, so the author's cursor, scroll and undo history stay intact; otherwise the file is replaced
	 * atomically. Either way nothing is written unless the text is still exactly what the proposal was checked against.
	 */
	async writeAuthorized(path: string, expected: string, next: string): Promise<boolean> {
		const editor = this.app.workspace
			.getLeavesOfType("markdown")
			.map((l) => l.view)
			.find((v): v is MarkdownView => v instanceof MarkdownView && v.file?.path === normalizePath(path))?.editor;
		if (!editor) return this.replaceIfUnchanged(path, expected, next);
		if (editor.getValue() !== expected) return false;
		let prefix = 0;
		while (prefix < expected.length && prefix < next.length && expected[prefix] === next[prefix]) prefix++;
		let suffix = 0;
		while (suffix < expected.length - prefix && suffix < next.length - prefix && expected[expected.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;
		editor.replaceRange(next.slice(prefix, next.length - suffix), editor.offsetToPos(prefix), editor.offsetToPos(expected.length - suffix));
		return true;
	}

	markdownPaths(): string[] {
		return this.app.vault.getMarkdownFiles().map((f) => f.path);
	}

	private file(path: string): TFile {
		const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
		if (!(f instanceof TFile)) throw new Error(`File not found: ${path}`);
		return f;
	}
}
