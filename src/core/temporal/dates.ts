import { daysFromCivil, daysInMonth } from "./calendar";

/**
 * Dates a chapter states outright, found by code, never by a model: "the eleventh of March, 2091", "14 March 2091",
 * "March 14, 2091", "14. März 2091", "14. března 2091", "2091-03-14", "14.3.2091", and a year after a word such as "in".
 * A date without a year is not guessed. English, German, Czech and Slovak month names are known.
 */
export interface FoundDate {
	/** "2091", "2091-03" or "2091-03-14": what parseCivil accepts. */
	date: string;
	/** The sentence the date stands in, copied from the text word for word. */
	quote: string;
	/** Set when the text names a weekday that this date does not have in the Gregorian calendar. */
	warning?: string;
}

const MONTHS: Record<string, number> = {};
const add = (m: number, ...names: string[]): void => names.forEach((n) => (MONTHS[n] = m));
add(1, "january", "jan", "januar", "jänner", "ledna", "leden", "januára", "január");
add(2, "february", "feb", "februar", "února", "únor", "februára", "február");
add(3, "march", "mar", "märz", "marz", "března", "březen", "marca", "marec");
add(4, "april", "apr", "dubna", "duben", "apríla", "apríl");
add(5, "may", "mai", "května", "květen", "mája", "máj");
add(6, "june", "jun", "juni", "června", "červen", "júna", "jún");
add(7, "july", "jul", "juli", "července", "červenec", "júla", "júl");
add(8, "august", "aug", "srpna", "srpen", "augusta");
add(9, "september", "sep", "sept", "září", "septembra");
add(10, "october", "oct", "oktober", "října", "říjen", "októbra", "október");
add(11, "november", "nov", "listopadu", "listopad", "novembra");
add(12, "december", "dec", "dezember", "prosince", "prosinec", "decembra");

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth"];
const TENS: Record<string, number> = { twenty: 20, thirty: 30 };
const UNITS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth"];

/** "fourteenth", "twenty-first", "31st", "14." or "14" as a day number; null for anything else. */
function dayNumber(word: string): number | null {
	const w = word.toLowerCase().replace(/[\s‐-―]+/g, "-");
	const digits = /^(\d{1,2})(?:st|nd|rd|th|\.)?$/.exec(w);
	if (digits) return Number(digits[1]);
	const simple = ORDINALS.indexOf(w);
	if (simple >= 0) return simple + 1;
	const [tens, unit] = w.split("-");
	if (unit !== undefined && TENS[tens] !== undefined && UNITS.includes(unit)) return TENS[tens] + UNITS.indexOf(unit) + 1;
	return w === "thirtieth" ? 30 : null;
}

const WEEKDAYS: Record<string, number> = {};
const day = (n: number, ...names: string[]): void => names.forEach((x) => (WEEKDAYS[x] = n));
day(0, "sunday", "sonntag", "neděle", "nedeli", "nedeľa", "nedeľu");
day(1, "monday", "montag", "pondělí", "pondelok");
day(2, "tuesday", "dienstag", "úterý", "utorok");
day(3, "wednesday", "mittwoch", "středa", "středu", "streda", "stredu");
day(4, "thursday", "donnerstag", "čtvrtek", "štvrtok");
day(5, "friday", "freitag", "pátek", "piatok");
day(6, "saturday", "samstag", "sonnabend", "sobota", "sobotu");
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The weekday word standing just before a date ("Friday, the fourteenth of March, 2091"), if any. */
function weekdayBefore(text: string, at: number): number | null {
	const m = /(\p{L}+)[,\s]+(?:the\s+|am\s+|dne\s+|dňa\s+)?$/iu.exec(text.slice(Math.max(0, at - 30), at));
	return m === null ? null : WEEKDAYS[m[1].toLowerCase()] ?? null;
}

