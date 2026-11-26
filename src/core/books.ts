import { isId, newId, type RandomPort } from "./ids";
import { ManagedNoteError, parseManagedNote, serializeManagedNote, type ManagedNote } from "./managed-note";
import type { VaultPort } from "./ports";
import { isChapterStatus, type ChapterStatus } from "./status";

export const MANAGED_FOLDER = "_book-harness";
export const BOOK_NOTE = "book.md";
const BOOK_SCHEMA = 1;
const LANGUAGE = /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/;

export interface Book {
	id: string;
	/** Vault-relative folder, derived from where the note lives (never stored, so a copied folder stays valid). */
	folder: string;
	title: string;
	primaryLanguage: string;
	targetLanguages: string[];
	/** Completion requirements the author configured. Defaults apply when a property is absent. */
	completion: { chapterStatus: ChapterStatus };
}

export interface BookProblem {
	path: string;
	reason: string;
}

export function bookNotePath(folder: string): string {
	return `${folder}/${MANAGED_FOLDER}/${BOOK_NOTE}`;
}

export function isLanguageCode(value: unknown): value is string {
	return typeof value === "string" && LANGUAGE.test(value);
}

export const DEFAULT_COMPLETION: Book["completion"] = { chapterStatus: "finalized" };

function toNote(book: Omit<Book, "folder">): ManagedNote {
	return {
		frontmatter: {
			bh_schema: BOOK_SCHEMA,
			bh_type: "book",
			bh_id: book.id,
			bh_book: book.id,
			title: book.title,
			primary_language: book.primaryLanguage,
			target_languages: book.targetLanguages,
			completion_chapter_status: book.completion.chapterStatus,
		},
		body: `# ${book.title}\n\nBook Harness configuration. Edit the properties above; the plugin keeps everything else in this folder.\n`,
	};
}

function fromNote(folder: string, note: ManagedNote): Book {
	const fm = note.frontmatter;
	if (fm.bh_type !== "book") throw new ManagedNoteError("This note is not a book configuration.");
	if (fm.bh_schema > BOOK_SCHEMA) throw new ManagedNoteError(`Written by a newer Book Harness (schema ${fm.bh_schema}); update the plugin.`);
	if (!isId(fm.bh_id, "bk")) throw new ManagedNoteError("Book id is invalid.");
	if (typeof fm.title !== "string" || fm.title.trim() === "") throw new ManagedNoteError("Book title is missing.");
	if (!isLanguageCode(fm.primary_language)) throw new ManagedNoteError("Primary language is invalid.");
	const targets: unknown = fm.target_languages ?? [];
	if (!Array.isArray(targets) || !targets.every(isLanguageCode)) throw new ManagedNoteError("Target languages are invalid.");
	const chapterStatus: unknown = fm.completion_chapter_status ?? DEFAULT_COMPLETION.chapterStatus;
	if (!isChapterStatus(chapterStatus)) throw new ManagedNoteError("Completion chapter status is invalid.");
	return { id: fm.bh_id, folder, title: fm.title.trim(), primaryLanguage: fm.primary_language, targetLanguages: [...new Set(targets)].filter((l) => l !== fm.primary_language), completion: { chapterStatus } };
}

/** Register a folder as a book. Writes only inside the managed folder; never touches manuscript notes. */
export async function registerBook(vault: VaultPort, folder: string, title: string, primaryLanguage: string, random: RandomPort): Promise<Book> {
	const path = bookNotePath(folder);
	if (vault.exists(path)) throw new Error("This folder is already registered as a book.");
	const { books: existing } = await listBooks(vault);
	const outer = bookForPath(existing, folder);
	if (outer) throw new Error(`This folder is inside the book "${outer.title}". Books cannot be nested.`);
	const inner = existing.find((b) => b.folder.startsWith(`${folder}/`));
	if (inner) throw new Error(`This folder contains the book "${inner.title}". Books cannot be nested.`);
	const cleanTitle = title.trim();
	if (cleanTitle === "") throw new Error("A book needs a title.");
	if (!isLanguageCode(primaryLanguage)) throw new Error("Primary language must be a language code such as en, de or cs.");
	const book = { id: newId("bk", random), title: cleanTitle, primaryLanguage, targetLanguages: [] as string[], completion: { ...DEFAULT_COMPLETION } };
	await vault.create(path, serializeManagedNote(toNote(book)));
	return { ...book, folder };
}

/** Discover every book in the vault from its configuration note. Invalid notes are reported, never hidden. */
export async function listBooks(vault: VaultPort): Promise<{ books: Book[]; problems: BookProblem[] }> {
	const suffix = `/${MANAGED_FOLDER}/${BOOK_NOTE}`;
	const books: Book[] = [];
	const problems: BookProblem[] = [];
	const seen = new Map<string, string>();
	for (const path of vault.markdownPaths().filter((p) => p.endsWith(suffix)).sort()) {
		const folder = path.slice(0, -suffix.length);
		try {
			const book = fromNote(folder, parseManagedNote(await vault.read(path)));
			const first = seen.get(book.id);
			if (first !== undefined) {
				problems.push({ path, reason: `Duplicate book id, also used by ${first}. Was a book folder copied inside the vault?` });
				continue;
			}
			seen.set(book.id, path);
			books.push(book);
		} catch (e) {
			problems.push({ path, reason: e instanceof ManagedNoteError ? e.message : String(e) });
		}
	}
	return { books, problems };
}

/** The book a vault path belongs to: the deepest registered folder containing it. Books never share paths. */
export function bookForPath(books: readonly Book[], path: string): Book | undefined {
	let best: Book | undefined;
	for (const b of books) {
		if ((path === b.folder || path.startsWith(`${b.folder}/`)) && (!best || b.folder.length > best.folder.length)) best = b;
	}
	return best;
}
