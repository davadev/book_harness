import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeSpan, parseDuration, toInterval } from "../core/temporal/calendar";
import { ORIGIN, solve, type TimeConstraint } from "../core/temporal/solver";
import { parseCivil } from "../core/temporal/timeline";

interface Statement {
	id?: string;
	kind: "before" | "after_by" | "same" | "date";
	a: string;
	b?: string;
	by?: string;
	date?: string;
}
interface Fixture {
	description: string;
	points: string[];
	statements: Statement[];
	expect: { conflict?: boolean; before?: Array<[string, string]>; unordered?: Array<[string, string]>; span?: Record<string, string>; conflictIds?: string[]; refused?: boolean };
}

const DIR = join(process.cwd(), "fixtures/temporal");
const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();

/** The same meaning the timeline records give a statement, written out so a fixture reads like the author's own words. */
function compile(statements: readonly Statement[]): TimeConstraint[] {
	return statements.map((s, i) => {
		const id = s.id ?? `s${i + 1}`;
		const b = s.b as string;
		if (s.kind === "before") return { id, from: s.a, to: b, min: 1, max: Infinity, text: id };
		if (s.kind === "same") return { id, from: s.a, to: b, min: 0, max: 0, text: id };
		if (s.kind === "after_by") {
			const secs = parseDuration(s.by as string);
			return { id, from: s.a, to: b, min: secs, max: secs, text: id };
		}
		const [lo, hi] = toInterval(parseCivil(s.date as string));
		return { id, from: ORIGIN, to: s.a, min: lo, max: hi, text: id };
	});
}

describe("temporal fixture corpus (no model involved)", () => {
	it("has the cases the design lists", () => {
		expect(files.length).toBeGreaterThanOrEqual(10);
	});
	for (const file of files) {
		const f = JSON.parse(readFileSync(join(DIR, file), "utf8")) as Fixture;
		it(`${file.replace(".json", "")}: ${f.description}`, () => {
			if (f.expect.refused) {
				expect(() => compile(f.statements)).toThrow(/months and years/);
				return;
			}
			const r = solve(f.points, compile(f.statements));
			expect(r.conflict !== null).toBe(f.expect.conflict ?? false);
			if (f.expect.conflictIds) expect(r.conflict?.map((c) => c.id).sort()).toEqual(f.expect.conflictIds);
			if (f.expect.before) expect(r.before.map((p) => [...p]).sort()).toEqual([...f.expect.before].sort());
			if (f.expect.unordered) expect(r.unordered.map((p) => [...p]).sort()).toEqual([...f.expect.unordered].sort());
			for (const [point, text] of Object.entries(f.expect.span ?? {})) {
				const b = r.bounds.get(point) as { lo: number; hi: number };
				expect(describeSpan(b.lo, b.hi), point).toBe(text);
			}
			if (f.expect.before === undefined && f.expect.conflict !== true && f.expect.span === undefined) expect(r.before).toEqual([]);
		});
	}
});
