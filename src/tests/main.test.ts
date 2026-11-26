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
	const plugin = new BookHarnessPlugin({ vault: { adapter, configDir: ".obsidian" } } as never, { id: "book-harness", dir: ".obsidian/plugins/book-harness" } as never);
	const cleanups: Array<() => void> = [];
	(plugin as unknown as { register: (f: () => void) => void }).register = (f) => cleanups.push(f);
	return { plugin, written, cleanups };
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
		(plugin.app as unknown as { workspace: unknown }).workspace = { getActiveFile: () => null };
		Notice.instances.length = 0;
		await plugin.onload();
		expect(added.map((c) => c.id)).toEqual(["register-book"]);
		added[0]?.callback();
		expect(Notice.instances[0]?.message).toMatch(/Open a note/);
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

	it("saves settings through saveData", async () => {
		const { plugin } = makePlugin();
		await plugin.loadSettings();
		plugin.settings.logLevel = "debug";
		await plugin.saveSettings();
		expect(stub(plugin).data).toEqual({ logLevel: "debug" });
	});
});
