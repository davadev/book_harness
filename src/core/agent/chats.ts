import { MANAGED_FOLDER, type Book } from "../books";
import { isId, newId, type RandomPort } from "../ids";
import { ManagedNoteError, parseManagedNote, serializeManagedNote } from "../managed-note";
import type { VaultPort } from "../ports";
import type { AskResult } from "./ask";

/**
 * Answers to "ask the book" kept as readable notes, one per question, so they survive closing Obsidian and follow the
 * vault to another device. They are the author's to delete; they are never read back as facts about the book.
 */
const SCHEMA = 1;
const FENCE = /```bh-records\n([\s\S]*?)\n```/;
const prefix = (book: Book): string => `${book.folder}/${MANAGED_FOLDER}/chats/`;

export interface SavedAnswer {
	id: string;
	askedAt: string;
	retired: boolean;
	path: string;
	result: AskResult;
}

function render(book: Book, a: Omit<SavedAnswer, "path">): string {
	const quotes = a.result.citations.map((c) => `- ${c.chapter}: “${c.quote}”`).join("\n");
	return serializeManagedNote({
		frontmatter: { bh_schema: SCHEMA, bh_type: "chat", bh_id: a.id, bh_book: book.id, asked_at: a.askedAt, retired: a.retired },
		body: `# ${a.result.question}\n\n${a.result.answer}\n\n${quotes}\n\n\`\`\`bh-records\n${JSON.stringify(a.result, null, 1)}\n\`\`\`\n`,
	});
}

export async function saveAnswer(vault: VaultPort, book: Book, result: AskResult, askedAt: string, random: RandomPort): Promise<SavedAnswer> {
	const id = newId("cv", random);
	const saved: SavedAnswer = { id, askedAt, retired: false, path: `${prefix(book)}${id}.md`, result };
	await vault.create(saved.path, render(book, saved));
	return saved;
}

/** Newest first. A note that cannot be read is skipped and reported, never hidden. */
export async function loadAnswers(vault: VaultPort, book: Book, limit = 10): Promise<{ answers: SavedAnswer[]; problems: string[] }> {
	const answers: SavedAnswer[] = [];
	const problems: string[] = [];
	for (const path of vault.markdownPaths().filter((p) => p.startsWith(prefix(book)))) {
		try {
			const n = parseManagedNote(await vault.read(path));
			if (n.frontmatter.bh_type !== "chat" || n.frontmatter.bh_book !== book.id || !isId(n.frontmatter.bh_id, "cv")) throw new ManagedNoteError("This note is not a saved answer of this book.");
			if (n.frontmatter.bh_schema > SCHEMA) throw new ManagedNoteError("Written by a newer Book Harness; update the plugin.");
			const m = FENCE.exec(n.body);
			if (!m) throw new ManagedNoteError("The saved answer has no records block.");
			const result = JSON.parse(m[1]) as AskResult | null;
			if (!result || typeof result.question !== "string" || typeof result.answer !== "string" || !Array.isArray(result.citations)) throw new ManagedNoteError("The saved answer is malformed.");
			answers.push({ id: n.frontmatter.bh_id, askedAt: String(n.frontmatter.asked_at), retired: n.frontmatter.retired === true, path, result });
		} catch (e) {
			problems.push(`${path}: ${(e as Error).message}`);
		}
	}
	answers.sort((a, b) => b.askedAt.localeCompare(a.askedAt) || b.id.localeCompare(a.id));
	return { answers: answers.filter((a) => !a.retired).slice(0, limit), problems };
}

/** Removing an answer hides it; the note stays in the vault until the author deletes it. */
export async function retireAnswer(vault: VaultPort, book: Book, saved: SavedAnswer): Promise<void> {
	if (!(await vault.replaceIfUnchanged(saved.path, await vault.read(saved.path), render(book, { ...saved, retired: true })))) throw new Error("That answer changed on another device; try again.");
}
