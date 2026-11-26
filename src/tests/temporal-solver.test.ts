import { describe, expect, it } from "vitest";
import { CalendarError, DAY, civilFromDays, daysFromCivil, formatSeconds, parseDuration, precisionOf, toInterval } from "../core/temporal/calendar";
import { describeSpan } from "../core/temporal/calendar";
import { ORIGIN, solve, type TimeConstraint } from "../core/temporal/solver";

const before = (id: string, a: string, b: string): TimeConstraint => ({ id, from: a, to: b, min: 1, max: Infinity, text: `${a} before ${b}` });
const offset = (id: string, a: string, b: string, secs: number): TimeConstraint => ({ id, from: a, to: b, min: secs, max: secs, text: `${b} is ${secs}s after ${a}` });
const anchor = (id: string, p: string, lo: number, hi: number): TimeConstraint => ({ id, from: ORIGIN, to: p, min: lo, max: hi, text: `${p} at ${lo}` });

describe("solver (AC-T-1..3)", () => {
	const A = "A", B = "B", C = "C";
	const rel = [before("c1", A, B), offset("c2", B, C, 3 * DAY)];

	it("keeps order from relative evidence without any date", () => {
		const r = solve([A, B, C], rel);
		expect(r.conflict).toBeNull();
		expect(r.before).toEqual([[A, B], [B, C]]);
		expect(r.definite.size).toBe(0);
		expect(r.bounds.get(A)).toEqual({ lo: -Infinity, hi: Infinity });
	});
	it("derives dates when an anchor is added and retracts them when it is removed", () => {
		const day = 20_000 * DAY;
		const withAnchor = solve([A, B, C], [...rel, anchor("c3", B, day, day)]);
		expect(withAnchor.definite.has(C)).toBe(true);
		expect(withAnchor.bounds.get(C)).toEqual({ lo: day + 3 * DAY, hi: day + 3 * DAY });
		expect(withAnchor.support.get(C)).toEqual(expect.arrayContaining(["c2", "c3"]));
		const without = solve([A, B, C], rel);
		expect(without.definite.has(C)).toBe(false);
		expect(without.bounds.get(C)).toEqual({ lo: -Infinity, hi: Infinity });
	});
	it("reports a contradiction with the constraints that cause it", () => {
		const r = solve([A, B, C], [...rel, before("c4", C, A)]);
		expect(r.conflict?.map((c) => c.id).sort()).toEqual(["c1", "c2", "c4"]);
		expect(r.before).toEqual([]);
		const anchors = solve([A, B], [anchor("x", A, 100, 100), anchor("y", B, 50, 50), before("z", A, B)]);
		expect(anchors.conflict).not.toBeNull();
	});
	it("gives unrelated events no order and treats equal times as simultaneous, not ordered", () => {
		const r = solve([A, B, C], [before("c1", A, B)]);
		expect(r.unordered).toEqual([[A, C], [B, C]]);
		const same = solve([A, B], [{ id: "s", from: A, to: B, min: 0, max: 0, text: "same time" }]);
		expect(same.before).toEqual([]);
		expect(same.unordered).toEqual([]);
	});
	it("keeps a year-only date as a range and does not order overlapping ranges", () => {
		const [lo, hi] = toInterval({ year: 1923 });
		const r = solve([A, B], [anchor("a", A, lo, hi), anchor("b", B, lo, hi)]);
		expect(r.definite.size).toBe(0);
		expect(r.unordered).toEqual([[A, B]]);
		const [l2, h2] = toInterval({ year: 1924 });
		expect(solve([A, B], [anchor("a", A, lo, hi), anchor("b", B, l2, h2)]).before).toEqual([[A, B]]);
	});
	it("ignores constraints that name unknown points and the origin as a listed point", () => {
		const r = solve([A, ORIGIN], [before("c1", A, "missing")]);
		expect(r.bounds.get(A)).toEqual({ lo: -Infinity, hi: Infinity });
	});
	it("keeps the tighter of two constraints on the same pair and reports a constraint that contradicts itself once", () => {
		const loose = { id: "loose", from: A, to: B, min: 1, max: 100, text: "loose" };
		const tight = { id: "tight", from: A, to: B, min: 1, max: 10, text: "tight" };
		const r = solve([A, B], [tight, loose, anchor("z", A, 0, 0)]);
		expect(r.bounds.get(B)).toEqual({ lo: 1, hi: 10 });
		const mixed = solve([A, B], [loose, tight]);
		expect(mixed.conflict).toBeNull();
		const self = solve([A, B], [{ id: "bad", from: A, to: B, min: 5, max: 3, text: "bad" }]);
		expect(self.conflict?.map((c) => c.id)).toEqual(["bad"]);
	});
	it("handles a longer chain with a transitive reduction", () => {
		const r = solve([A, B, C], [before("1", A, B), before("2", B, C), before("3", A, C)]);
		expect(r.before).toEqual([[A, B], [B, C]]);
	});
	it("returns a cycle through one-sided bounds (upper only)", () => {
		const r = solve([A, B], [{ id: "u", from: A, to: B, min: -Infinity, max: -5, text: "u" }, { id: "v", from: B, to: A, min: -Infinity, max: -5, text: "v" }]);
		expect(r.conflict).toHaveLength(2);
	});
});

