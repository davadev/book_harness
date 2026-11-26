import { MANAGED_FOLDER, type Book } from "./books";
import { activeEntities, type Entity } from "./entities";
import { ManagedNoteError, parseManagedNote, serializeManagedNote } from "./managed-note";
import type { VaultPort } from "./ports";

const OCC_SCHEMA = 1;
const FENCE = /```bh-records\n([\s\S]*?)\n```/;
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
const ANCHOR = 24;

/** A place in the text where an entity is mentioned. Never stored with offsets: it is recomputed from the current text. */
export interface Occurrence {
	entityId: string;
	from: number;
	to: number;
	text: string;
	source: "name" | "manual";
}

/** The author's corrections, identified by the words and their surroundings so they survive edits elsewhere. */
export interface Anchor {
	entityId: string;
	text: string;
	before: string;
	after: string;
}

export interface Corrections {
	removed: Anchor[];
	manual: Anchor[];
}

export const NO_CORRECTIONS: Corrections = { removed: [], manual: [] };
export const occurrencesPath = (book: Book, chapterId: string): string => `${book.folder}/${MANAGED_FOLDER}/occurrences/${chapterId}.md`;

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function anchorOf(text: string, entityId: string, from: number, to: number): Anchor {
	return { entityId, text: text.slice(from, to), before: text.slice(Math.max(0, from - ANCHOR), from), after: text.slice(to, to + ANCHOR) };
}

/** Where an anchor points in `text`: only if the same words with the same surroundings occur exactly once. */
function relocate(text: string, a: Anchor): number | null {
	const needle = a.before + a.text + a.after;
	const first = text.indexOf(needle);
	if (first < 0 || text.indexOf(needle, first + 1) >= 0) return null;
	return first + a.before.length;
}

/**
 * Mentions of the given entities by exact name or alias, whole words only, longest name first so "Philip Marlowe" is not
 * also counted as "Marlowe". Deterministic and computed from the text as it is now, so a highlight can never sit on text
 * that changed. This finds where a name occurs; it does not decide who a person is.
 */
