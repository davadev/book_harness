import { fingerprint } from "./revision";

export interface Segment {
	/** Offsets in the full note text (properties included), so a hunk offset adds directly. */
	start: number;
	end: number;
	text: string;
	/** Hash of the exact text. Identity of a paragraph for review purposes: edit it and it is a new paragraph. */
	hash: string;
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
// Blocks that are structure or markup, not plain prose: headings, lists, quotes, tables, HTML, embeds, rules, comments, math.
const OPAQUE = /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||<|!\[|\[\^|-{3,}\s*$|\*{3,}\s*$|%%|\$\$|`{3,}|~{3,})/;

export const hashText = (text: string): string => fingerprint({ text });

/**
 * Plain-prose paragraphs of a note, in order. Properties, fenced code and any block that is structure or markup
 * (headings, lists, quotes, tables, HTML, embeds, comments) are skipped, never sent for correction.
 */
export function proseSegments(noteText: string): Segment[] {
	const bodyStart = FRONTMATTER.exec(noteText)?.[0].length ?? 0;
	const segments: Segment[] = [];
	let block: { start: number; end: number; lines: string[] } | null = null;
	let fence: string | null = null;
	const flush = (): void => {
		if (block && !block.lines.some((l) => OPAQUE.test(l))) {
			const text = block.lines.join("\n");
			segments.push({ start: block.start, end: block.end, text, hash: hashText(text) });
		}
		block = null;
	};
	let offset = bodyStart;
	for (const raw of noteText.slice(bodyStart).split("\n")) {
		const lineStart = offset;
		offset += raw.length + 1;
		const line = raw.replace(/\r$/, "");
		const fenceMark = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
		if (fence !== null) {
			if (fenceMark !== undefined && fenceMark[0] === fence[0] && fenceMark.length >= fence.length) fence = null;
			continue;
		}
		if (fenceMark !== undefined) {
			flush();
			fence = fenceMark;
			continue;
		}
		if (line.trim() === "") {
			flush();
			continue;
		}
		const lead = line.length - line.trimStart().length;
		if (block === null) block = { start: lineStart + lead, end: lineStart + line.trimEnd().length, lines: [line.trim()] };
		else {
			block.lines.push(line.trim());
			block.end = lineStart + line.trimEnd().length;
		}
	}
	flush();
	return segments;
}
