import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Notice, TFile } from "./__mocks__/obsidian";
import { platformRandom } from "../platform/random";
import { ObsidianVaultPort } from "../platform/vault-port";
import { registerActiveFolder, registerBookInFolder } from "../platform/register-book";

function makeApp(files: Record<string, string> = {}) {
	const store = new Map(Object.entries(files));
	const created: string[] = [];
	const folders: string[] = [];
	const vault = {
		getAbstractFileByPath: (p: string) => (store.has(p) ? Object.assign(new TFile(), { path: p }) : folders.includes(p) ? {} : null),
		read: (f: { path: string }) => Promise.resolve(store.get(f.path) ?? ""),
		create: (p: string, t: string) => {
			store.set(p, t);
			created.push(p);
			return Promise.resolve();
		},
		createFolder: vi.fn((p: string) => {
			folders.push(p);
			return Promise.resolve();
		}),
		process: (f: { path: string }, fn: (s: string) => string) => {
			store.set(f.path, fn(store.get(f.path) ?? ""));
			return Promise.resolve("");
		},
		getMarkdownFiles: () => [...store.keys()].map((path) => ({ path })),
	};
	return { app: { vault, workspace: { getActiveFile: vi.fn() } } as never, store, created, folders, vault };
}

beforeEach(() => {
	Notice.instances.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe("platformRandom", () => {
	it("uses crypto when present", () => {
		expect(platformRandom.bytes(10)).toHaveLength(10);
	});

	it("falls back to Math.random when crypto is missing", () => {
		vi.stubGlobal("crypto", undefined);
		const a = platformRandom.bytes(10);
		expect(a).toHaveLength(10);
	});
});

describe("ObsidianVaultPort", () => {
	it("reads, lists, and creates files and parent folders", async () => {
		const { app, store, created, folders } = makeApp({ "a.md": "x" });
		const port = new ObsidianVaultPort(app);
		expect(port.exists("a.md")).toBe(true);
		expect(await port.read("a.md")).toBe("x");
		expect(port.markdownPaths()).toEqual(["a.md"]);
		await port.create("B/_book-harness/book.md", "t");
		expect(folders).toEqual(["B/_book-harness"]);
		expect(created).toEqual(["B/_book-harness/book.md"]);
		expect(store.get("B/_book-harness/book.md")).toBe("t");
		await port.create("top.md", "t");
		expect(folders).toEqual(["B/_book-harness"]);
	});

	it("tolerates a parent folder that already exists", async () => {
		const { app, vault } = makeApp();
		vault.createFolder.mockRejectedValueOnce(new Error("exists"));
		await new ObsidianVaultPort(app).create("X/y.md", "t");
		expect(vault.createFolder).toHaveBeenCalled();
	});

	it("replaces only when unchanged", async () => {
		const { app, store } = makeApp({ "a.md": "one" });
		const port = new ObsidianVaultPort(app);
		expect(await port.replaceIfUnchanged("a.md", "one", "two")).toBe(true);
		expect(await port.replaceIfUnchanged("a.md", "one", "three")).toBe(false);
		expect(store.get("a.md")).toBe("two");
	});

	it("rejects a path that is not a file", async () => {
		await expect(new ObsidianVaultPort(makeApp().app).read("nope.md")).rejects.toThrow(/not found/);
	});
});

describe("registering a book from the editor", () => {
	it("tells the author when no note is open", () => {
		const { app } = makeApp();
		registerActiveFolder(app);
		expect(Notice.instances[0]?.message).toMatch(/Open a note/);
	});

	it("reports success and failure to the author", async () => {
		const { app, created } = makeApp();
		const folder = { path: "My Book", name: "My Book" } as never;
		await registerBookInFolder(app, folder, { title: "My Book", language: "en" });
		expect(created).toEqual(["My Book/_book-harness/book.md"]);
		expect(Notice.instances[0]?.message).toMatch(/Registered "My Book"/);
		await registerBookInFolder(app, folder, { title: "My Book", language: "en" });
		expect(Notice.instances[1]?.message).toMatch(/already registered/);
	});

	it("refuses the vault root and reports non-Error failures", async () => {
		const { app, vault } = makeApp();
		await registerBookInFolder(app, { path: "/", name: "" } as never, { title: "x", language: "en" });
		expect(Notice.instances[0]?.message).toMatch(/not the vault root/);
		vault.create = () => Promise.reject("odd");
		await registerBookInFolder(app, { path: "F", name: "F" } as never, { title: "x", language: "en" });
		expect(Notice.instances[1]?.message).toBe("odd");
	});
});
