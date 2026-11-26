import { MANAGED_FOLDER, type Book } from "./books";
import { isId, newId, type RandomPort } from "./ids";
import { ManagedNoteError, parseManagedNote, serializeManagedNote } from "./managed-note";
import type { VaultPort } from "./ports";

const ENTITY_SCHEMA = 1;
export const ENTITY_TYPES = ["character", "place", "object", "technology", "spacecraft"] as const;
const TYPE_PATTERN = /^[a-z][a-z-]{1,30}$/;

/** Something the book is about. Identity is the id; names and aliases are descriptions that can change. */
export interface Entity {
	id: string;
	bookId: string;
	type: string;
	name: string;
	aliases: string[];
	/** Set when this entity was merged into another: references to it resolve to that one. */
	mergedInto: string | null;
	/** Hidden from lists and matching, but kept so nothing that points at it breaks. */
	archived: boolean;
	path: string;
	/** Everything below the properties, including the author's own writing. Preserved on every change. */
	body: string;
}

export const entityPath = (book: Book, type: string, id: string): string => `${book.folder}/${MANAGED_FOLDER}/entities/${type}/${id}.md`;
const entitiesPrefix = (book: Book): string => `${book.folder}/${MANAGED_FOLDER}/entities/`;

/** Names compare without regard to case, accents' composition or repeated spaces; never fuzzy. */
export const nameKey = (name: string): string => name.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

const cleanName = (raw: string): string => raw.replace(/\s+/g, " ").trim();

export function isEntityType(value: unknown): value is string {
	return typeof value === "string" && TYPE_PATTERN.test(value);
}

function render(e: Omit<Entity, "path">): string {
	return serializeManagedNote({
		frontmatter: { bh_schema: ENTITY_SCHEMA, bh_type: "entity", bh_id: e.id, bh_book: e.bookId, entity_type: e.type, name: e.name, aliases: e.aliases, merged_into: e.mergedInto, archived: e.archived },
		body: e.body,
	});
}

const NEW_BODY = (name: string): string => `# ${name}\n\n## Description\n\nWrite what you know about this here. Book Harness does not change this section.\n`;

function parse(path: string, text: string, book: Book): Entity {
	const { frontmatter: fm, body } = parseManagedNote(text);
	if (fm.bh_type !== "entity") throw new ManagedNoteError("This note is not an entity.");
	if (fm.bh_schema > ENTITY_SCHEMA) throw new ManagedNoteError(`Written by a newer Book Harness (schema ${fm.bh_schema}); update the plugin.`);
	if (!isId(fm.bh_id, "en")) throw new ManagedNoteError("Entity id is invalid.");
	if (fm.bh_book !== book.id) throw new ManagedNoteError("Entity belongs to a different book.");
	if (!isEntityType(fm.entity_type)) throw new ManagedNoteError("Entity type is invalid.");
	if (typeof fm.name !== "string" || cleanName(fm.name) === "") throw new ManagedNoteError("Entity name is missing.");
	const aliases: unknown = fm.aliases ?? [];
	if (!Array.isArray(aliases) || !aliases.every((a) => typeof a === "string")) throw new ManagedNoteError("Entity aliases are invalid.");
	const mergedInto: unknown = fm.merged_into ?? null;
	if (mergedInto !== null && !isId(mergedInto, "en")) throw new ManagedNoteError("Entity merge target is invalid.");
	return { id: fm.bh_id, bookId: book.id, type: fm.entity_type, name: cleanName(fm.name), aliases: aliases.map(cleanName).filter((a) => a !== ""), mergedInto, archived: fm.archived === true, path, body };
}

/** Every entity record of a book, including archived and merged ones. Unreadable records are reported, never hidden. */
export async function listAllEntities(vault: VaultPort, book: Book): Promise<{ entities: Entity[]; problems: string[] }> {
	const entities: Entity[] = [];
	const problems: string[] = [];
	const seen = new Map<string, string>();
	for (const path of vault.markdownPaths().filter((p) => p.startsWith(entitiesPrefix(book))).sort()) {
		try {
			const e = parse(path, await vault.read(path), book);
			const first = seen.get(e.id);
			if (first !== undefined) {
				problems.push(`${path}: Duplicate entity id, also used by ${first}. Is this a sync conflict copy?`);
				continue;
			}
			seen.set(e.id, path);
			entities.push(e);
		} catch (e) {
			problems.push(`${path}: ${e instanceof ManagedNoteError ? e.message : String(e)}`);
		}
	}
	return { entities, problems };
}

/** The entities that count: not archived, not merged away. */
export const activeEntities = (all: readonly Entity[]): Entity[] => all.filter((e) => !e.archived && e.mergedInto === null);

function assertFree(all: readonly Entity[], names: readonly string[], except: readonly string[] = []): void {
	for (const name of names) {
		const clash = activeEntities(all).find((e) => !except.includes(e.id) && (nameKey(e.name) === nameKey(name) || e.aliases.some((a) => nameKey(a) === nameKey(name))));
		if (clash) throw new Error(`"${name}" already belongs to ${clash.name} (${clash.type}). Merge them if they are the same.`);
	}
}

