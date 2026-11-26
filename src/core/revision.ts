import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

/** The manuscript body: everything after the properties block. Property edits are not prose edits. */
export function bodyOf(text: string): string {
	return text.replace(FRONTMATTER, "");
}

/** Line endings are normalized so a sync tool converting CRLF does not look like a rewrite. Nothing else is touched. */
export function normalizeBody(text: string): string {
	return bodyOf(text).replace(/\r\n/g, "\n");
}

const hash = (text: string): string => bytesToHex(sha256(new TextEncoder().encode(text)));

/** Content revision of a manuscript note. Deterministic; the same text gives the same revision on every platform. */
export function revisionOf(text: string): string {
	return `sha256:${hash(normalizeBody(text))}`;
}

/** Fingerprint of everything a task result depends on. Key order does not matter. */
export function fingerprint(parts: Record<string, string | number>): string {
	const canonical = JSON.stringify(Object.keys(parts).sort().map((k) => [k, parts[k]]));
	return `fp:${hash(canonical).slice(0, 32)}`;
}
