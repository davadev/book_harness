import { MANAGED_FOLDER, bookForPath, listBooks, type Book } from "./books";
import type { RawVaultPort, VaultPort } from "./ports";

declare const BRAND: unique symbol;

/**
 * Permission to change one manuscript note for one accepted proposal. It can only be created by `mintWriteCapability`,
 * which an architecture test confines to the proposal-apply code; nothing else can obtain one.
 */
export interface ManuscriptWriteCapability {
	readonly [BRAND]: true;
	readonly proposalId: string;
	readonly path: string;
}

export function mintWriteCapability(proposalId: string, path: string): ManuscriptWriteCapability {
	return { proposalId, path } as ManuscriptWriteCapability;
}

export type PathClass = "managed" | "manuscript" | "outside";

export class ManuscriptWriteRefused extends Error {
	constructor(readonly path: string) {
		super(`Book Harness may not change manuscript text on its own (${path}). Propose the change for review instead.`);
	}
}

/**
 * `managed`: inside a registered book's managed folder. `manuscript`: anywhere else inside a registered book.
 * `outside`: not part of any registered book.
 */
export function classifyPath(books: readonly Book[], path: string): PathClass {
	const book = bookForPath(books, path);
	if (!book) return "outside";
	return path.startsWith(`${book.folder}/${MANAGED_FOLDER}/`) ? "managed" : "manuscript";
}

/**
 * The only VaultPort that application code may be given. It refuses every write to a manuscript path.
 * Proposal-based edits (Phase 5) will add a capability-carrying path here; until then nothing can write prose.
 */
export class GuardedVault implements VaultPort {
	constructor(private readonly inner: RawVaultPort) {}

	exists(path: string): boolean {
		return this.inner.exists(path);
	}

	read(path: string): Promise<string> {
		return this.inner.read(path);
	}

	markdownPaths(): string[] {
		return this.inner.markdownPaths();
	}

	async create(path: string, text: string): Promise<void> {
		await this.assertWritable(path);
		await this.inner.create(path, text);
	}

	async replaceIfUnchanged(path: string, expected: string, next: string): Promise<boolean> {
		await this.assertWritable(path);
		return this.inner.replaceIfUnchanged(path, expected, next);
	}

	/** The only way to change manuscript text: needs a capability minted for exactly this note by an accepted proposal. */
	async writeManuscript(cap: ManuscriptWriteCapability, path: string, expected: string, next: string): Promise<boolean> {
		if (cap.path !== path) throw new ManuscriptWriteRefused(path);
		return this.inner.writeAuthorized(path, expected, next);
	}

	private async assertWritable(path: string): Promise<void> {
		const { books } = await listBooks(this.inner);
		if (classifyPath(books, path) === "manuscript") throw new ManuscriptWriteRefused(path);
	}
}
