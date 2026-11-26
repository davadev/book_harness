import type { StoredConstraint } from "../core/temporal/timeline";
import { describe, expect, it } from "vitest";
import { registerBook } from "../core/books";
import type { Chapter } from "../core/chapters";
import { GuardedVault } from "../core/guarded-vault";
import { parseCivil, addAfterBy, addBefore, addDate, addEvent, addSimultaneous, buildTimeline, loadTimeline, retireConstraint, retireEvent } from "../core/temporal/timeline";
import { FakeVault, counterRandom } from "./__mocks__/fakeVault";

async function setup() {
	const raw = new FakeVault();
	const vault = new GuardedVault(raw);
	const random = counterRandom();
	const book = await registerBook(vault, "Book", "Book", "en", random);
	return { raw, vault, book, random };
}
const chapter = (id: string, order: number, designation: string): Chapter => ({ id, bookId: "b", designation, order, status: "draft", notePath: null, path: `${id}.md` }) as unknown as Chapter;

describe("timeline store and view", () => {
	it("keeps relative order without dates, derives dates from an anchor, retracts them when retired (AC-T-1..3)", async () => {
		const { vault, book, random } = await setup();
		const a = await addEvent(vault, book, [], "The lamp goes out", null, random);
		const b = await addEvent(vault, book, [a], "The door opens", null, random);
		const c = await addEvent(vault, book, [a, b], "Tomas arrives", null, random);
		await addBefore(vault, book, a, b, random);
		await addAfterBy(vault, book, b, c, "3 days", random);
		let { events, constraints, problems } = await loadTimeline(vault, book);
		expect(problems).toEqual([]);
		let view = buildTimeline(events, constraints, []);
		expect(view.world.map((r) => r.label)).toEqual(["The lamp goes out", "The door opens", "Tomas arrives"]);
		expect(view.world.every((r) => r.when === null)).toBe(true);
		expect(view.world[2]?.after).toEqual(["The door opens"]);

		const anchor = await addDate(vault, book, b, { year: 1923, month: 10, day: 31 }, random);
		({ events, constraints } = await loadTimeline(vault, book));
		view = buildTimeline(events, constraints, []);
		expect(view.world.map((r) => r.when)).toEqual(["before 1923-10-31 23:59:58", "1923-10-31", "1923-11-03"]);
		expect(view.world[2]?.definite).toBe(false); // a day is a range, not an exact moment
		expect(view.world[2]?.because).toEqual(expect.arrayContaining([anchor.text]));

		await retireConstraint(vault, book, anchor);
		({ events, constraints } = await loadTimeline(vault, book));
		expect(buildTimeline(events, constraints, []).world.every((r) => r.when === null)).toBe(true);
	});

	it("shows a contradiction with the statements behind it and no invented order", async () => {
		const { vault, book, random } = await setup();
		const a = await addEvent(vault, book, [], "A", null, random);
		const b = await addEvent(vault, book, [a], "B", null, random);
		await addBefore(vault, book, a, b, random);
		await addBefore(vault, book, b, a, random);
		const { events, constraints } = await loadTimeline(vault, book);
		const view = buildTimeline(events, constraints, []);
		expect(view.conflict).toHaveLength(2);
		expect(view.world).toEqual([]);
		expect(view.narrative).toHaveLength(2);
	});

	it("orders the narrative by chapter, lists unrelated events as unordered, and handles simultaneous and year-only dates", async () => {
		const { vault, book, random } = await setup();
		const chapters = [chapter("ch_aaaaaaaaaaaaaaaa", 1, "Chapter 1"), chapter("ch_bbbbbbbbbbbbbbbb", 2, "Chapter 2")];
		const a = await addEvent(vault, book, [], "Flash", "ch_bbbbbbbbbbbbbbbb", random);
		const b = await addEvent(vault, book, [a], "Present", "ch_aaaaaaaaaaaaaaaa", random);
		const c = await addEvent(vault, book, [a, b], "Loose", null, random);
		const d = await addEvent(vault, book, [a, b, c], "Gone", "ch_cccccccccccccccc", random);
		await addDate(vault, book, a, { year: 1913 }, random);
		await addDate(vault, book, b, { year: 1923, month: 10 }, random);
		await addSimultaneous(vault, book, b, d, random);
		const { events, constraints } = await loadTimeline(vault, book);
		const view = buildTimeline(events, constraints, chapters);
		expect(view.narrative.map((r) => r.label)).toEqual(["Present", "Flash", "Gone", "Loose"]);
		expect(view.narrative[0]?.chapter).toBe("Chapter 1");
		expect(view.narrative[2]?.chapter).toBeNull();
		expect(view.world.find((r) => r.label === "Flash")?.when).toBe("1913");
		expect(view.world.find((r) => r.label === "Present")?.when).toBe("1923-10");
		expect(view.world.find((r) => r.label === "Loose")?.when).toBeNull();
		expect(view.unordered.length).toBeGreaterThan(0);
	});

	it("retired events and their statements drop out; duplicates, bad records and newer schemas are reported", async () => {
		const { raw, vault, book, random } = await setup();
		const a = await addEvent(vault, book, [], "A", null, random);
		const b = await addEvent(vault, book, [a], "B", null, random);
		await addBefore(vault, book, a, b, random);
		await retireEvent(vault, book, b);
		let t = await loadTimeline(vault, book);
		expect(buildTimeline(t.events, t.constraints, []).world.map((r) => r.label)).toEqual(["A"]);
		await expect(addEvent(vault, book, t.events, " a ", null, random)).rejects.toThrow(/already an event/);
		await addEvent(vault, book, t.events, "B", null, random); // a retired name can be reused
		await expect(addEvent(vault, book, [], "  ", null, random)).rejects.toThrow(/needs a name/);

		const aPath = a.path;
		raw.files.set(aPath.replace(a.id, "ev_copyofa22222222"), raw.files.get(aPath)!);
		raw.files.set(aPath.replace(a.id, "ev_zzzzzzzzzzzzzzzz"), raw.files.get(aPath)!.replace("bh_schema: 1", "bh_schema: 9"));
		raw.files.set(aPath.replace(a.id, "ev_yyyyyyyyyyyyyyyy"), raw.files.get(aPath)!.replace(/bh_book: .*/, "bh_book: bk_other"));
		raw.files.set(aPath.replace(a.id, "ev_xxxxxxxxxxxxxxxx"), raw.files.get(aPath)!.replace("bh_type: event", "bh_type: weird").replace(a.id, "ev_xxxxxxxxxxxxxxxx"));
		raw.files.set(aPath.replace(a.id, "ev_wwwwwwwwwwwwwwww"), "not a note");
		t = await loadTimeline(vault, book);
		expect(t.problems.join("\n")).toMatch(/newer Book Harness/);
		expect(t.problems.join("\n")).toMatch(/different book/);
		expect(t.problems.join("\n")).toMatch(/not a timeline record/);
		expect(t.problems.join("\n")).toMatch(/Frontmatter|frontmatter/);
	});

	it("refuses self-relations, months as durations, bad dates and concurrent edits", async () => {
		const { raw, vault, book, random } = await setup();
		const a = await addEvent(vault, book, [], "A", null, random);
		const b = await addEvent(vault, book, [a], "B", null, random);
		await expect(addBefore(vault, book, a, a, random)).rejects.toThrow(/before itself/);
		await expect(addAfterBy(vault, book, a, a, "1 day", random)).rejects.toThrow(/after itself/);
		await expect(addSimultaneous(vault, book, a, a, random)).rejects.toThrow(/itself/);
		await expect(addAfterBy(vault, book, a, b, "2 months", random)).rejects.toThrow(/months and years/);
		await expect(addDate(vault, book, a, { year: 2023, month: 2, day: 30 }, random)).rejects.toThrow();
		raw.replaceIfUnchanged = () => Promise.resolve(false);
		await expect(retireEvent(vault, book, a)).rejects.toThrow(/another device/);
	});
});

