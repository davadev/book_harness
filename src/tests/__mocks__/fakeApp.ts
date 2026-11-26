import { vi } from "vitest";
import { TFile } from "./obsidian";

type Handler = (...args: never[]) => unknown;

/** A small in-memory Obsidian `App`: a vault with events, and a workspace that records leaves and handlers. */
export function makeFakeApp(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));
	const folders = new Set<string>();
	const handlers = new Map<string, Handler[]>();
	const on = (scope: string) => (name: string, cb: Handler) => {
		handlers.set(`${scope}:${name}`, [...(handlers.get(`${scope}:${name}`) ?? []), cb]);
		return { scope, name };
	};
	const fire = (scope: string, name: string, ...args: unknown[]) => (handlers.get(`${scope}:${name}`) ?? []).forEach((h) => (h as (...a: unknown[]) => unknown)(...args));
	const fileOf = (path: string) => Object.assign(new TFile(), { path });
	const openFile = vi.fn(() => Promise.resolve());
	const leaf = { setViewState: vi.fn(() => Promise.resolve()), openFile };
	const state: { active: string | null; leaves: unknown[]; rightLeaf: unknown } = { active: null, leaves: [], rightLeaf: leaf };
	const app = {
		vault: {
			configDir: ".obsidian",
			adapter: {},
			on: on("vault"),
			getAbstractFileByPath: (p: string) => (store.has(p) ? fileOf(p) : folders.has(p) ? {} : null),
			getMarkdownFiles: () => [...store.keys()].filter((p) => p.endsWith(".md")).map(fileOf),
			read: (f: { path: string }) => Promise.resolve(store.get(f.path) ?? ""),
			create: (p: string, t: string) => {
				store.set(p, t);
				return Promise.resolve();
			},
			createFolder: (p: string) => {
				folders.add(p);
				return Promise.resolve();
			},
			process: (f: { path: string }, fn: (s: string) => string) => {
				store.set(f.path, fn(store.get(f.path) ?? ""));
				return Promise.resolve("");
			},
		},
		workspace: {
			on: on("workspace"),
			getActiveFile: () => (state.active === null ? null : { ...fileOf(state.active), parent: { path: state.active.split("/").slice(0, -1).join("/"), name: "Folder" } }),
			getLeaf: () => leaf,
			getLeavesOfType: () => state.leaves,
			getRightLeaf: () => state.rightLeaf,
			revealLeaf: vi.fn(() => Promise.resolve()),
			onLayoutReady: (cb: () => void) => cb(),
		},
	};
	return { app: app as never, appAny: app, store, folders, fire, state, leaf, openFile, handlers };
}
