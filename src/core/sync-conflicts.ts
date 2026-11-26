import type { Book } from "./books";

// Titles that merely contain the word ("The Conflict Within") must not match: require the markers sync tools add.
const CONFLICT_NAME = /\([^)]*\bconflict(?:ed)?\b[^)]*\)|\.sync-conflict-|conflicted copy/i;

/**
 * Notes that look like copies a sync tool made when two devices changed the same file ("name (conflicted copy ...)",
 * ".sync-conflict-..."). Best effort: it recognises common naming only. The author decides which copy to keep; nothing is merged or deleted.
 */
export function findConflictCopies(book: Book, paths: readonly string[]): string[] {
	return paths.filter((p) => p.startsWith(`${book.folder}/`) && CONFLICT_NAME.test(p.slice(p.lastIndexOf("/") + 1))).sort();
}
