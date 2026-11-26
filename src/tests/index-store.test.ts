import { describe, expect, it, vi } from "vitest";
import { createIndexStore } from "../platform/index-store";

function adapter() {
	const files = new Map<string, ArrayBuffer>();
	const dirs = new Set<string>();
	return {
		files,
		dirs,
		exists: (p: string) => Promise.resolve(files.has(p) || dirs.has(p)),
		readBinary: (p: string) => Promise.resolve(files.get(p) as ArrayBuffer),
		writeBinary: (p: string, d: ArrayBuffer) => (files.set(p, d), Promise.resolve()),
		mkdir: vi.fn((p: string) => (dirs.add(p), Promise.resolve())),
	};
}

describe("index store", () => {
	it("keeps derived files in the plugin's own folder, creating it once", async () => {
		const a = adapter();
		const app = { vault: { configDir: ".obsidian", adapter: a } } as never;
		const store = createIndexStore(app, { id: "book-harness", dir: ".obsidian/plugins/book-harness" } as never);
		expect(await store.read("bk_x.bin")).toBeNull();
		const data = new Uint8Array([1, 2, 3]).buffer;
		await store.write("bk_x.bin", data);
		await store.write("bk_y/../evil.bin", data);
		expect(a.mkdir).toHaveBeenCalledTimes(1);
		expect([...a.files.keys()]).toEqual([".obsidian/plugins/book-harness/indexes/bk_x.bin", ".obsidian/plugins/book-harness/indexes/bk_y_.._evil.bin"]);
		expect(await store.read("bk_x.bin")).toBe(data);
	});

	it("falls back to the config folder when the manifest has no directory", async () => {
		const a = adapter();
		const store = createIndexStore({ vault: { configDir: ".config", adapter: a } } as never, { id: "book-harness" } as never);
		await store.write("k", new ArrayBuffer(1));
		expect([...a.files.keys()]).toEqual([".config/plugins/book-harness/indexes/k"]);
	});
});