describe("calendar", () => {
	it("round-trips days and civil dates, including before year 1", () => {
		for (const [y, m, d] of [[1970, 1, 1], [2024, 2, 29], [1, 1, 1], [0, 12, 31], [-500, 3, 4]] as const) {
			expect(civilFromDays(daysFromCivil(y, m, d))).toEqual({ year: y, month: m, day: d });
		}
		expect(daysFromCivil(1970, 1, 1)).toBe(0);
	});
	it("keeps precision and rejects impossible dates", () => {
		expect(precisionOf({ year: 1 })).toBe("year");
		expect(precisionOf({ year: 1, month: 2 })).toBe("month");
		expect(precisionOf({ year: 1, month: 2, day: 3 })).toBe("day");
		expect(precisionOf({ year: 1, month: 2, day: 3, hour: 4 })).toBe("hour");
		expect(precisionOf({ year: 1, month: 2, day: 3, hour: 4, minute: 5 })).toBe("minute");
		expect(precisionOf({ year: 1, month: 2, day: 3, hour: 4, minute: 5, second: 6 })).toBe("second");
		const [a, b] = toInterval({ year: 2024, month: 2 });
		expect((b - a + 1) / DAY).toBe(29);
		expect(toInterval({ year: 2024, month: 2, day: 3, hour: 4, minute: 5, second: 6 })[0]).toBe(toInterval({ year: 2024, month: 2, day: 3, hour: 4, minute: 5, second: 6 })[1]);
		expect(toInterval({ year: 2024 })[1] - toInterval({ year: 2024 })[0] + 1).toBe(366 * DAY);
		for (const bad of [{ year: 1.5 }, { year: 1, month: 13 }, { year: 2023, month: 2, day: 29 }, { year: 1, month: 1, day: 1, hour: 24 }, { year: 1, month: 1, day: 1, hour: 1, minute: 60 }, { year: 1, month: 1, day: 1, hour: 1, minute: 1, second: 60 }]) {
			expect(() => toInterval(bad)).toThrow(CalendarError);
		}
	});
	it("describes spans by what they cover", () => {
		expect(describeSpan(5, 5)).toBe("1970-01-01 00:00:05");
		expect(describeSpan(0, DAY - 1)).toBe("1970-01-01");
		expect(describeSpan(0, 31 * DAY - 1)).toBe("1970-01");
		expect(describeSpan(0, 365 * DAY - 1)).toBe("1970");
		expect(describeSpan(daysFromCivil(1972, 1, 1) * DAY, daysFromCivil(1973, 1, 1) * DAY - 1)).toBe("1972");
		expect(describeSpan(0, 40 * DAY - 1)).toBe("1970-01-01 to 1970-02-09 23:59:59");
		expect(describeSpan(10, 20)).toBe("1970-01-01 00:00:10 to 1970-01-01 00:00:20");
		expect(describeSpan(daysFromCivil(-3, 1, 1) * DAY, daysFromCivil(-3, 1, 2) * DAY - 1)).toBe("-0003-01-01");
	});
	it("formats and parses", () => {
		expect(formatSeconds(0)).toBe("1970-01-01");
		expect(formatSeconds(3661)).toBe("1970-01-01 01:01:01");
		expect(formatSeconds(daysFromCivil(-5, 1, 1) * DAY)).toBe("-0005-01-01");
		expect(parseDuration("3 days")).toBe(3 * DAY);
		expect(parseDuration("2 weeks")).toBe(14 * DAY);
		expect(parseDuration("1.5 hours")).toBe(5400);
		expect(() => parseDuration("3 months")).toThrow(CalendarError);
		expect(() => parseDuration("soon")).toThrow(CalendarError);
	});
});
