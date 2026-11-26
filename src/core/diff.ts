/** A change to a text: replace `original` (at `from`..`to` in the old text) with `replacement`. */
export interface Hunk {
	from: number;
	to: number;
	original: string;
	replacement: string;
}

const TOKEN = /\s+|[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu;

interface Tok {
	text: string;
	start: number;
}

const tokens = (text: string): Tok[] => Array.from(text.matchAll(TOKEN), (m) => ({ text: m[0], start: m.index }));

/**
 * Word-level difference between two texts as the smallest set of replace hunks (longest common subsequence of tokens).
 * Deterministic and pure; `applyHunks(a, diffText(a, b)) === b` always holds.
 */
export function diffText(a: string, b: string): Hunk[] {
	if (a === b) return [];
	const x = tokens(a);
	const y = tokens(b);
	// Shared leading and trailing tokens are trimmed first so the table only covers what changed.
	let lo = 0;
	while (lo < x.length && lo < y.length && x[lo]?.text === y[lo]?.text) lo++;
	let hi = 0;
	while (hi < x.length - lo && hi < y.length - lo && x[x.length - 1 - hi]?.text === y[y.length - 1 - hi]?.text) hi++;
	const xs = x.slice(lo, x.length - hi);
	const ys = y.slice(lo, y.length - hi);
	const table: number[][] = Array.from({ length: xs.length + 1 }, () => new Array<number>(ys.length + 1).fill(0));
	for (let i = xs.length - 1; i >= 0; i--) {
		for (let j = ys.length - 1; j >= 0; j--) {
			table[i][j] = xs[i].text === ys[j].text ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
		}
	}
	const posA = (k: number): number => x[lo + k]?.start ?? a.length;
	const posB = (k: number): number => y[lo + k]?.start ?? b.length;
	const hunks: Hunk[] = [];
	let open: { i: number; j: number } | null = null;
	const close = (i: number, j: number): void => {
		if (!open) return;
		const from = posA(open.i);
		const to = posA(i);
		hunks.push({ from, to, original: a.slice(from, to), replacement: b.slice(posB(open.j), posB(j)) });
		open = null;
	};
	let i = 0;
	let j = 0;
	while (i < xs.length || j < ys.length) {
		if (i < xs.length && j < ys.length && xs[i].text === ys[j].text) {
			close(i, j);
			i++;
			j++;
			continue;
		}
		open ??= { i, j };
		if (j >= ys.length || (i < xs.length && table[i + 1][j] >= table[i][j + 1])) i++;
		else j++;
	}
	close(i, j);
	return hunks;
}

export function applyHunks(text: string, hunks: readonly Hunk[]): string {
	let out = "";
	let at = 0;
	for (const h of [...hunks].sort((p, q) => p.from - q.from)) {
		out += text.slice(at, h.from) + h.replacement;
		at = h.to;
	}
	return out + text.slice(at);
}
