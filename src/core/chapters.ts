import { MANAGED_FOLDER, bookForPath, type Book } from "./books";
import { isId, newId, type RandomPort } from "./ids";
import { ManagedNoteError, parseManagedNote, serializeManagedNote } from "./managed-note";
import type { VaultPort } from "./ports";

export const CHAPTER_STATUSES = ["planned", "drafting", "written", "revising", "finalized"] as const;
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];

const CHAPTER_SCHEMA = 1;
const ORDER_STEP = 1000;

/** A logical chapter slot. Identity is the id; the manuscript note it points at can change or be absent (planned). */
export interface Chapter {
	id: string;
	bookId: string;
	/** Author-chosen label, e.g. "Prologue", "Chapter 15", "Epilogue". Never derived from file names. */
	designation: string;
	/** Author-controlled sort key. Reading and export order follow it. */
	order: number;
	/** Author-controlled; never inferred from word count or AI. */
	status: ChapterStatus;
	/** Vault path of the manuscript note, or null for a planned slot with no file yet. */
	notePath: string | null;
	/** Where this chapter's own managed note lives. */
	path: string;
}

export interface ChapterProblem {
	path: string;
	reason: string;
}

export const chaptersFolder = (book: Book): string => `${book.folder}/${MANAGED_FOLDER}/chapters`;
export const chapterPath = (book: Book, id: string): string => `${chaptersFolder(book)}/${id}.md`;

export function isChapterStatus(value: unknown): value is ChapterStatus {
	return typeof value === "string" && (CHAPTER_STATUSES as readonly string[]).includes(value);
}

function serialize(c: Chapter): string {
	return serializeManagedNote({
		frontmatter: {
			bh_schema: CHAPTER_SCHEMA,
			bh_type: "chapter",
			bh_id: c.id,
			bh_book: c.bookId,
			designation: c.designation,
			order: c.order,
			status: c.status,
			note_path: c.notePath,
		},
		body: `# ${c.designation}\n\nChapter record managed by Book Harness. The manuscript note is bound by \`note_path\`; this record never contains manuscript text.\n`,
	});
}

function parse(path: string, text: string, book: Book): Chapter {
	const { frontmatter: fm } = parseManagedNote(text);
	if (fm.bh_type !== "chapter") throw new ManagedNoteError("This note is not a chapter record.");
	if (fm.bh_schema > CHAPTER_SCHEMA) throw new ManagedNoteError(`Written by a newer Book Harness (schema ${fm.bh_schema}); update the plugin.`);
	if (!isId(fm.bh_id, "ch")) throw new ManagedNoteError("Chapter id is invalid.");
	if (fm.bh_book !== book.id) throw new ManagedNoteError("Chapter belongs to a different book.");
	if (typeof fm.designation !== "string" || fm.designation.trim() === "") throw new ManagedNoteError("Chapter designation is missing.");
	if (typeof fm.order !== "number" || !Number.isFinite(fm.order)) throw new ManagedNoteError("Chapter order must be a number.");
	if (!isChapterStatus(fm.status)) throw new ManagedNoteError("Chapter status is invalid.");
	const notePath: unknown = fm.note_path ?? null;
	if (notePath !== null && (typeof notePath !== "string" || notePath === "")) throw new ManagedNoteError("Chapter note path is invalid.");
	return { id: fm.bh_id, bookId: book.id, designation: fm.designation.trim(), order: fm.order, status: fm.status, notePath, path };
}

/** Load every chapter record of a book. Invalid records are reported, never hidden. */
export async function listChapters(vault: VaultPort, book: Book): Promise<{ chapters: Chapter[]; problems: ChapterProblem[] }> {
	const prefix = `${chaptersFolder(book)}/`;
	const chapters: Chapter[] = [];
	const problems: ChapterProblem[] = [];
	for (const path of vault.markdownPaths().filter((p) => p.startsWith(prefix)).sort()) {
		try {
			chapters.push(parse(path, await vault.read(path), book));
		} catch (e) {
			problems.push({ path, reason: e instanceof ManagedNoteError ? e.message : String(e) });
		}
	}
	return { chapters, problems };
}

/** Reading order: by `order`, then designation. Equal orders are reported by `findConflicts`, never silently resolved. */
export function readingOrder(chapters: readonly Chapter[]): Chapter[] {
	return [...chapters].sort((a, b) => a.order - b.order || a.designation.localeCompare(b.designation) || a.id.localeCompare(b.id));
}

export interface ChapterConflict {
	kind: "same-order" | "same-designation" | "same-note";
	chapterIds: string[];
	detail: string;
}

/** Ambiguities the author must resolve. Nothing here is auto-fixed. */
export function findConflicts(chapters: readonly Chapter[]): ChapterConflict[] {
	const out: ChapterConflict[] = [];
	const group = <K extends string | number>(key: (c: Chapter) => K | null) => {
		const m = new Map<K, Chapter[]>();
		for (const c of chapters) {
			const k = key(c);
			if (k !== null) m.set(k, [...(m.get(k) ?? []), c]);
		}
		return [...m].filter(([, v]) => v.length > 1);
	};
	for (const [k, v] of group((c) => c.order)) out.push({ kind: "same-order", chapterIds: v.map((c) => c.id), detail: `Order ${k} is used by ${v.map((c) => c.designation).join(", ")}.` });
	for (const [k, v] of group((c) => c.designation.toLowerCase())) out.push({ kind: "same-designation", chapterIds: v.map((c) => c.id), detail: `The designation "${k}" is used more than once.` });
	for (const [k, v] of group((c) => c.notePath)) out.push({ kind: "same-note", chapterIds: v.map((c) => c.id), detail: `${k} is bound to ${v.length} chapters.` });
	return out;
}

