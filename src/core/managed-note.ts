import { parse, stringify } from "yaml";

/**
 * Managed notes are plain Markdown: YAML frontmatter (always carrying a schema version, type, id and book id)
 * plus a human-readable body. Machine records live in fenced blocks inside the body.
 */
export interface ManagedNote {
	frontmatter: Record<string, unknown> & { bh_schema: number; bh_type: string; bh_id: string };
	body: string;
}

export class ManagedNoteError extends Error {}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Parse a managed note. Throws ManagedNoteError with a plain-language reason when the text is not a valid managed note. */
export function parseManagedNote(text: string): ManagedNote {
	const m = FRONTMATTER.exec(text);
	if (!m) throw new ManagedNoteError("Missing frontmatter.");
	let data: unknown;
	try {
		data = parse(m[1]);
	} catch (e) {
		throw new ManagedNoteError(`Frontmatter is not valid YAML: ${(e as Error).message}`);
	}
	if (!data || typeof data !== "object" || Array.isArray(data)) throw new ManagedNoteError("Frontmatter must be a mapping.");
	const fm = data as Record<string, unknown>;
	if (typeof fm.bh_schema !== "number" || !Number.isInteger(fm.bh_schema) || fm.bh_schema < 1) throw new ManagedNoteError("bh_schema must be a positive integer.");
	if (typeof fm.bh_type !== "string" || fm.bh_type === "") throw new ManagedNoteError("bh_type is required.");
	if (typeof fm.bh_id !== "string" || fm.bh_id === "") throw new ManagedNoteError("bh_id is required.");
	return { frontmatter: fm as ManagedNote["frontmatter"], body: text.slice(m[0].length) };
}

/** Serialize with a stable key order (bh_* keys first, then the rest alphabetically) so diffs and sync stay quiet. */
export function serializeManagedNote(note: ManagedNote): string {
	const keys = Object.keys(note.frontmatter);
	const ordered = [...keys.filter((k) => k.startsWith("bh_")).sort(), ...keys.filter((k) => !k.startsWith("bh_")).sort()];
	const fm: Record<string, unknown> = {};
	for (const k of ordered) fm[k] = note.frontmatter[k];
	return `---\n${stringify(fm, { lineWidth: 0 }).trimEnd()}\n---\n${note.body}`;
}
