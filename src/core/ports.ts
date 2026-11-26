/** What core code needs from the vault. Platform code implements it; tests use an in-memory fake. */
export interface VaultPort {
	exists(path: string): boolean;
	read(path: string): Promise<string>;
	/** Create a new file (and parent folders). Rejects if it already exists. */
	create(path: string, text: string): Promise<void>;
	/** Replace a file only if its text is still exactly `expected`. Returns false when it changed meanwhile. */
	replaceIfUnchanged(path: string, expected: string, next: string): Promise<boolean>;
	/** Paths of all Markdown files in the vault. */
	markdownPaths(): string[];
}
