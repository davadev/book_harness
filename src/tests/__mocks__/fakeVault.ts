import type { RandomPort } from "../../core/ids";
import type { VaultPort } from "../../core/ports";

/** In-memory vault for core tests. `writes` records every mutation so tests can assert what was (not) touched. */
export class FakeVault implements VaultPort {
	files = new Map<string, string>();
	writes: string[] = [];

	constructor(initial: Record<string, string> = {}) {
		for (const [p, t] of Object.entries(initial)) this.files.set(p, t);
	}

	exists(path: string): boolean {
		return this.files.has(path);
	}

	read(path: string): Promise<string> {
		const t = this.files.get(path);
		return t === undefined ? Promise.reject(new Error(`missing ${path}`)) : Promise.resolve(t);
	}

	create(path: string, text: string): Promise<void> {
		if (this.files.has(path)) return Promise.reject(new Error(`exists ${path}`));
		this.files.set(path, text);
		this.writes.push(path);
		return Promise.resolve();
	}

	replaceIfUnchanged(path: string, expected: string, next: string): Promise<boolean> {
		if (this.files.get(path) !== expected) return Promise.resolve(false);
		this.files.set(path, next);
		this.writes.push(path);
		return Promise.resolve(true);
	}

	markdownPaths(): string[] {
		return [...this.files.keys()].filter((p) => p.endsWith(".md"));
	}
}

/** Deterministic random source: each call continues a counter, so ids differ but are reproducible. */
export function counterRandom(): RandomPort {
	let n = 0;
	return { bytes: (len) => Uint8Array.from({ length: len }, (_, i) => (n++ * 37 + i * 11) & 255) };
}