async function write(vault: VaultPort, e: Entity): Promise<Entity> {
	const before = await vault.read(e.path);
	if (!(await vault.replaceIfUnchanged(e.path, before, render(e)))) throw new Error(`${e.name} changed on another device; try again.`);
	return e;
}

export interface NewEntity {
	type: string;
	name: string;
	aliases?: string[];
}

export async function createEntity(vault: VaultPort, book: Book, all: readonly Entity[], req: NewEntity, random: RandomPort): Promise<Entity> {
	const name = cleanName(req.name);
	if (name === "") throw new Error("An entity needs a name.");
	if (!isEntityType(req.type)) throw new Error("Entity type must be lowercase letters and dashes, for example character or place.");
	const aliases = (req.aliases ?? []).map(cleanName).filter((a, i, list) => a !== "" && nameKey(a) !== nameKey(name) && list.findIndex((x) => nameKey(x) === nameKey(a)) === i);
	assertFree(all, [name, ...aliases]);
	const id = newId("en", random);
	const entity: Entity = { id, bookId: book.id, type: req.type, name, aliases, mergedInto: null, archived: false, path: entityPath(book, req.type, id), body: NEW_BODY(name) };
	await vault.create(entity.path, render(entity));
	return entity;
}

/** Rename; the old name stays as an alias so existing wording still resolves. */
export async function renameEntity(vault: VaultPort, all: readonly Entity[], entity: Entity, name: string): Promise<Entity> {
	const next = cleanName(name);
	if (next === "") throw new Error("An entity needs a name.");
	if (nameKey(next) === nameKey(entity.name)) return write(vault, { ...entity, name: next });
	assertFree(all, [next], [entity.id]);
	const aliases = [...entity.aliases.filter((a) => nameKey(a) !== nameKey(next) && nameKey(a) !== nameKey(entity.name)), entity.name];
	return write(vault, { ...entity, name: next, aliases });
}

export async function addAlias(vault: VaultPort, all: readonly Entity[], entity: Entity, alias: string): Promise<Entity> {
	const a = cleanName(alias);
	if (a === "") throw new Error("An alias cannot be empty.");
	if (nameKey(a) === nameKey(entity.name) || entity.aliases.some((x) => nameKey(x) === nameKey(a))) return entity;
	assertFree(all, [a], [entity.id]);
	return write(vault, { ...entity, aliases: [...entity.aliases, a] });
}

export async function removeAlias(vault: VaultPort, entity: Entity, alias: string): Promise<Entity> {
	return write(vault, { ...entity, aliases: entity.aliases.filter((a) => nameKey(a) !== nameKey(alias)) });
}

/**
 * Merge `from` into `into` (the author says they are the same). The surviving entity gains the other's name and aliases;
 * the merged one stays as a redirect so anything that referred to it still resolves. The survivor is written first, so a
 * failure part-way leaves two entities (safe) rather than a redirect to nothing.
 */
export async function mergeEntities(vault: VaultPort, from: Entity, into: Entity): Promise<Entity> {
	if (from.id === into.id) throw new Error("Pick a different entity to merge into.");
	if (from.type !== into.type) throw new Error(`These are different kinds of thing (${from.type} and ${into.type}).`);
	const names = [from.name, ...from.aliases].filter((n) => !into.aliases.some((a) => nameKey(a) === nameKey(n)) && nameKey(n) !== nameKey(into.name));
	const survivor = await write(vault, { ...into, aliases: [...into.aliases, ...names] });
	await write(vault, { ...from, mergedInto: into.id, aliases: [] });
	return survivor;
}

/** Move the listed aliases off `source` into a new entity (the author says they were two different things all along). */
export async function splitEntity(vault: VaultPort, book: Book, all: readonly Entity[], source: Entity, req: { name: string; aliases: string[] }, random: RandomPort): Promise<{ source: Entity; created: Entity }> {
	const moved = req.aliases.filter((a) => source.aliases.some((x) => nameKey(x) === nameKey(a)));
	if (moved.length !== req.aliases.length) throw new Error("You can only move names that this entity already has.");
	const created = await createEntity(vault, book, all.map((e) => (e.id === source.id ? { ...e, aliases: e.aliases.filter((a) => !moved.some((m) => nameKey(m) === nameKey(a))) } : e)), { type: source.type, name: req.name, aliases: moved }, random);
	const remaining = await write(vault, { ...source, aliases: source.aliases.filter((a) => !moved.some((m) => nameKey(m) === nameKey(a))) });
	return { source: remaining, created };
}

/** Hide an entity without deleting its note, so nothing that refers to it breaks. */
export async function archiveEntity(vault: VaultPort, entity: Entity): Promise<Entity> {
	return write(vault, { ...entity, archived: true });
}