export function findOccurrences(noteText: string, entities: readonly Entity[], corrections: Corrections = NO_CORRECTIONS): Occurrence[] {
	const bodyStart = FRONTMATTER.exec(noteText)?.[0].length ?? 0;
	const found: Occurrence[] = [];
	const taken: Array<[number, number]> = [];
	const keys = entities.flatMap((e) => [e.name, ...e.aliases].map((n) => ({ entityId: e.id, name: n }))).filter((k) => k.name.trim() !== "").sort((a, b) => b.name.length - a.name.length);
	const free = (from: number, to: number): boolean => taken.every(([f, t]) => to <= f || from >= t);
	for (const key of keys) {
		const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escape(key.name.normalize("NFC")).replace(/\s+/g, "\\s+")})(?![\\p{L}\\p{N}])`, "giu");
		for (const m of noteText.matchAll(re)) {
			const from = m.index + (m[1]).length;
			const to = from + (m[2]).length;
			if (from < bodyStart || !free(from, to)) continue;
			taken.push([from, to]);
			found.push({ entityId: key.entityId, from, to, text: noteText.slice(from, to), source: "name" });
		}
	}
	const removed = corrections.removed.map((a) => ({ a, at: relocate(noteText, a) })).filter((r) => r.at !== null);
	const kept = found.filter((o) => !removed.some((r) => r.a.entityId === o.entityId && r.at === o.from));
	for (const a of corrections.manual) {
		const at = relocate(noteText, a);
		if (at !== null && at >= bodyStart && !kept.some((o) => o.from < at + a.text.length && o.to > at)) kept.push({ entityId: a.entityId, from: at, to: at + a.text.length, text: a.text, source: "manual" });
	}
	return kept.sort((a, b) => a.from - b.from);
}

/** Entity ids a chapter's evidence supports, with merged entities replaced by the ones they were merged into. */
export function entitiesForChapter(all: readonly Entity[], evidenceIds: readonly string[]): Entity[] {
	const live = activeEntities(all);
	const resolve = (id: string): Entity | undefined => {
		let current = all.find((e) => e.id === id);
		for (let hops = 0; current?.mergedInto && hops < 20; hops++) current = all.find((e) => e.id === current?.mergedInto);
		return current && live.includes(current) ? current : undefined;
	};
	return [...new Map(evidenceIds.map(resolve).filter((e): e is Entity => e !== undefined).map((e) => [e.id, e])).values()];
}

export async function loadCorrections(vault: VaultPort, book: Book, chapterId: string): Promise<Corrections> {
	const path = occurrencesPath(book, chapterId);
	if (!vault.exists(path)) return NO_CORRECTIONS;
	const note = parseManagedNote(await vault.read(path));
	if (note.frontmatter.bh_type !== "occurrences") throw new ManagedNoteError("This note is not occurrence corrections.");
	if (note.frontmatter.bh_schema > OCC_SCHEMA) throw new ManagedNoteError("Written by a newer Book Harness; update the plugin.");
	const m = FENCE.exec(note.body);
	if (!m) throw new ManagedNoteError("Occurrence corrections have no records block.");
	let data: unknown;
	try {
		data = JSON.parse(m[1]);
	} catch {
		throw new ManagedNoteError("Occurrence corrections are not valid JSON.");
	}
	const d = (data && typeof data === "object" ? data : {}) as Partial<Corrections>;
	const valid = (list: unknown): Anchor[] => (Array.isArray(list) ? list.filter((a: unknown): a is Anchor => !!a && typeof a === "object" && typeof (a as Anchor).entityId === "string" && typeof (a as Anchor).text === "string" && typeof (a as Anchor).before === "string" && typeof (a as Anchor).after === "string") : []);
	return { removed: valid(d.removed), manual: valid(d.manual) };
}

async function saveCorrections(vault: VaultPort, book: Book, chapterId: string, c: Corrections): Promise<void> {
	const path = occurrencesPath(book, chapterId);
	const text = serializeManagedNote({
		frontmatter: { bh_schema: OCC_SCHEMA, bh_type: "occurrences", bh_id: chapterId, bh_book: book.id },
		body: `# Highlight corrections\n\nYour corrections to the automatic highlights of one chapter: mentions you removed, and mentions you linked by hand. The highlights themselves are recomputed from the text.\n\n\`\`\`bh-records\n${JSON.stringify(c, null, 1)}\n\`\`\`\n`,
	});
	if (!vault.exists(path)) return vault.create(path, text);
	const before = await vault.read(path);
	if (!(await vault.replaceIfUnchanged(path, before, text))) throw new Error("Highlight corrections changed on another device; try again.");
}

const same = (a: Anchor, b: Anchor): boolean => a.entityId === b.entityId && a.text === b.text && a.before === b.before && a.after === b.after;

/** The author says this highlight is wrong. Remembered by its words and surroundings. */
export async function removeOccurrence(vault: VaultPort, book: Book, chapterId: string, noteText: string, o: Occurrence): Promise<void> {
	const c = await loadCorrections(vault, book, chapterId);
	const a = anchorOf(noteText, o.entityId, o.from, o.to);
	const next: Corrections = o.source === "manual" ? { ...c, manual: c.manual.filter((m) => !same(m, a)) } : { ...c, removed: c.removed.some((r) => same(r, a)) ? c.removed : [...c.removed, a] };
	await saveCorrections(vault, book, chapterId, next);
}

/** The author links a stretch of text to an entity. Nothing is written into the chapter. */
export async function linkOccurrence(vault: VaultPort, book: Book, chapterId: string, noteText: string, entityId: string, from: number, to: number): Promise<void> {
	if (from >= to || to > noteText.length) throw new Error("Select the words to link first.");
	const c = await loadCorrections(vault, book, chapterId);
	const a = anchorOf(noteText, entityId, from, to);
	await saveCorrections(vault, book, chapterId, { ...c, manual: c.manual.some((m) => same(m, a)) ? c.manual : [...c.manual, a], removed: c.removed.filter((r) => !same(r, a)) });
}
