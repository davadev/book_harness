import { MANAGED_FOLDER, type Book } from "../books";
import type { Chapter } from "../chapters";
import { isId, newId, type RandomPort } from "../ids";
import { ManagedNoteError, parseManagedNote, serializeManagedNote } from "../managed-note";
import type { VaultPort } from "../ports";
import { revisionOf } from "../revision";
import { splitBlocks } from "./blocks";
import { planSync, type SegmentBaseline, type SyncPlan } from "./sync";

const SCHEMA = 1;
const FENCE = /```bh-records\n([\s\S]*?)\n```/;

export const variantPath = (book: Book, language: string, chapterId: string): string => `${book.folder}/${MANAGED_FOLDER}/translations/${language}/${chapterId}.md`;
export const alignmentPath = (book: Book, language: string, chapterId: string): string => `${book.folder}/${MANAGED_FOLDER}/translations/${language}/_align/${chapterId}.md`;
export const glossaryPath = (book: Book, language: string): string => `${book.folder}/${MANAGED_FOLDER}/translations/${language}/glossary.md`;

/** A decision the author still has to make. Kept in the alignment note so it survives closing the app and syncing to another device. */
export interface ConflictRecord {
	id: string;
	kind: "edited-and-changed" | "restructured";
	/** The segment this is about, or null when the old and new source cannot be matched. */
	segmentId: string | null;
	/** Source paragraph(s) as they are now, and as the translation was last made from them. */
	sourceNow: string[];
	sourceBefore: string[];
	/** The author's translation of it, which is never overwritten. */
	target: string | null;
	reason: string;
}

export interface Alignment {
	id: string;
	/** Revision of the source text the translation was last brought up to date with. */
	sourceRevision: string;
	segments: SegmentBaseline[];
	conflicts: ConflictRecord[];
}

export interface Variant {
	chapterId: string;
	language: string;
	/** The translated chapter, readable as it is. */
	text: string;
	path: string;
}

export interface LoadedVariant {
	variant: Variant;
	alignment: Alignment;
}

const note = (book: Book, type: string, id: string, extra: Record<string, unknown>, body: string): string => serializeManagedNote({ frontmatter: { bh_schema: SCHEMA, bh_type: type, bh_id: id, bh_book: book.id, ...extra }, body });

export function renderVariant(book: Book, chapter: Chapter, language: string, id: string, sourceRevision: string, text: string): string {
	return note(book, "translation", id, { chapter: chapter.id, language, source_revision: sourceRevision }, text);
}

export function renderAlignment(book: Book, chapter: Chapter, language: string, a: Alignment): string {
	const body = `# Translation record\n\nThis note remembers which source paragraph each translated paragraph came from, so Book Harness can tell what changed. You do not need to edit it.\n\n\`\`\`bh-records\n${JSON.stringify({ sourceRevision: a.sourceRevision, segments: a.segments, conflicts: a.conflicts }, null, 1)}\n\`\`\`\n`;
	return note(book, "translation-alignment", a.id, { chapter: chapter.id, language }, body);
}

function parseAlignment(text: string, book: Book): Alignment {
	const n = parseManagedNote(text);
	if (n.frontmatter.bh_type !== "translation-alignment") throw new ManagedNoteError("This note is not a translation record.");
	if (n.frontmatter.bh_schema > SCHEMA) throw new ManagedNoteError("Written by a newer Book Harness; update the plugin.");
	if (n.frontmatter.bh_book !== book.id || !isId(n.frontmatter.bh_id, "tr")) throw new ManagedNoteError("This translation record belongs to a different book or has a bad id.");
	const m = FENCE.exec(n.body);
	if (!m) throw new ManagedNoteError("The translation record has no records block.");
	let data: Partial<Alignment> | null;
	try {
		data = JSON.parse(m[1]) as Partial<Alignment> | null;
	} catch {
		throw new ManagedNoteError("The translation record is not valid JSON.");
	}
	if (!data || typeof data.sourceRevision !== "string" || !Array.isArray(data.segments) || !Array.isArray(data.conflicts)) throw new ManagedNoteError("The translation record is malformed.");
	const segments = data.segments.filter((s): s is SegmentBaseline => !!s && typeof s.id === "string" && typeof s.sourceText === "string" && (typeof s.targetText === "string" || s.targetText === null) && typeof s.translatable === "boolean");
	const conflicts = data.conflicts.filter((c): c is ConflictRecord => !!c && typeof c.id === "string" && typeof c.reason === "string" && Array.isArray(c.sourceNow) && Array.isArray(c.sourceBefore));
	return { id: n.frontmatter.bh_id, sourceRevision: data.sourceRevision, segments, conflicts };
}

