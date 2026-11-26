import { describe, expect, it, vi } from "vitest";
import BookHarnessPlugin from "../main";
import { Notice } from "./__mocks__/obsidian";

function makePlugin(files: Record<string, string> = {}, failWrite = false) {
	const written: Record<string, string> = { ...files };
	const adapter = {
		exists: vi.fn((p: string) => Promise.resolve(p in written)),
		read: vi.fn((p: string) => Promise.resolve(written[p] ?? "")),
		write: vi.fn((p: string, d: string) => {
			if (failWrite) return Promise.reject(new Error("disk"));
			written[p] = d;
			return Promise.resolve();
		}),
	};
	const vaultHandlers: Array<(...a: unknown[]) => unknown> = [];
	const workspace = {
		onLayoutReady: (cb: () => void) => cb(),
		getLeavesOfType: vi.fn(() => [] as unknown[]),
		getRightLeaf: vi.fn((): unknown => null),
		revealLeaf: vi.fn(() => Promise.resolve()),
	};
	const local = new Map<string, unknown>();
	const plugin = new BookHarnessPlugin({ loadLocalStorage: (k: string) => local.get(k) ?? null, saveLocalStorage: (k: string, v: unknown) => local.set(k, v), vault: { adapter, configDir: ".obsidian", on: (_n: string, cb: (...a: unknown[]) => unknown) => (vaultHandlers.push(cb), {}), getMarkdownFiles: () => [] }, workspace } as never, { id: "book-harness", dir: ".obsidian/plugins/book-harness" } as never);
	const cleanups: Array<() => void> = [];
	(plugin as unknown as { register: (f: () => void) => void }).register = (f) => cleanups.push(f);
	return { plugin, written, cleanups, workspace, vaultHandlers, local };
}

const stub = (p: BookHarnessPlugin) => p as unknown as { settingTabs: unknown[]; data: unknown };
const CRASH = ".obsidian/plugins/book-harness/crash-state.json";

describe("BookHarnessPlugin", () => {
	it("loads, registers a settings tab and counts the launch", async () => {
		const { plugin, written } = makePlugin();
		await plugin.onload();
		expect(stub(plugin).settingTabs).toHaveLength(1);
		expect(JSON.parse(written[CRASH])).toEqual({ counter: 1, autoDisabled: false });
	});

	it("registers the register-book command, which tells the author to open a note first", async () => {
		const { plugin } = makePlugin();
		const added: Array<{ id: string; callback: () => void }> = [];
		(plugin as unknown as { addCommand: (c: { id: string; callback: () => void }) => void }).addCommand = (c) => added.push(c);
		Object.assign((plugin.app as unknown as { workspace: object }).workspace, { getActiveFile: () => null });
		Notice.instances.length = 0;
		await plugin.onload();
		expect(added.map((c) => c.id)).toEqual(["register-book", "open-panel"]);
		added[0]?.callback();
		expect(Notice.instances[0]?.message).toMatch(/Open a note/);
	});

	it("registers the panel view, command, ribbon icon and a rename follower after layout is ready", async () => {
		const { plugin, workspace, vaultHandlers } = makePlugin();
		const p = plugin as unknown as { views: Map<string, (leaf: unknown) => unknown>; ribbon: Array<{ cb: () => unknown }>; events: unknown[]; commands: Array<{ id: string; callback: () => unknown }> };
		await plugin.onload();
		expect(p.views.has("book-harness-panel")).toBe(true);
		expect(p.views.get("book-harness-panel")?.({ app: {} })).toBeDefined();
		expect(p.events).toHaveLength(1);
		vaultHandlers[0]?.({ path: "a.md" }, "b.md");
		const leaf = { setViewState: vi.fn(() => Promise.resolve()) };
		workspace.getRightLeaf.mockReturnValue(leaf);
		p.ribbon[0]?.cb();
		await vi.waitFor(() => expect(workspace.revealLeaf).toHaveBeenCalledWith(leaf));
		expect(leaf.setViewState).toHaveBeenCalledWith({ type: "book-harness-panel", active: true });
		// an existing panel is revealed, not duplicated
		const existing = { setViewState: vi.fn(() => Promise.resolve()) };
		workspace.getLeavesOfType.mockReturnValue([existing]);
		await plugin.openPanel();
		expect(existing.setViewState).not.toHaveBeenCalled();
		expect(workspace.revealLeaf).toHaveBeenCalledWith(existing);
		// no free leaf: nothing happens
		workspace.getLeavesOfType.mockReturnValue([]);
		workspace.getRightLeaf.mockReturnValue(null);
		workspace.revealLeaf.mockClear();
		await plugin.openPanel();
		expect(workspace.revealLeaf).not.toHaveBeenCalled();
		p.commands.find((c) => c.id === "open-panel")?.callback();
	});

	it("clears the crash counter once the launch survives", async () => {
		vi.useFakeTimers();
		const { plugin, written, cleanups } = makePlugin();
		await plugin.onload();
		await vi.advanceTimersByTimeAsync(30_000);
		expect(JSON.parse(written[CRASH])).toEqual({ counter: 0, autoDisabled: false });
		cleanups.forEach((c) => c());
		vi.useRealTimers();
	});

	it("stops loading after repeated failed starts", async () => {
		const { plugin } = makePlugin({ [CRASH]: JSON.stringify({ counter: 5, autoDisabled: false }) });
		await plugin.onload();
		expect(stub(plugin).settingTabs).toHaveLength(0);
	});

	it("shows the real error when loading fails and rethrows", async () => {
		const { plugin } = makePlugin();
		plugin.loadData = () => Promise.reject(new Error("boom"));
		await expect(plugin.onload()).rejects.toThrow("boom");
		expect(Notice).toBeDefined();
	});

	it("reports a non-Error failure too", async () => {
		const { plugin } = makePlugin();
		plugin.loadData = () => Promise.reject("odd");
		await expect(plugin.onload()).rejects.toBe("odd");
	});

	it("saves shared settings to the data file and this device's server settings only to device storage", async () => {
		const { plugin, local } = makePlugin();
		await plugin.loadSettings();
		plugin.settings.logLevel = "debug";
		plugin.settings.device.endpoint = "http://phone-only:11434";
		await plugin.saveSettings();
		expect(stub(plugin).data).toEqual({ logLevel: "debug" });
		expect(JSON.stringify(stub(plugin).data)).not.toContain("phone-only");
		expect(local.get("book-harness-device")).toMatchObject({ endpoint: "http://phone-only:11434" });
		const again = makePlugin();
		again.local.set("book-harness-device", { endpoint: "http://other:1" });
		await again.plugin.loadSettings();
		expect(again.plugin.settings.device.endpoint).toBe("http://other:1");
	});
});
