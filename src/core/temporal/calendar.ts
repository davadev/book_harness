/**
 * Calendar support is deliberately small and explicit: proleptic Gregorian dates (with years before 1 as astronomical
 * years: 0 is 1 BCE, -1 is 2 BCE) and plain durations. Anything else is stored as an unresolvable expression and left out
 * of the arithmetic; no conversion is ever invented.
 */
export const SECOND = 1;
export const MINUTE = 60;
export const HOUR = 3600;
export const DAY = 86_400;

export type Precision = "year" | "month" | "day" | "hour" | "minute" | "second";

export interface CivilTime {
	year: number;
	month?: number;
	day?: number;
	hour?: number;
	minute?: number;
	second?: number;
}

/** Days from 1970-01-01 for a proleptic Gregorian date (Hinnant's algorithm; works for any integer year). */
export function daysFromCivil(year: number, month: number, day: number): number {
	const y = month <= 2 ? year - 1 : year;
	const era = Math.floor(y / 400);
	const yoe = y - era * 400;
	const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
	const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
	return era * 146_097 + doe - 719_468;
}

/** Inverse of `daysFromCivil`. */
export function civilFromDays(days: number): { year: number; month: number; day: number } {
	const z = days + 719_468;
	const era = Math.floor(z / 146_097);
	const doe = z - era * 146_097;
	const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
	const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
	const mp = Math.floor((5 * doy + 2) / 153);
	const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
	const month = mp < 10 ? mp + 3 : mp - 9;
	return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

export const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y: number, m: number): number => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

export class CalendarError extends Error {}

export function precisionOf(t: CivilTime): Precision {
	if (t.month === undefined) return "year";
	if (t.day === undefined) return "month";
	if (t.hour === undefined) return "day";
	if (t.minute === undefined) return "hour";
	return t.second === undefined ? "minute" : "second";
}

/**
 * The span of seconds (since 1970-01-01T00:00:00) a stated time could mean. "1923" is the whole year, not 1 January: the
 * precision is kept, so nothing downstream treats it as a known day.
 */
export function toInterval(t: CivilTime): [number, number] {
	if (!Number.isInteger(t.year)) throw new CalendarError("The year must be a whole number.");
	const p = precisionOf(t);
	const month = t.month ?? 1;
	if (month < 1 || month > 12 || !Number.isInteger(month)) throw new CalendarError("The month must be 1 to 12.");
	if (t.day !== undefined && (!Number.isInteger(t.day) || t.day < 1 || t.day > daysInMonth(t.year, month))) throw new CalendarError(`${t.year}-${month} has no day ${t.day}.`);
	if (t.hour !== undefined && (t.hour < 0 || t.hour > 23)) throw new CalendarError("The hour must be 0 to 23.");
	if (t.minute !== undefined && (t.minute < 0 || t.minute > 59)) throw new CalendarError("The minute must be 0 to 59.");
	if (t.second !== undefined && (t.second < 0 || t.second > 59)) throw new CalendarError("The second must be 0 to 59.");
	const start = daysFromCivil(t.year, month, t.day ?? 1) * DAY + (t.hour ?? 0) * HOUR + (t.minute ?? 0) * MINUTE + (t.second ?? 0);
	const span = { year: (isLeap(t.year) ? 366 : 365) * DAY, month: daysInMonth(t.year, month) * DAY, day: DAY, hour: HOUR, minute: MINUTE, second: SECOND }[p];
	return [start, start + span - 1];
}

/** A moment as readable text at the precision the data really has. Uncertain bounds are shown as a range by the caller. */
export function formatSeconds(s: number): string {
	const days = Math.floor(s / DAY);
	const rest = s - days * DAY;
	const { year, month, day } = civilFromDays(days);
	const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, "0");
	const date = `${year < 0 ? "-" : ""}${pad(year, 4)}-${pad(month)}-${pad(day)}`;
	return rest === 0 ? date : `${date} ${pad(Math.floor(rest / HOUR))}:${pad(Math.floor((rest % HOUR) / MINUTE))}:${pad(rest % MINUTE)}`;
}

const UNIT: Record<string, number> = { second: SECOND, seconds: SECOND, minute: MINUTE, minutes: MINUTE, hour: HOUR, hours: HOUR, day: DAY, days: DAY, week: 7 * DAY, weeks: 7 * DAY };

/** "3 days", "2 weeks", "90 minutes" → seconds. Months and years are not fixed lengths and are refused. */
export function parseDuration(text: string): number {
	const m = /^\s*(\d+(?:\.\d+)?)\s*([a-z]+)\s*$/i.exec(text);
	const unit = m ? UNIT[(m[2]).toLowerCase()] : undefined;
	if (!m || unit === undefined) throw new CalendarError(`"${text}" is not a duration this book can calculate with (use seconds, minutes, hours, days or weeks; months and years vary in length).`);
	return Number(m[1]) * unit;
}

/** A range of possible moments as short text: a whole day, month or year is named as such, never as a made-up exact time. */
export function describeSpan(lo: number, hi: number): string {
	if (lo === hi) return formatSeconds(lo);
	const start = civilFromDays(Math.floor(lo / DAY));
	const aligned = lo % DAY === 0 && (hi + 1) % DAY === 0;
	if (aligned) {
		const days = (hi + 1 - lo) / DAY;
		const pad = (n: number) => String(n).padStart(2, "0");
		const yy = `${start.year < 0 ? "-" : ""}${String(Math.abs(start.year)).padStart(4, "0")}`;
		if (days === 1) return `${yy}-${pad(start.month)}-${pad(start.day)}`;
		if (start.day === 1 && days === daysInMonth(start.year, start.month)) return `${yy}-${pad(start.month)}`;
		if (start.day === 1 && start.month === 1 && days === (isLeap(start.year) ? 366 : 365)) return yy;
	}
	return `${formatSeconds(lo)} to ${formatSeconds(hi)}`;
}