/** The translation of one chapter into one language, or null when there is none. Problems reading it are thrown, not hidden. */
export async function loadVariant(vault: VaultPort, book: Book, chapter: Chapter, language: string): Promise<LoadedVariant | null> {
	const path = variantPath(book, language, chapter.id);
	if (!vault.exists(path)) return null;
	const v = parseManagedNote(await vault.read(path));
	if (v.frontmatter.bh_type !== "translation" || v.frontmatter.bh_book !== book.id || v.frontmatter.chapter !== chapter.id || v.frontmatter.language !== language) throw new ManagedNoteError(`${path} is not the ${language} translation of ${chapter.designation}.`);
	if (v.frontmatter.bh_schema > SCHEMA) throw new ManagedNoteError("Written by a newer Book Harness; update the plugin.");
	const aPath = alignmentPath(book, language, chapter.id);
	if (!vault.exists(aPath)) throw new ManagedNoteError(`The translation record for ${chapter.designation} (${language}) is missing; the translation text is kept but cannot be updated until it is recreated.`);
	return { variant: { chapterId: chapter.id, language, text: v.body, path }, alignment: parseAlignment(await vault.read(aPath), book) };
}

/** Write the translation first, then its record: a crash between the two leaves a translation that looks edited, which is the safe reading. */
export async function saveVariant(vault: VaultPort, book: Book, chapter: Chapter, language: string, existing: LoadedVariant | null, next: { text: string; alignment: Omit<Alignment, "id"> }, random: RandomPort): Promise<void> {
	const id = existing?.alignment.id ?? newId("tr", random);
	const alignment: Alignment = { id, ...next.alignment };
	const vPath = variantPath(book, language, chapter.id);
	const aPath = alignmentPath(book, language, chapter.id);
	const text = renderVariant(book, chapter, language, id, alignment.sourceRevision, next.text);
	const record = renderAlignment(book, chapter, language, alignment);
	if (!existing) {
		await vault.create(vPath, text);
		await vault.create(aPath, record);
		return;
	}
	if (!(await vault.replaceIfUnchanged(vPath, await vault.read(vPath), text))) throw new Error("The translation changed on another device; try again.");
	if (!(await vault.replaceIfUnchanged(aPath, await vault.read(aPath), record))) throw new Error("The translation record changed on another device; try again.");
}

export type TranslationState = "no-source" | "missing" | "current" | "stale" | "conflicts" | "broken";

export interface TranslationStatus {
	language: string;
	state: TranslationState;
	/** What an update would do, when the translation exists and the source has changed. */
	plan: SyncPlan | null;
	conflicts: number;
	problem?: string;
}

/** Stale means the source text changed since the translation was last brought up to date: decided by comparing revisions, no model, no guessing. */
export function translationStatus(language: string, sourceText: string | null, loaded: LoadedVariant | null): TranslationStatus {
	if (sourceText === null) return { language, state: "no-source", plan: null, conflicts: 0 };
	if (!loaded) return { language, state: "missing", plan: null, conflicts: 0 };
	const conflicts = loaded.alignment.conflicts.length;
	if (revisionOf(sourceText) === loaded.alignment.sourceRevision) return { language, state: conflicts > 0 ? "conflicts" : "current", plan: null, conflicts };
	const plan = planSync(loaded.alignment.segments, splitBlocks(sourceText), splitBlocks(loaded.variant.text));
	return { language, state: "stale", plan, conflicts };
}
