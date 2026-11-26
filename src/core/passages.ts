import { hashText } from "./segmentation";

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
const TARGET_WORDS = 200;
const MAX_WORDS = 280;
const wordCount = (t: string): number => (t.match(/[\p{L}\p{N}]+/gu) ?? []).length;

/** A stretch of a chapter that search returns. Offsets are into the full note text at `sourceRevision`. */
export interface Passage {
	ordinal: number;
	start: number;
	end: number;
	text: string;
	/** Stable while the passage's words are unchanged, even if text elsewhere moves it. */
	id: string;
}

/**
 * Deterministic passages: paragraphs grouped to about 200 words, never crossing the chapter, fenced code left out. A
 * paragraph longer than the limit is cut at sentence ends so nothing is dropped.
 */
export function passagesOf(noteText: string): Passage[] {
	const bodyStart = FRONTMATTER.exec(noteText)?.[0].length ?? 0;
	const blocks: Array<{ start: number; end: number; text: string }> = [];
	let fence: string | null = null;
	let current: { start: number; end: number; lines: string[] } | null = null;
	const flush = () => {
		if (current) blocks.push({ start: current.start, end: current.end, text: current.lines.join("\n") });
		current = null;
	};
	let offset = bodyStart;
	for (const raw of noteText.slice(bodyStart).split("\n")) {
		const lineStart = offset;
		offset += raw.length + 1;
		const line = raw.replace(/\r$/, "");
		const mark = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
		if (fence !== null) {
			if (mark !== undefined && mark[0] === fence[0] && mark.length >= fence.length) fence = null;
			continue;
		}
		if (mark !== undefined) {
			flush();
			fence = mark;
			continue;
		}
		if (line.trim() === "") {
			flush();
			continue;
		}
		const lead = line.length - line.trimStart().length;
		if (current === null) current = { start: lineStart + lead, end: lineStart + line.trimEnd().length, lines: [line.trim()] };
		else {
			current.lines.push(line.trim());
			current.end = lineStart + line.trimEnd().length;
		}
	}
	flush();
	const pieces: typeof blocks = [];
	for (const b of blocks) {
		if (wordCount(b.text) <= MAX_WORDS) {
			pieces.push(b);
			continue;
		}
		// No lookbehind: older iPhones do not support it.
		for (const m of b.text.matchAll(/[^.!?]+(?:[.!?]+|$)/gu)) {
			const sentence = m[0].trim();
			const at = m.index + m[0].indexOf(sentence);
			pieces.push({ start: b.start + at, end: b.start + at + sentence.length, text: sentence });
		}
	}
	const out: Passage[] = [];
	let group: typeof blocks = [];
	let words = 0;
	const close = () => {
		if (group.length === 0) return;
		const first = group[0];
		const last = group[group.length - 1];
		// Indexed text is the prose only (code between paragraphs is left out); start..end still spans where it sits in the note.
		const text = group.map((b) => b.text).join("\n\n");
		out.push({ ordinal: out.length, start: first.start, end: last.end, text, id: hashText(text).slice(3, 15) });
		group = [];
		words = 0;
	};
	for (const p of pieces) {
		const w = wordCount(p.text);
		if (words > 0 && words + w > TARGET_WORDS) close();
		group.push(p);
		words += w;
	}
	close();
	return out;
}
