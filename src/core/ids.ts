/** Opaque, prefixed, lowercase, URL-safe identifiers. Independent of names and paths. */
export type IdPrefix = "bk" | "ch" | "nt" | "en" | "ev" | "oc" | "fc" | "pr" | "jb" | "sg" | "tr" | "cv" | "tc";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567"; // RFC 4648 base32, lowercase
const ID_PATTERN = /^([a-z]{2})_([a-z2-7]{16})$/;
const ID_BYTES = 10; // 80 bits

/** Source of random bytes; the platform supplies a cryptographic one, tests supply a scripted one. */
export interface RandomPort {
	bytes(n: number): Uint8Array;
}

function base32(bytes: Uint8Array): string {
	let bits = 0;
	let value = 0;
	let out = "";
	for (const b of bytes) {
		value = (value << 8) | b;
		bits += 8;
		while (bits >= 5) {
			out += ALPHABET[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	return out;
}

export function newId(prefix: IdPrefix, random: RandomPort): string {
	return `${prefix}_${base32(random.bytes(ID_BYTES))}`;
}

export function isId(value: unknown, prefix?: IdPrefix): value is string {
	if (typeof value !== "string") return false;
	const m = ID_PATTERN.exec(value);
	return m !== null && (prefix === undefined || m[1] === prefix);
}
