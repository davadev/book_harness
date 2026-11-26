import type { RandomPort } from "../core/ids";

/** Cryptographic randomness where the WebView has it; otherwise a time-and-Math.random mix (ids only need to avoid collisions). */
export const platformRandom: RandomPort = {
	bytes(n: number): Uint8Array {
		const out = new Uint8Array(n);
		if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") return crypto.getRandomValues(out);
		for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256) ^ (Date.now() >>> (i % 4)) & 255;
		return out;
	},
};
