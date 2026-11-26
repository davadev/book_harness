import { bookForPath, type Book } from "./books";
import { readingOrder, type Chapter } from "./chapters";
import type { JobRecord } from "./jobs";
import type { SummaryStatus } from "./summary";
import type { ChapterStats } from "./task-state";
import { manualAsTodos, type ManualTodo } from "./manual-todos";
import { deriveTodos, type Todo } from "./todos";

/** What the side panel should show for the note that is open. Pure so every case is table-testable. */
export type PanelContext =
	| { kind: "no-books" }
	| { kind: "inactive"; reason: "no-active-note" | "not-in-a-book" }
	| { kind: "book"; book: Book; activePath: string; role: "chapter" | "manuscript" | "managed" | "folder"; chapterId: string | null };

export interface OverviewRow {
	chapter: Chapter;
	isActive: boolean;
	/** The bound note no longer exists in the vault (moved or deleted outside Obsidian's tracking). */
	missingNote: boolean;
	isFirst: boolean;
	isLast: boolean;
	stats: ChapterStats;
	summary: { status: SummaryStatus; path: string | null };
}

export interface Overview {
	rows: OverviewRow[];
	/** Required items first, each group in reading order. */
	todos: Todo[];
	/** Jobs to show: running, interrupted, and recently finished ones that were not dismissed. */
	jobs: JobRecord[];
}

export function resolveContext(books: readonly Book[], activePath: string | null, chapters: readonly Chapter[]): PanelContext {
	if (books.length === 0) return { kind: "no-books" };
	if (activePath === null) return { kind: "inactive", reason: "no-active-note" };
	const book = bookForPath(books, activePath);
	if (!book) return { kind: "inactive", reason: "not-in-a-book" };
	const chapter = chapters.find((c) => c.bookId === book.id && c.notePath === activePath);
	const managed = activePath.startsWith(`${book.folder}/_book-harness/`);
	const role = chapter ? "chapter" : managed ? "managed" : activePath === book.folder ? "folder" : "manuscript";
	return { kind: "book", book, activePath, role, chapterId: chapter?.id ?? null };
}

const NO_STATS: ChapterStats = { words: null, status: "not_processed" };
const NO_SUMMARY: OverviewRow["summary"] = { status: "none", path: null };

export function buildOverview(book: Book, chapters: readonly Chapter[], activePath: string | null, exists: (path: string) => boolean, stats: ReadonlyMap<string, ChapterStats> = new Map(), jobs: readonly JobRecord[] = [], conflictCopies: readonly string[] = [], manualTodos: readonly ManualTodo[] = [], summaries: ReadonlyMap<string, OverviewRow["summary"]> = new Map()): Overview {
	const ordered = readingOrder(chapters);
	const todos = [...manualAsTodos(manualTodos), ...deriveTodos(book, chapters, exists, conflictCopies)];
	return {
		rows: ordered.map((chapter, i) => ({
			chapter,
			isActive: activePath !== null && chapter.notePath === activePath,
			missingNote: chapter.notePath !== null && !exists(chapter.notePath),
			isFirst: i === 0,
			isLast: i === ordered.length - 1,
			stats: stats.get(chapter.id) ?? NO_STATS,
			summary: summaries.get(chapter.id) ?? NO_SUMMARY,
		})),
		jobs: [...jobs],
		todos: [...todos.filter((t) => t.severity === "required"), ...todos.filter((t) => t.severity === "info")],
	};
}

/** The order value that puts a chapter just before/after its neighbour; renumbers by midpoint so only one record changes. */
export function orderToMove(ordered: readonly Chapter[], id: string, direction: "up" | "down"): number | null {
	const i = ordered.findIndex((c) => c.id === id);
	const self = ordered[i];
	const other = ordered[direction === "up" ? i - 1 : i + 1];
	if (!self || !other) return null;
	const beyond = ordered[direction === "up" ? i - 2 : i + 2];
	if (!beyond) return direction === "up" ? other.order - 1000 : other.order + 1000;
	const mid = (other.order + beyond.order) / 2;
	return Number.isFinite(mid) && mid !== other.order && mid !== beyond.order ? mid : null;
}
