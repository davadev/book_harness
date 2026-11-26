import { hashText } from "../segmentation";
import { bodyOf } from "../revision";

/**
 * A chapter as translation sees it: blocks separated by blank lines. Everything is carried over; only blocks that are
 * plain text (including headings, quotes and list items) are sent for translation, while code, tables, embeds, rules,
 * comments and HTML pass through untouched so the structure of the chapter is never altered.
 */
export interface Block {
	text: string;
	hash: string;
	/** False for blocks that are copied as they are (code, tables, embedded files, rules, comments, HTML). */
	translatable: boolean;
}

const OPAQUE_LINE = /^\s*(?:\||<|!\[|\[\^|-{3,}\s*$|\*{3,}\s*$|_{3,}\s*$|%%|\$\$)/;

export function splitBlocks(noteText: string): Block[] {
	const blocks: Block[] = [];
	let lines: string[] = [];
	let fence: string | null = null;
	let fenced = false;
	const flush = () => {
		if (lines.length === 0) return;
		const text = lines.join("\n");
		blocks.push({ text, hash: hashText(text), translatable: !fenced && !lines.some((l) => OPAQUE_LINE.test(l)) });
		lines = [];
		fenced = false;
	};
	for (const raw of bodyOf(noteText).replace(/\r\n?/g, "\n").split("\n")) {
		const mark = /^\s*(`{3,}|~{3,})/.exec(raw)?.[1];
		if (fence !== null) {
			lines.push(raw);
			if (mark !== undefined && mark[0] === fence[0] && mark.length >= fence.length) {
				fence = null;
				flush();
			}
			continue;
		}
		if (mark !== undefined) {
			flush();
			fence = mark;
			fenced = true;
			lines.push(raw);
			continue;
		}
		if (raw.trim() === "") flush();
		else lines.push(raw.trimEnd());
	}
	flush();
	return blocks;
}

/** Blocks back to a note body. Paragraph breaks are single blank lines. */
export const joinBlocks = (texts: readonly string[]): string => `${texts.join("\n\n")}\n`;
