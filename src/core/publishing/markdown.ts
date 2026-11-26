/**
 * The small, deterministic slice of Markdown a book chapter needs, parsed into a tree that every export renders from.
 * Obsidian-only syntax is handled here so it can never leak into a book: properties, comments, wikilinks and embeds.
 * What is not supported (lists, tables, code blocks, footnotes) is kept as plain text and reported, never dropped.
 */
export type Inline = { t: "text"; s: string } | { t: "em"; c: Inline[] } | { t: "strong"; c: Inline[] };
export type Block = { t: "heading"; level: number; c: Inline[] } | { t: "p"; c: Inline[] } | { t: "quote"; c: Inline[] } | { t: "break" };

export interface ParsedChapter {
	blocks: Block[];
	/** Constructs kept as plain text because they are not supported yet, for the validation report. */
	unsupported: string[];
	/** Embedded files (`![[...]]`) that were left out because illustrations are not placed yet. */
	embeds: number;
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const BREAK = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const UNSUPPORTED: Array<[RegExp, string]> = [
	[/^\s*([-+*]|\d+[.)])\s+\S/, "a list"],
	[/^\s*```/, "a code block"],
	[/^\s*\|.*\|\s*$/, "a table"],
	[/^\[\^[^\]]+\]:/, "a footnote"],
];

function clean(text: string): string {
	return text.replace(/\r\n?/g, "\n").replace(FRONTMATTER, "").replace(/%%[\s\S]*?%%/g, "").replace(/<!--[\s\S]*?-->/g, "");
}

export function inlines(source: string): Inline[] {
	const out: Inline[] = [];
	const push = (s: string) => {
		if (s !== "") out.push({ t: "text", s });
	};
	const pattern = /(\*\*|__)(\S|\S[\s\S]*?\S)\1|(\*|_)(\S|\S[^*_]*?\S)\3/g;
	let at = 0;
	for (const m of source.matchAll(pattern)) {
		const start = m.index;
		const before = start > 0 ? source.charAt(start - 1) : "";
		const after = source.charAt(start + m[0].length);
		// `_` inside a word is not emphasis (snake_case, file_names)
		if ((m[1] === "__" || m[3] === "_") && (/\w/.test(before) || /\w/.test(after))) continue;
		push(source.slice(at, start));
		out.push(m[1] ? { t: "strong", c: inlines(m[2]) } : { t: "em", c: inlines(m[4]) });
		at = start + m[0].length;
	}
	push(source.slice(at));
	return out;
}

/** Wikilinks become their visible text, links keep their text, inline code keeps its text; embeds are removed and counted. */
function flatten(line: string, counts: { embeds: number }): string {
	return line
		.replace(/!\[\[[^\]]*\]\]/g, () => (counts.embeds++, ""))
		.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
		.replace(/\[\[([^\]]*)\]\]/g, (_m, target: string) => target.split("#")[0])
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, () => (counts.embeds++, ""))
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/`([^`]*)`/g, "$1");
}

export function parseChapter(markdown: string): ParsedChapter {
	const counts = { embeds: 0 };
	const unsupported = new Set<string>();
	const blocks: Block[] = [];
	let paragraph: string[] = [];
	let quote: string[] = [];
	const flush = () => {
		if (paragraph.length > 0) blocks.push({ t: "p", c: inlines(paragraph.join(" ")) });
		if (quote.length > 0) blocks.push({ t: "quote", c: inlines(quote.join(" ")) });
		paragraph = [];
		quote = [];
	};
	for (const raw of clean(markdown).split("\n")) {
		if (raw.trim() === "") {
			flush();
			continue;
		}
		if (BREAK.test(raw)) {
			flush();
			blocks.push({ t: "break" });
			continue;
		}
		const heading = HEADING.exec(raw);
		if (heading) {
			flush();
			blocks.push({ t: "heading", level: (heading[1]).length, c: inlines(flatten(heading[2], counts)) });
			continue;
		}
		const found = UNSUPPORTED.find(([re]) => re.test(raw));
		if (found) unsupported.add(found[1]);
		const quoted = /^\s*>\s?(.*)$/.exec(raw);
		const text = flatten((quoted ? (quoted[1]) : raw).trim(), counts);
		if (quoted) {
			if (paragraph.length > 0) flush();
			quote.push(text);
		} else {
			if (quote.length > 0) flush();
			paragraph.push(text);
		}
	}
	flush();
	return { blocks: blocks.filter((b) => b.t !== "p" && b.t !== "quote" ? true : b.c.length > 0), unsupported: [...unsupported].sort(), embeds: counts.embeds };
}

export function plainText(c: readonly Inline[]): string {
	return c.map((i) => (i.t === "text" ? i.s : plainText(i.c))).join("");
}
