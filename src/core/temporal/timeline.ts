import { MANAGED_FOLDER, type Book } from "../books";
import { readingOrder, type Chapter } from "../chapters";
import { isId, newId, type RandomPort } from "../ids";
import { ManagedNoteError, parseManagedNote, serializeManagedNote } from "../managed-note";
import type { VaultPort } from "../ports";
import { CalendarError, describeSpan, formatSeconds, parseDuration, toInterval, type CivilTime } from "./calendar";
import { ORIGIN, solve, type TimeConstraint } from "./solver";

const SCHEMA = 1;
const eventsPrefix = (book: Book): string => `${book.folder}/${MANAGED_FOLDER}/timeline/events/`;
const constraintsPrefix = (book: Book): string => `${book.folder}/${MANAGED_FOLDER}/timeline/constraints/`;

/** Something that happens in the story. Identity is the id; the label is a description the author can change. */
export interface TimelineEvent {
	id: string;
	label: string;
	/** The chapter where the book tells it (its first telling); null when unknown. Reading order, not world time. */
	chapterId: string | null;
	retired: boolean;
	path: string;
}

/** One statement about time, kept as the author gave it. Retiring it retracts everything derived from it. */
export interface StoredConstraint extends TimeConstraint {
	retired: boolean;
	path: string;
	/** Where the text itself says this, when the statement came from the chapter rather than from the author's own knowledge. */
	evidence?: { chapterId: string; quote: string };
}

const clean = (s: string): string => s.replace(/\s+/g, " ").trim();
const num = (v: unknown, empty: number): number => (v === null || v === undefined ? empty : (v as number));

export async function loadTimeline(vault: VaultPort, book: Book): Promise<{ events: TimelineEvent[]; constraints: StoredConstraint[]; problems: string[] }> {
	const events: TimelineEvent[] = [];
	const constraints: StoredConstraint[] = [];
	const problems: string[] = [];
	const seen = new Map<string, string>();
	for (const path of vault.markdownPaths().filter((p) => p.startsWith(eventsPrefix(book)) || p.startsWith(constraintsPrefix(book))).sort()) {
		try {
			const { frontmatter: fm } = parseManagedNote(await vault.read(path));
			if (fm.bh_schema > SCHEMA) throw new ManagedNoteError("Written by a newer Book Harness; update the plugin.");
			if (fm.bh_book !== book.id) throw new ManagedNoteError("This record belongs to a different book.");
			const first = seen.get(fm.bh_id);
			if (first !== undefined) {
				problems.push(`${path}: Duplicate id, also used by ${first}. Is this a sync conflict copy?`);
				continue;
			}
			seen.set(fm.bh_id, path);
			if (fm.bh_type === "event" && isId(fm.bh_id, "ev") && typeof fm.label === "string") events.push({ id: fm.bh_id, label: fm.label, chapterId: isId(fm.chapter, "ch") ? fm.chapter : null, retired: fm.retired === true, path });
			else if (fm.bh_type === "time-constraint" && isId(fm.bh_id, "tc") && typeof fm.from === "string" && typeof fm.to === "string" && typeof fm.text === "string") constraints.push({ id: fm.bh_id, from: fm.from, to: fm.to, min: num(fm.min_s, -Infinity), max: num(fm.max_s, Infinity), text: fm.text, retired: fm.retired === true, path, ...(isId(fm.evidence_chapter, "ch") && typeof fm.evidence_quote === "string" ? { evidence: { chapterId: fm.evidence_chapter, quote: fm.evidence_quote } } : {}) });
			else throw new ManagedNoteError("This is not a timeline record.");
		} catch (e) {
			problems.push(`${path}: ${e instanceof ManagedNoteError ? e.message : String(e)}`);
		}
	}
	return { events, constraints, problems };
}

function renderEvent(book: Book, e: Omit<TimelineEvent, "path">): string {
	return serializeManagedNote({ frontmatter: { bh_schema: SCHEMA, bh_type: "event", bh_id: e.id, bh_book: book.id, label: e.label, chapter: e.chapterId, retired: e.retired }, body: `# ${e.label}\n` });
}

