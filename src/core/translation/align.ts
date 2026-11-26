import { hashText } from "../segmentation";

/**
 * How one list of blocks became another, found by content and never by position alone. Used twice: between the source
 * text the translation was last made from and the source text now, and between the translation as last written and as it is now.
 */
export type Change =
	| { kind: "same"; old: number; now: number }
	| { kind: "modified"; old: number; now: number }
	| { kind: "moved"; old: number; now: number }
	| { kind: "removed"; old: number }
	| { kind: "added"; now: number }
	| { kind: "split"; old: number; now: number[] }
	| { kind: "merged"; old: number[]; now: number }
	/** Something changed but it is not clear how the old and new blocks relate; a person has to decide. */
	| { kind: "unclear"; old: number[]; now: number[] };

const words = (s: string): string[] => s.toLowerCase().normalize("NFC").match(/[\p{L}\p{N}]+/gu) ?? [];

/** Share of words two blocks have in common (Jaccard over word sets), 0 to 1. */
export function similarity(a: string, b: string): number {
	const x = new Set(words(a));
	const y = new Set(words(b));
	if (x.size === 0 && y.size === 0) return a === b ? 1 : 0;
	let shared = 0;
	for (const w of x) if (y.has(w)) shared++;
	return shared / (x.size + y.size - shared);
}

const MATCH = 0.5;
const joined = (texts: readonly string[]): string => texts.join(" ").replace(/\s+/g, " ").trim();
const flat = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Longest common subsequence of equal hashes: the blocks that certainly did not change. */
function anchors(a: readonly string[], b: readonly string[]): Array<[number, number]> {
	const n = a.length;
	const m = b.length;
	const t: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) (t[i])[j] = a[i] === b[j] ? ((t[i + 1])[j + 1]) + 1 : Math.max(((t[i + 1])[j]), ((t[i])[j + 1]));
	const out: Array<[number, number]> = [];
	for (let i = 0, j = 0; i < n && j < m; ) {
		if (a[i] === b[j]) {
			out.push([i, j]);
			i++;
			j++;
		} else if (((t[i + 1])[j]) >= ((t[i])[j + 1])) i++;
		else j++;
	}
	return out;
}

/** Order-preserving best pairing of two short gaps by similarity; pairs below the threshold are not made. */
function pairGap(oldGap: readonly number[], newGap: readonly number[], sim: (o: number, n: number) => number): Array<[number, number]> {
	const n = oldGap.length;
	const m = newGap.length;
	const best: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--)
		for (let j = m - 1; j >= 0; j--) {
			const s = sim(oldGap[i], newGap[j]);
			best[i][j] = Math.max(best[i + 1][j], best[i][j + 1], s >= MATCH ? best[i + 1][j + 1] + s : 0);
		}
	const pairs: Array<[number, number]> = [];
	for (let i = 0, j = 0; i < n && j < m; ) {
		const s = sim(oldGap[i], newGap[j]);
		if (s >= MATCH && best[i][j] === best[i + 1][j + 1] + s) {
			pairs.push([oldGap[i], newGap[j]]);
			i++;
			j++;
		} else if (best[i][j] === best[i + 1][j]) i++;
		else j++;
	}
	return pairs;
}

export function diffBlocks(before: readonly string[], now: readonly string[]): Change[] {
	const hb = before.map(hashText);
	const hn = now.map(hashText);
	const same = anchors(hb, hn);
	const changes = new Map<string, Change>();
	const claimedOld = new Set<number>();
	const claimedNew = new Set<number>();
	for (const [o, n] of same) {
		changes.set(`o${o}`, { kind: "same", old: o, now: n });
		claimedOld.add(o);
		claimedNew.add(n);
	}
	// moved: an unclaimed old block whose exact text is an unclaimed new block elsewhere
	for (let o = 0; o < before.length; o++) {
		if (claimedOld.has(o)) continue;
		const n = hn.findIndex((h, i) => h === hb[o] && !claimedNew.has(i));
		if (n >= 0) {
			changes.set(`o${o}`, { kind: "moved", old: o, now: n });
			claimedOld.add(o);
			claimedNew.add(n);
		}
	}
	// split and merge: the same words in a different number of blocks, only when the text is identical once joined
	const freeOld = () => Array.from({ length: before.length }, (_, i) => i).filter((i) => !claimedOld.has(i));
	const freeNew = () => Array.from({ length: now.length }, (_, i) => i).filter((i) => !claimedNew.has(i));
	for (const o of freeOld()) {
		for (let len = 2; len <= 4 && !claimedOld.has(o); len++) {
			for (const start of freeNew()) {
				const run = Array.from({ length: len }, (_, k) => start + k);
				if (run.some((i) => i >= now.length || claimedNew.has(i))) continue;
				if (joined(run.map((i) => now[i])) === flat(before[o])) {
					changes.set(`o${o}`, { kind: "split", old: o, now: run });
					claimedOld.add(o);
					run.forEach((i) => claimedNew.add(i));
					break;
				}
			}
		}
	}
	for (const n of freeNew()) {
		for (let len = 2; len <= 4 && !claimedNew.has(n); len++) {
			for (const start of freeOld()) {
				const run = Array.from({ length: len }, (_, k) => start + k);
				if (run.some((i) => i >= before.length || claimedOld.has(i))) continue;
				if (joined(run.map((i) => before[i])) === flat(now[n])) {
					changes.set(`o${run[0]}`, { kind: "merged", old: run, now: n });
					run.forEach((i) => claimedOld.add(i));
					claimedNew.add(n);
					break;
				}
			}
		}
	}
	// the rest, gap by gap between the anchors: similar blocks are the same block edited, the others are removed or added
	const bounds = [...same.map(([o, n]) => [o, n] as [number, number]), [before.length, now.length] as [number, number]];
	let prevO = -1;
	let prevN = -1;
	for (const [bo, bn] of bounds) {
		const gapOld = freeOld().filter((i) => i > prevO && i < bo);
		const gapNew = freeNew().filter((i) => i > prevN && i < bn);
		const pairs = pairGap(gapOld, gapNew, (o, n) => similarity(before[o], now[n]));
		for (const [o, n] of pairs) {
			changes.set(`o${o}`, { kind: "modified", old: o, now: n });
			claimedOld.add(o);
			claimedNew.add(n);
		}
		const restOld = gapOld.filter((i) => !claimedOld.has(i));
		const restNew = gapNew.filter((i) => !claimedNew.has(i));
		// one block on each side with nothing alike, or several on each side: a person has to say what became what
		if (restOld.length > 0 && restNew.length > 0) {
			changes.set(`o${restOld[0]}`, { kind: "unclear", old: restOld, now: restNew });
			restOld.forEach((i) => claimedOld.add(i));
			restNew.forEach((i) => claimedNew.add(i));
		}
		prevO = bo;
		prevN = bn;
	}
	const out = [...changes.values()];
	for (const o of freeOld()) out.push({ kind: "removed", old: o });
	for (const n of freeNew()) out.push({ kind: "added", now: n });
	return out;
}
