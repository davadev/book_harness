export interface Ranked {
	key: string;
}

export interface Fused {
	key: string;
	score: number;
	/** 1-based rank in each input list (absent when the list did not contain it). */
	ranks: Array<number | null>;
}

/**
 * Reciprocal rank fusion. Only positions are used, so scores from different systems (BM25, cosine) never need to be
 * compared. k = 60 is the usual damping constant.
 */
export function fuse(lists: ReadonlyArray<readonly Ranked[]>, k = 60): Fused[] {
	const table = new Map<string, Fused>();
	lists.forEach((list, li) => {
		list.forEach((item, position) => {
			const row = table.get(item.key) ?? { key: item.key, score: 0, ranks: lists.map(() => null) };
			row.score += 1 / (k + position + 1);
			row.ranks[li] = position + 1;
			table.set(item.key, row);
		});
	});
	return [...table.values()].sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}