function renderConstraint(book: Book, c: Omit<StoredConstraint, "path">): string {
	const bound = (v: number): number | null => (Number.isFinite(v) ? v : null);
	return serializeManagedNote({ frontmatter: { bh_schema: SCHEMA, bh_type: "time-constraint", bh_id: c.id, bh_book: book.id, from: c.from, to: c.to, min_s: bound(c.min), max_s: bound(c.max), text: c.text, retired: c.retired, ...(c.evidence ? { evidence_chapter: c.evidence.chapterId, evidence_quote: c.evidence.quote } : {}) }, body: `${c.text}\n` });
}

export async function addEvent(vault: VaultPort, book: Book, existing: readonly TimelineEvent[], label: string, chapterId: string | null, random: RandomPort): Promise<TimelineEvent> {
	const text = clean(label);
	if (text === "") throw new Error("An event needs a name.");
	if (existing.some((e) => !e.retired && e.label.toLowerCase() === text.toLowerCase())) throw new Error(`There is already an event called "${text}".`);
	const id = newId("ev", random);
	const event: TimelineEvent = { id, label: text, chapterId, retired: false, path: `${eventsPrefix(book)}${id}.md` };
	await vault.create(event.path, renderEvent(book, event));
	return event;
}

export async function addConstraint(vault: VaultPort, book: Book, c: Omit<StoredConstraint, "id" | "path" | "retired">, random: RandomPort): Promise<StoredConstraint> {
	const id = newId("tc", random);
	const stored: StoredConstraint = { ...c, id, retired: false, path: `${constraintsPrefix(book)}${id}.md` };
	await vault.create(stored.path, renderConstraint(book, stored));
	return stored;
}

/** The author says: a happens before b. No distance is claimed. */
export const addBefore = async (vault: VaultPort, book: Book, a: TimelineEvent, b: TimelineEvent, random: RandomPort, evidence?: StoredConstraint["evidence"]): Promise<StoredConstraint> => {
	if (a.id === b.id) throw new Error("An event cannot happen before itself.");
	return addConstraint(vault, book, { from: a.id, to: b.id, min: 1, max: Infinity, text: `${a.label} happens before ${b.label}`, evidence }, random);
};

/** The author says: b happens `duration` after a ("3 days"). Months and years are refused because they vary in length. */
export async function addAfterBy(vault: VaultPort, book: Book, a: TimelineEvent, b: TimelineEvent, duration: string, random: RandomPort, evidence?: StoredConstraint["evidence"]): Promise<StoredConstraint> {
	if (a.id === b.id) throw new Error("An event cannot be after itself.");
	const secs = parseDuration(duration);
	return addConstraint(vault, book, { from: a.id, to: b.id, min: secs, max: secs, text: `${b.label} happens ${clean(duration)} after ${a.label}`, evidence }, random);
}

export const addSimultaneous = async (vault: VaultPort, book: Book, a: TimelineEvent, b: TimelineEvent, random: RandomPort, evidence?: StoredConstraint["evidence"]): Promise<StoredConstraint> => {
	if (a.id === b.id) throw new Error("An event is already at the same time as itself.");
	return addConstraint(vault, book, { from: a.id, to: b.id, min: 0, max: 0, text: `${a.label} and ${b.label} happen at the same time`, evidence }, random);
};

/** The author gives a date, as precise as they know it ("1923" stays a whole year). */
export async function addDate(vault: VaultPort, book: Book, e: TimelineEvent, when: CivilTime, random: RandomPort, evidence?: StoredConstraint["evidence"]): Promise<StoredConstraint> {
	const [lo, hi] = toInterval(when);
	const label = [when.year, when.month, when.day].filter((x) => x !== undefined).map((x, i) => (i === 0 ? String(x) : String(x).padStart(2, "0"))).join("-");
	return addConstraint(vault, book, { from: ORIGIN, to: e.id, min: lo, max: hi, text: `${e.label} happens in ${label}`, evidence }, random);
}

async function setRetired(vault: VaultPort, path: string, render: (retired: boolean) => string): Promise<void> {
	const before = await vault.read(path);
	if (!(await vault.replaceIfUnchanged(path, before, render(true)))) throw new Error("That record changed on another device; try again.");
}

export const retireConstraint = (vault: VaultPort, book: Book, c: StoredConstraint) => setRetired(vault, c.path, (retired) => renderConstraint(book, { ...c, retired }));
export const retireEvent = (vault: VaultPort, book: Book, e: TimelineEvent) => setRetired(vault, e.path, (retired) => renderEvent(book, { ...e, retired }));