const MONTH_WORD = "(\\p{L}+)\\.?";
const DAY_WORD = "(\\d{1,2}(?:st|nd|rd|th)?\\.?|(?:twenty|thirty)[\\s-]+(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)|[a-z]+th|first|second|third)";
const YEAR = "(-?\\d{3,4})";
const FORMS: Array<{ re: RegExp; pick: (m: RegExpExecArray) => { day: string | null; month: string; year: string } }> = [
	// 14 March 2091, the fourteenth of March, 2091, 14. März 2091
	{ re: new RegExp(`${DAY_WORD}\\s+(?:of\\s+)?${MONTH_WORD}[,\\s]+${YEAR}(?!\\d)`, "giu"), pick: (m) => ({ day: m[1], month: m[2], year: m[3] }) },
	// March 14, 2091
	{ re: new RegExp(`${MONTH_WORD}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+${YEAR}(?!\\d)`, "giu"), pick: (m) => ({ day: m[2], month: m[1], year: m[3] }) },
	// March 2091
	{ re: new RegExp(`${MONTH_WORD}[,\\s]+${YEAR}(?!\\d)`, "giu"), pick: (m) => ({ day: null, month: m[1], year: m[2] }) },
];
const NUMERIC = /(?:^|[^\d])(\d{4})-(\d{2})-(\d{2})(?!\d)|(?:^|[^\d])(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})(?!\d)/g;
const YEAR_AFTER_WORD = /\b(?:in|of|since|until|by|year|im Jahr|seit|roce|roku)\s+(\d{4})(?!\d)/gi;

/** All matches of a global pattern (String.matchAll is newer than the supported baseline). */
function matches(re: RegExp, text: string): RegExpExecArray[] {
	const out: RegExpExecArray[] = [];
	re.lastIndex = 0;
	for (let m = re.exec(text); m !== null; m = re.exec(text)) out.push(m);
	return out;
}

const isEnd = (s: string, i: number): boolean => /[.!?]/.test(s[i] ?? "") && /\s/.test(s[i + 1] ?? " ");

/** The sentence around [from, to): up to the previous and the next sentence end or paragraph break, trimmed. */
function sentenceAround(text: string, from: number, to: number): string {
	let a = from;
	while (a > 0 && text[a - 1] !== "\n" && !isEnd(text, a - 2)) a--;
	let b = to;
	while (b < text.length && text[b] !== "\n" && !isEnd(text, b)) b++;
	return text.slice(a, Math.min(b + 1, text.length)).trim();
}

function iso(year: number, month: number, day: number | null): string | null {
	if (day === null) return `${year}-${String(month).padStart(2, "0")}`;
	return day >= 1 && day <= daysInMonth(year, month) ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
}

/** Every stated date in the text, once per (date, sentence), in reading order. */
export function findDates(text: string): FoundDate[] {
	// A reading that is only part of a longer one ("March 2091" inside "14 March 2091") is not a second date; an impossible
	// day ("31 February 2020") is kept as a blocker with no date, so its month is not offered instead.
	const hits: Array<{ at: number; end: number; date: string | null; quote: string; warning?: string }> = [];
	const push = (at: number, end: number, date: string | null): void => {
		const hit: (typeof hits)[number] = { at, end, date, quote: sentenceAround(text, at, end) };
		const stated = weekdayBefore(text, at);
		if (date !== null && date.length === 10 && stated !== null) {
			const [y, mo, d] = date.split("-").map(Number);
			const actual = (((daysFromCivil(y, mo, d) + 4) % 7) + 7) % 7;
			if (actual !== stated) hit.warning = `The text says ${WEEKDAY_NAMES[stated]}, but ${date} is a ${WEEKDAY_NAMES[actual]} in the Gregorian calendar. Ignore this if your story uses its own calendar.`;
		}
		hits.push(hit);
	};
	for (const { re, pick } of FORMS) {
		for (const m of matches(re, text)) {
			const { day, month, year } = pick(m);
			const monthNumber = MONTHS[month.toLowerCase()];
			const dayValue = day === null ? null : dayNumber(day);
			if (monthNumber === undefined || (day !== null && dayValue === null)) continue;
			push(m.index, m.index + m[0].length, iso(Number(year), monthNumber, dayValue));
		}
	}
	for (const m of matches(NUMERIC, text)) {
		const [y, mo, d] = m[1] !== undefined ? [m[1], m[2], m[3]] : [m[6], m[5], m[4]];
		const month = Number(mo);
		if (month >= 1 && month <= 12) push(m.index, m.index + m[0].length, iso(Number(y), month, Number(d)));
	}
	for (const m of matches(YEAR_AFTER_WORD, text)) push(m.index, m.index + m[0].length, String(Number(m[1])));
	const seen = new Set<string>();
	const found: FoundDate[] = [];
	for (const h of hits.sort((x, y) => x.at - y.at)) {
		const inside = hits.some((o) => o !== h && o.at <= h.at && o.end >= h.end && o.end - o.at > h.end - h.at);
		const key = `${h.quote}\u0001${h.date}`;
		if (h.date === null || inside || seen.has(key)) continue;
		seen.add(key);
		found.push({ date: h.date, quote: h.quote, ...(h.warning === undefined ? {} : { warning: h.warning }) });
	}
	return found;
}
