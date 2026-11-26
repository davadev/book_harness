export const CHAPTER_STATUSES = ["planned", "drafting", "written", "revising", "finalized"] as const;
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];

export function isChapterStatus(value: unknown): value is ChapterStatus {
	return typeof value === "string" && (CHAPTER_STATUSES as readonly string[]).includes(value);
}

/** Statuses that satisfy a requirement. "revising" never counts as done: the author has reopened the chapter. */
const SATISFIES: Record<ChapterStatus, readonly ChapterStatus[]> = {
	planned: CHAPTER_STATUSES,
	drafting: ["drafting", "written", "revising", "finalized"],
	written: ["written", "finalized"],
	revising: ["finalized"],
	finalized: ["finalized"],
};

export function meetsRequirement(status: ChapterStatus, required: ChapterStatus): boolean {
	return SATISFIES[required].includes(status);
}
