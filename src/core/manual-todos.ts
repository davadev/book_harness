import { MANAGED_FOLDER, type Book } from "./books";
import { ManagedNoteError, parseManagedNote, serializeManagedNote } from "./managed-note";
import type { VaultPort } from "./ports";
import { fingerprint } from "./revision";
import type { Todo } from "./todos";

const TODOS_SCHEMA = 1;
const ITEM = /^- \[( |x)\] (.+)$/;

export interface ManualTodo {
	id: string;
	text: string;
	done: boolean;
}

export const todosPath = (book: Book): string => `${book.folder}/${MANAGED_FOLDER}/todos.md`;

function render(book: Book, items: readonly { text: string; done: boolean }[]): string {
	const lines = items.map((i) => `- [${i.done ? "x" : " "}] ${i.text}`).join("\n");
	return serializeManagedNote({
		frontmatter: { bh_schema: TODOS_SCHEMA, bh_type: "todos", bh_id: book.id, bh_book: book.id },
		body: `# To do\n\nYour own to-do items for this book. You can edit this list by hand; use "- [ ] text" and "- [x] text".\n\n${lines}\n`,
	});
}

function parse(text: string, book: Book): { text: string; done: boolean }[] {
	const note = parseManagedNote(text);
	if (note.frontmatter.bh_type !== "todos") throw new ManagedNoteError("This note is not the to-do list.");
	if (note.frontmatter.bh_schema > TODOS_SCHEMA) throw new ManagedNoteError("Written by a newer Book Harness; update the plugin.");
	if (note.frontmatter.bh_book !== book.id) throw new ManagedNoteError("This to-do list belongs to a different book.");
	return note.body.split("\n").flatMap((line) => {
		const m = ITEM.exec(line.trimEnd());
		return m ? [{ text: m[2].trim(), done: m[1] === "x" }] : [];
	});
}

/** Ids come from the text (plus a counter for repeats), so they survive reordering and hand edits. */
function withIds(items: readonly { text: string; done: boolean }[]): ManualTodo[] {
	const seen = new Map<string, number>();
	return items.map((i) => {
		const base = fingerprint({ text: i.text }).slice(3, 15);
		const n = seen.get(base) ?? 0;
		seen.set(base, n + 1);
		return { id: `manual:${base}${n === 0 ? "" : `-${n}`}`, text: i.text, done: i.done };
	});
}

export async function listManualTodos(vault: VaultPort, book: Book): Promise<ManualTodo[]> {
	const path = todosPath(book);
	return vault.exists(path) ? withIds(parse(await vault.read(path), book)) : [];
}

async function change(vault: VaultPort, book: Book, edit: (items: { text: string; done: boolean }[]) => { text: string; done: boolean }[]): Promise<void> {
	const path = todosPath(book);
	if (!vault.exists(path)) {
		await vault.create(path, render(book, edit([])));
		return;
	}
	const before = await vault.read(path);
	if (!(await vault.replaceIfUnchanged(path, before, render(book, edit(parse(before, book)))))) throw new Error("The to-do list changed on another device; try again.");
}

export async function addManualTodo(vault: VaultPort, book: Book, text: string): Promise<void> {
	const clean = text.replace(/\s+/g, " ").trim();
	if (clean === "") throw new Error("A to-do needs some text.");
	await change(vault, book, (items) => [...items, { text: clean, done: false }]);
}

export async function setManualTodoDone(vault: VaultPort, book: Book, id: string, done: boolean): Promise<void> {
	const current = await listManualTodos(vault, book);
	const index = current.findIndex((t) => t.id === id);
	if (index < 0) throw new Error("That to-do no longer exists.");
	await change(vault, book, (items) => items.map((i, n) => (n === index ? { ...i, done } : i)));
}

/** Open manual items as to-dos. Done items are history and are not shown. */
export function manualAsTodos(items: readonly ManualTodo[]): Todo[] {
	return items.filter((i) => !i.done).map((i) => ({ id: i.id, kind: "manual", severity: "required", message: i.text, manualId: i.id }));
}