export interface TimelineRow {
	id: string;
	label: string;
	chapter: string | null;
	/** What the evidence allows, as text; null when nothing limits it. */
	when: string | null;
	definite: boolean;
	/** The statements this date or range was calculated from. */
	because: string[];
	/** Events that certainly come directly before this one. */
	after: string[];
}

/** "1923", "1923-10" or "1923-10-31" (a leading minus is a year before 1). Anything finer is not offered yet. */
export function parseCivil(text: string): CivilTime {
	const m = /^\s*(-?\d{1,6})(?:-(\d{1,2}))?(?:-(\d{1,2}))?\s*$/.exec(text);
	if (!m) throw new CalendarError(`"${text}" is not a date. Write a year (1923), a month (1923-10) or a day (1923-10-31).`);
	return { year: Number(m[1]), ...(m[2] === undefined ? {} : { month: Number(m[2]) }), ...(m[3] === undefined ? {} : { day: Number(m[3]) }) };
}

export interface TimelineView {
	/** In the order the book tells it: chapter reading order, then the author's labels. A telling order, not a time order. */
	narrative: TimelineRow[];
	/** Only what the evidence settles. Events not linked by evidence have no order and are listed apart. */
	world: TimelineRow[];
	unordered: Array<[string, string]>;
	conflict: string[] | null;
	/** The author's statements about time that count right now, so each can be removed. */
	statements: Array<{ id: string; text: string; quote: string | null }>;
}

function whenText(lo: number, hi: number): string | null {
	if (lo === -Infinity && hi === Infinity) return null;
	if (lo === hi) return formatSeconds(lo);
	if (lo === -Infinity) return `before ${formatSeconds(hi)}`;
	if (hi === Infinity) return `after ${formatSeconds(lo)}`;
	return describeSpan(lo, hi);
}

/** Everything is recomputed from the current statements, so retiring one retracts what followed from it. */
export function buildTimeline(events: readonly TimelineEvent[], constraints: readonly StoredConstraint[], chapters: readonly Chapter[]): TimelineView {
	const active = events.filter((e) => !e.retired);
	const ids = new Set(active.map((e) => e.id));
	const live = constraints.filter((c) => !c.retired && (c.from === ORIGIN || ids.has(c.from)) && ids.has(c.to));
	const result = solve(active.map((e) => e.id), live);
	const label = new Map(active.map((e) => [e.id, e.label] as const));
	const order = new Map(readingOrder(chapters).map((c, i) => [c.id, i] as const));
	const design = new Map(chapters.map((c) => [c.id, c.designation] as const));
	const texts = new Map(live.map((c) => [c.id, c.text] as const));
	const row = (e: TimelineEvent): TimelineRow => {
		const b = result.bounds.get(e.id);
		return {
			id: e.id,
			label: e.label,
			chapter: e.chapterId === null ? null : design.get(e.chapterId) ?? null,
			when: b ? whenText(b.lo, b.hi) : null,
			definite: result.definite.has(e.id),
			because: (result.support.get(e.id) ?? []).map((id) => texts.get(id) as string),
			after: result.before.filter(([, to]) => to === e.id).map(([from]) => label.get(from) as string),
		};
	};
	const rank = (e: TimelineEvent): number => (e.chapterId === null ? Infinity : order.get(e.chapterId) ?? Infinity);
	const narrative = [...active].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label)).map(row);
	// world list: events the evidence orders come in that order; the rest follow, with no order claimed between them
	const rows = new Map(active.map((e) => [e.id, row(e)] as const));
	const world: TimelineRow[] = [];
	const placed = new Set<string>();
	const pending = new Set(result.conflict ? [] : active.map((e) => e.id));
	while (pending.size > 0) {
		const next = [...pending].filter((id) => result.before.every(([from, to]) => to !== id || placed.has(from))).sort((a, b) => (label.get(a) as string).localeCompare(label.get(b) as string));
		for (const id of next) {
			world.push(rows.get(id) as TimelineRow);
			placed.add(id);
			pending.delete(id);
		}
	}
	return { narrative, world, unordered: result.unordered.map(([a, b]) => [label.get(a) as string, label.get(b) as string]), conflict: result.conflict ? result.conflict.map((c) => texts.get(c.id) as string) : null, statements: live.map((c) => ({ id: c.id, text: c.text, quote: c.evidence?.quote ?? null })) };
}
