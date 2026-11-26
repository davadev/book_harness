import { bookForPath, type Book } from "./books";
import { readingOrder, type Chapter } from "./chapters";
import { possibleDuplicates, type DuplicateSuggestion, type Entity } from "./entities";
import type { JobRecord } from "./jobs";
import type { IndexStatus } from "./embeddings";
import type { PassageContext } from "./graph";
import type { SearchOutcome } from "./search";
import type { CoverageView } from "./proofread";
import type { Proposal } from "./proposals";
import type { SummaryStatus } from "./summary";
import type { ChapterStats } from "./task-state";
import type { AskResult } from "./agent/ask";
import type { BookStatistics } from "./stats/statistics";
import type { TimelineView } from "./temporal/timeline";
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
	proofread: CoverageView | null;
}

export interface Overview {
	rows: OverviewRow[];
	/** Required items first, each group in reading order. */
	todos: Todo[];
	/** Whether meaning search can be offered, whether the author turned it on, and how fresh its index is. */
	meaning: { available: boolean; enabled: boolean; status: IndexStatus | null };
	/** Context the author asked to see for search results, by passage. */
	contexts: ReadonlyMap<string, PassageContext>;
	/** The last search the author ran, if any. */
	search: SearchOutcome | null;
	/** The entity the author tapped in the editor, shown in detail. */
	selected: Entity | null;
	/** Active entities, by kind then name. */
	entities: Entity[];
	/** Pairs of the same kind that share a word: for the author to look at, never merged automatically. */
	duplicates: DuplicateSuggestion[];
	/** Entities the model created that no chapter text supports any more. */
	unsupported: Entity[];
	/** Proposals with changes still waiting for a decision or for applying. */
	proposals: Array<{ proposal: Proposal; designation: string }>;
	/** What the author's events and statements about time add up to, or null when none exist. */
	timeline: TimelineView | null;
	/** Statistics the author asked for, or null while none are shown. Never model output. */
	statistics: BookStatistics | null;
	/** Questions asked of the book in this session, newest first, and the one being answered now. */
	ask: { history: AskResult[]; pending: string | null };
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

export function buildOverview(book: Book, chapters: readonly Chapter[], activePath: string | null, exists: (path: string) => boolean, stats: ReadonlyMap<string, ChapterStats> = new Map(), jobs: readonly JobRecord[] = [], conflictCopies: readonly string[] = [], manualTodos: readonly ManualTodo[] = [], summaries: ReadonlyMap<string, OverviewRow["summary"]> = new Map(), proposals: readonly Proposal[] = [], coverage: ReadonlyMap<string, CoverageView> = new Map(), entities: readonly Entity[] = [], unsupported: readonly Entity[] = [], selected: Entity | null = null, search: SearchOutcome | null = null, meaning: Overview["meaning"] = { available: false, enabled: false, status: null }, contexts: ReadonlyMap<string, PassageContext> = new Map(), timeline: TimelineView | null = null, statistics: BookStatistics | null = null, ask: Overview["ask"] = { history: [], pending: null }): Overview {
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
			proofread: coverage.get(chapter.id) ?? null,
		})),
		proposals: proposals.filter((p) => p.edits.some((e) => e.decision !== "rejected" && e.decision !== "applied")).map((proposal) => ({ proposal, designation: chapters.find((c) => c.id === proposal.chapterId)?.designation ?? "Unknown chapter" })),
		meaning,
		contexts,
		timeline,
		statistics,
		ask,
		search,
		selected,
		entities: [...entities].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)),
		duplicates: possibleDuplicates(entities),
		unsupported: [...unsupported],
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
