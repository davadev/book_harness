import { bodyOf } from "./revision";

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

/** Words in the prose: properties, fenced code and HTML comments do not count. Language-neutral and deterministic. */
export function countWords(text: string): number {
	const prose = bodyOf(text)
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/~~~[\s\S]*?~~~/g, " ")
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/%%[\s\S]*?%%/g, " ");
	return (prose.match(WORD) ?? []).length;
}
