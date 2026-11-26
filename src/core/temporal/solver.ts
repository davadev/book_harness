/**
 * A simple temporal network solved by difference constraints. Every constraint says `to - from` lies in `[min, max]`
 * seconds (either bound may be infinite). Nothing is cached: calling `solve` again with a different set of constraints
 * is how an anchor is added, changed or retracted. Pure and deterministic; no model is involved.
 */
export const ORIGIN = "Z";

export interface TimeConstraint {
	id: string;
	from: string;
	to: string;
	min: number;
	max: number;
	/** What the author or the text said, shown as evidence when this constraint is part of a conflict or a derived value. */
	text: string;
}

export interface Bounds {
	lo: number;
	hi: number;
}

export interface Resolved {
	/** Possible values of each point, in seconds since the epoch; infinite where nothing limits it. Empty when inconsistent. */
	bounds: ReadonlyMap<string, Bounds>;
	/** Points whose time is known exactly. */
	definite: ReadonlySet<string>;
	/** Pairs [a, b] where a is certainly before b, after removing the ones implied by others. */
	before: Array<[string, string]>;
	/** Pairs of points the constraints say nothing about. */
	unordered: Array<[string, string]>;
	/** Constraint ids that support the earliest/latest bound of each point (for showing why a date was derived). */
	support: ReadonlyMap<string, string[]>;
	/** Set when the constraints contradict each other: the cycle of constraints, in order. */
	conflict: TimeConstraint[] | null;
}

interface Edge {
	u: number;
	v: number;
	w: number;
	c: TimeConstraint;
}

/** Shortest-path closure with predecessor tracking, so every derived bound can name the constraints behind it. */
export function solve(points: readonly string[], constraints: readonly TimeConstraint[]): Resolved {
	const names = [ORIGIN, ...points.filter((p) => p !== ORIGIN)];
	const index = new Map(names.map((n, i) => [n, i] as const));
	const edges: Edge[] = [];
	for (const c of constraints) {
		const f = index.get(c.from);
		const t = index.get(c.to);
		if (f === undefined || t === undefined) continue;
		if (c.max !== Infinity) edges.push({ u: f, v: t, w: c.max, c });
		if (c.min !== -Infinity) edges.push({ u: t, v: f, w: -c.min, c });
	}
	const cycle = negativeCycle(names.length, edges);
	if (cycle) return { bounds: new Map(), definite: new Set(), before: [], unordered: [], support: new Map(), conflict: cycle };

	const n = names.length;
	const d = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
	const via: Array<Array<Edge | number | null>> = Array.from({ length: n }, () => Array.from({ length: n }, () => null));
	for (const e of edges) {
		const row = d[e.u];
		if (e.w < (row[e.v])) {
			row[e.v] = e.w;
			(via[e.u])[e.v] = e;
		}
	}
	for (let k = 0; k < n; k++)
		for (let i = 0; i < n; i++) {
			const dik = (d[i])[k];
			if (dik === Infinity) continue;
			for (let j = 0; j < n; j++) {
				const through = dik + ((d[k])[j]);
				if (through < ((d[i])[j])) {
					(d[i])[j] = through;
					(via[i])[j] = k;
				}
			}
		}
	const dist = (i: number, j: number): number => (d[i])[j];
	const path = (i: number, j: number, out: Set<string>): void => {
		const v = (via[i])[j];
		if (v === null) return;
		if (typeof v === "number") {
			path(i, v, out);
			path(v, j, out);
		} else out.add(v.c.id);
	};

	const bounds = new Map<string, Bounds>();
	const support = new Map<string, string[]>();
	const definite = new Set<string>();
	for (let i = 1; i < n; i++) {
		const hi = dist(0, i);
		const lo = -dist(i, 0);
		const name = names[i];
		bounds.set(name, { lo, hi });
		const ids = new Set<string>();
		path(0, i, ids);
		path(i, 0, ids);
		support.set(name, [...ids]);
		if (lo === hi && Number.isFinite(lo)) definite.add(name);
	}
	const certain: Array<[number, number]> = [];
	const unordered: Array<[string, string]> = [];
	for (let a = 1; a < n; a++)
		for (let b = 1; b < n; b++) {
			if (a === b) continue;
			// dist(b, a) bounds t_a - t_b from above: below zero means a is strictly earlier than b
			if (dist(b, a) < 0) certain.push([a, b]);
			else if (a < b && dist(a, b) >= 0 && !(dist(a, b) === 0 && dist(b, a) === 0)) unordered.push([names[a], names[b]]);
		}
	// transitive reduction of the certain relation
	const reach = new Set(certain.map(([a, b]) => `${a}>${b}`));
	const reduced = certain.filter(([a, b]) => !certain.some(([x, m]) => x === a && m !== b && reach.has(`${m}>${b}`)));
	return { bounds, definite, before: reduced.map(([a, b]) => [names[a], names[b]]), unordered, support, conflict: null };
}

/** Bellman–Ford from a virtual source; returns the constraints around one negative cycle, or null. */
function negativeCycle(n: number, edges: readonly Edge[]): TimeConstraint[] | null {
	const dist = new Array<number>(n).fill(0);
	const pred = new Array<Edge | null>(n).fill(null);
	let last = -1;
	for (let round = 0; round < n; round++) {
		last = -1;
		for (const e of edges) {
			if ((dist[e.u]) + e.w < (dist[e.v])) {
				dist[e.v] = (dist[e.u]) + e.w;
				pred[e.v] = e;
				last = e.v;
			}
		}
		if (last < 0) return null;
	}
	let v = last;
	for (let i = 0; i < n; i++) v = (pred[v] as Edge).u; // walk back until certainly inside the cycle
	const cycle: TimeConstraint[] = [];
	const seen = new Set<string>();
	for (let cur = v; ; ) {
		const e = pred[cur] as Edge;
		if (!seen.has(e.c.id)) {
			seen.add(e.c.id);
			cycle.unshift(e.c);
		}
		cur = e.u;
		if (cur === v) break;
	}
	return cycle;
}