describe("timeline details", () => {
	it("parses dates by precision and refuses everything else", () => {
		expect(parseCivil("1923")).toEqual({ year: 1923 });
		expect(parseCivil(" 1923-10 ")).toEqual({ year: 1923, month: 10 });
		expect(parseCivil("-0005-03-04")).toEqual({ year: -5, month: 3, day: 4 });
		expect(() => parseCivil("last spring")).toThrow(/not a date/);
	});
	it("words exact moments and open-ended ranges, and reports a record that cannot be read", async () => {
		const { raw, vault, book, random } = await setup();
		const a = await addEvent(vault, book, [], "A", null, random);
		const b = await addEvent(vault, book, [a], "B", null, random);
		const c = (id: string, from: string, to: string, min: number, max: number): StoredConstraint => ({ id, from, to, min, max, text: id, retired: false, path: id });
		const view = buildTimeline([a, b], [c("exact", "Z", a.id, 100, 100), c("later", a.id, b.id, 1, Infinity)], []);
		expect(view.world.map((r) => r.when)).toEqual(["1970-01-01 00:01:40", "after 1970-01-01 00:01:41"]);
		expect(view.world[0]?.definite).toBe(true);
		const boom = new Error("disk");
		const failing = Object.create(raw) as typeof raw;
		failing.read = (p: string) => (p === a.path ? Promise.reject(boom) : raw.read(p));
		const t = await loadTimeline(new GuardedVault(failing), book);
		expect(t.problems.join()).toContain("Error: disk");
	});
});
