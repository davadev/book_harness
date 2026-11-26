import { TFile, normalizePath, type App } from "obsidian";
import type { VaultPort } from "../core/ports";

export class ObsidianVaultPort implements VaultPort {
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

	markdownPaths(): string[] {
		return this.app.vault.getMarkdownFiles().map((f) => f.path);
	}

	private file(path: string): TFile {
		const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
		if (!(f instanceof TFile)) throw new Error(`File not found: ${path}`);
		return f;
	}
}
