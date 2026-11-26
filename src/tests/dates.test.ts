import { describe, expect, it } from "vitest";
import { findDates } from "../core/temporal/dates";

const dates = (t: string) => findDates(t).map((d) => d.date);

describe("dates stated in the text", () => {
	it("reads English day-month-year forms with numbers, ordinals and ordinal words", () => {
		expect(dates("Friday, the fourteenth of March, 2091, began badly.")).toEqual(["2091-03-14"]);
		expect(dates("On 3 March 2091 and on the 21st of June 2091 and the twenty-first of July 2091 and the thirtieth of June 2091.")).toEqual(["2091-03-03", "2091-06-21", "2091-07-21", "2091-06-30"]);
		expect(dates("It was March 14, 2091 when they met. And the first of May 1900.")).toEqual(["2091-03-14", "1900-05-01"]);
	});

	it("reads German, Czech and Slovak months and the numeric forms", () => {
		expect(dates("Am 14. März 2091 kam er. Dne 5. května 1999 odešel. Dňa 1. marca 2000 prišiel.")).toEqual(["2091-03-14", "1999-05-05", "2000-03-01"]);
		expect(dates("Written 2091-03-14, again 14.3.2091 and 1. 12. 1989.")).toEqual(["2091-03-14", "1989-12-01"]);
	});

	it("offers a month or a year only when the text gives no more, and never guesses a missing year", () => {
		expect(dates("It happened in March 2091. The accident of 2088 was long past. Since 1999 nothing changed.")).toEqual(["2091-03", "2088", "1999"]);
		expect(dates("On the third of March, eleven days ago, she left. In 12 she was young.")).toEqual([]);
		expect(dates("The growth of March 2091 was slow.")).toEqual(["2091-03"]);
	});

	it("does not offer an impossible day, nor its month instead", () => {
		expect(dates("On 31 February 2020 nothing happened. On the thirty-first of April 2020 neither. 99.99.2020 is nonsense, 5.13.2020 too.")).toEqual([]);
		expect(dates("It was 29 February 2020 and 29 February 2021.")).toEqual(["2020-02-29"]);
	});

	it("quotes the sentence the date stands in, word for word, even across paragraphs and German day dots", () => {
		const text = "The lamp failed. It was Tuesday the eleventh of March, 2091, ten past ten.\n\nAm 14. März 2091 kam er heim! Later.";
		expect(findDates(text).map(({ date, quote }) => ({ date, quote }))).toEqual([
			{ date: "2091-03-11", quote: "It was Tuesday the eleventh of March, 2091, ten past ten." },
			{ date: "2091-03-14", quote: "Am 14. März 2091 kam er heim!" },
		]);
		for (const d of findDates(text)) expect(text).toContain(d.quote);
	});

	it("lists a date once per sentence and keeps several dates of one sentence apart", () => {
		expect(findDates("From 3 March 2091 until 3 March 2091 and 5 March 2091.").map((d) => d.date)).toEqual(["2091-03-03", "2091-03-05"]);
		expect(findDates("")).toEqual([]);
	});

	it("warns when the weekday the text names is not the weekday of the date, and stays quiet when it matches or none is named", () => {
		const [wrong] = findDates("Friday, the fourteenth of March, 2091, began badly.");
		expect(wrong!.warning).toBe("The text says Friday, but 2091-03-14 is a Wednesday in the Gregorian calendar. Ignore this if your story uses its own calendar.");
		expect(findDates("On Wednesday the fourteenth of March, 2091 it began.")[0]).not.toHaveProperty("warning");
		expect(findDates("It began on the fourteenth of March, 2091.")[0]).not.toHaveProperty("warning");
		expect(findDates("Am Samstag, 3. März 2091 war es so.")[0]).not.toHaveProperty("warning");
		expect(findDates("Ve středu 5. května 1999 odešel. Dňa 1. marca 2000 prišiel. In March 2091, a Friday.").map((d) => d.warning?.slice(0, 22))).toEqual([undefined, undefined, undefined]);
		expect(findDates("Monday, 5 May 1999 was it.")[0]!.warning).toContain("is a Wednesday");
		expect(findDates("Sunday 2091 was long ago, in March 2091.").map((d) => d.warning)).toEqual([undefined]);
	});
});