/** Numbers missing between the lowest and highest "Chapter N" designation. Planned slots are not gaps; they are intent. */
export function findGaps(chapters: readonly Chapter[]): number[] {
	const nums = new Set<number>();
	for (const c of chapters) {
		const m = /^chapter\s+(\d+)$/i.exec(c.designation);
		if (m) nums.add(Number(m[1]));
	}
	if (nums.size === 0) return [];
	const lo = Math.min(...nums);
	const hi = Math.max(...nums);
	const gaps: number[] = [];
	for (let n = lo; n <= hi; n++) if (!nums.has(n)) gaps.push(n);
	return gaps;
}

function nextOrder(chapters: readonly Chapter[]): number {
	return chapters.length === 0 ? ORDER_STEP : Math.max(...chapters.map((c) => c.order)) + ORDER_STEP;
}

function checkDesignation(chapters: readonly Chapter[], designation: string, except?: string): string {
	const d = designation.trim();
	if (d === "") throw new Error("A chapter needs a designation such as \"Prologue\" or \"Chapter 1\".");
	const clash = chapters.find((c) => c.id !== except && c.designation.toLowerCase() === d.toLowerCase());
	if (clash) throw new Error(`"${clash.designation}" is already a chapter of this book.`);
	return d;
}

export interface NewChapter {
	designation: string;
	/** Manuscript note to bind, or omitted to plan a chapter that has no file yet. */
	notePath?: string;
	order?: number;
	status?: ChapterStatus;
}

/**
 * Promote a note to a chapter (or plan a slot). Only creates the managed chapter record; the manuscript note is
 * not opened for writing, moved or modified.
 */
export async function addChapter(vault: VaultPort, book: Book, existing: readonly Chapter[], req: NewChapter, random: RandomPort): Promise<Chapter> {
	const designation = checkDesignation(existing, req.designation);
	const notePath = req.notePath ?? null;
	if (notePath !== null) {
		if (bookForPath([book], notePath)?.id !== book.id) throw new Error("That note is not inside this book's folder.");
		if (notePath.startsWith(`${book.folder}/${MANAGED_FOLDER}/`)) throw new Error("Managed notes cannot be chapters.");
		if (!vault.exists(notePath)) throw new Error("That note does not exist.");
		const bound = existing.find((c) => c.notePath === notePath);
		if (bound) throw new Error(`That note is already the chapter "${bound.designation}".`);
	}
	const status = req.status ?? (notePath === null ? "planned" : "drafting");
	if (!isChapterStatus(status)) throw new Error("Unknown chapter status.");
	if (req.order !== undefined && !Number.isFinite(req.order)) throw new Error("Chapter order must be a number.");
	const id = newId("ch", random);
	const chapter: Chapter = { id, bookId: book.id, designation, order: req.order ?? nextOrder(existing), status, notePath, path: chapterPath(book, id) };
	await vault.create(chapter.path, serialize(chapter));
	return chapter;
}

/** Read-modify-write one chapter record, refusing if it changed under us. */
async function update(vault: VaultPort, book: Book, chapter: Chapter, change: (c: Chapter) => Chapter): Promise<Chapter> {
	const before = await vault.read(chapter.path);
	const current = parse(chapter.path, before, book);
	const next = change(current);
	if (!(await vault.replaceIfUnchanged(chapter.path, before, serialize(next)))) throw new Error("This chapter changed on another device; reload and try again.");
	return next;
}

export const setStatus = (vault: VaultPort, book: Book, chapter: Chapter, status: ChapterStatus): Promise<Chapter> => {
	if (!isChapterStatus(status)) return Promise.reject(new Error("Unknown chapter status."));
	return update(vault, book, chapter, (c) => ({ ...c, status }));
};

export const setOrder = (vault: VaultPort, book: Book, chapter: Chapter, order: number): Promise<Chapter> => {
	if (!Number.isFinite(order)) return Promise.reject(new Error("Chapter order must be a number."));
	return update(vault, book, chapter, (c) => ({ ...c, order }));
};

export async function setDesignation(vault: VaultPort, book: Book, all: readonly Chapter[], chapter: Chapter, designation: string): Promise<Chapter> {
	const d = checkDesignation(all, designation, chapter.id);
	return update(vault, book, chapter, (c) => ({ ...c, designation: d }));
}

/** Point the chapter at a different manuscript note (reassignment) or at none (demotion: the slot stays, its status is the author's to change). */
export async function bindNote(vault: VaultPort, book: Book, all: readonly Chapter[], chapter: Chapter, notePath: string | null): Promise<Chapter> {
	if (notePath !== null) {
		if (bookForPath([book], notePath)?.id !== book.id || notePath.startsWith(`${book.folder}/${MANAGED_FOLDER}/`)) throw new Error("That note cannot be a chapter of this book.");
		if (!vault.exists(notePath)) throw new Error("That note does not exist.");
		const bound = all.find((c) => c.id !== chapter.id && c.notePath === notePath);
		if (bound) throw new Error(`That note is already the chapter "${bound.designation}".`);
	}
	return update(vault, book, chapter, (c) => ({ ...c, notePath }));
}

/** After a note is renamed or moved in the vault: follow it. Only the managed record changes. */
export async function followRename(vault: VaultPort, books: readonly Book[], oldPath: string, newPath: string): Promise<void> {
	const book = bookForPath(books, oldPath);
	if (!book) return;
	const { chapters } = await listChapters(vault, book);
	const chapter = chapters.find((c) => c.notePath === oldPath);
	if (!chapter) return;
	const stillInBook = bookForPath([book], newPath)?.id === book.id && !newPath.startsWith(`${book.folder}/${MANAGED_FOLDER}/`);
	await update(vault, book, chapter, (c) => ({ ...c, notePath: stillInBook ? newPath : null }));
}
