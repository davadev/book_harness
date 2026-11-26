import { bodyOf } from "./revision";

export const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

const blank = (m: string): string => m.replace(/[^\n]/g, " ");

/**
 * The prose of a note with everything that is not prose (properties, fenced code, HTML and Obsidian comments) replaced
 * by spaces. The result has exactly the length of the note, so a position found in it is a position in the note.
 */
export function maskProse(text: string): string {
	const body = bodyOf(text);
	const head = text.slice(0, text.length - body.length);
	return blank(head) + body.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|<!--[\s\S]*?-->|%%[\s\S]*?%%/g, blank);
}

/** Words in the prose: properties, fenced code and comments do not count. Language-neutral and deterministic. */
export function countWords(text: string): number {
	return (maskProse(text).match(WORD) ?? []).length;
}
