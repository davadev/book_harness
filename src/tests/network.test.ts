import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Notice, requestUrlMock } from "./__mocks__/obsidian";
import { obsidianNetwork } from "../platform/network";
import { PluginSettingsTab } from "../settings/SettingsTab";
import { DEFAULT_SETTINGS } from "../settings/defaults";
import BookHarnessPlugin from "../main";

beforeEach(() => {
	requestUrlMock.calls.length = 0;
	requestUrlMock.next = null;
	Notice.instances.length = 0;
	vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const req = (extra = {}) => ({ url: "http://h:1/api/version", method: "GET" as const, timeoutMs: 1000, ...extra });

describe("obsidianNetwork", () => {
	it("passes the request through requestUrl without throwing on HTTP errors", async () => {
		requestUrlMock.next = () => Promise.resolve({ status: 500, text: "bad" });
		const res = await obsidianNetwork.request(req({ method: "POST", body: "{}" }));
		expect(res).toEqual({ status: 500, text: "bad" });
		expect(requestUrlMock.calls[0]).toMatchObject({ url: "http://h:1/api/version", method: "POST", body: "{}", contentType: "application/json", throw: false });
		await obsidianNetwork.request(req());
		expect(requestUrlMock.calls[1]).toMatchObject({ contentType: undefined });
	});

	it("gives up after the timeout and ignores a late answer", async () => {
		let late: (v: { status: number; text: string }) => void = () => undefined;
		requestUrlMock.next = () => new Promise((r) => (late = r));
		const p = obsidianNetwork.request(req());
		const assertion = expect(p).rejects.toMatchObject({ kind: "timeout" });
		await vi.advanceTimersByTimeAsync(1000);
		await assertion;
		late({ status: 200, text: "{}" });
	});

	it("rejects when canceled", async () => {
		requestUrlMock.next = () => new Promise(() => undefined);
		const controller = new AbortController();
		const p = obsidianNetwork.request(req({ signal: controller.signal }));
		controller.abort();
		await expect(p).rejects.toMatchObject({ kind: "canceled" });
	});

	it("rejects at once when it was canceled before the request started", async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(obsidianNetwork.request(req({ signal: controller.signal }))).rejects.toMatchObject({ kind: "canceled" });
		expect(requestUrlMock.calls).toHaveLength(0);
	});

	it("wraps a non-Error transport failure", async () => {
		requestUrlMock.next = () => Promise.reject("weird");
		await expect(obsidianNetwork.request(req())).rejects.toThrow("weird");
	});

	it("rejects with the transport error when no answer arrives", async () => {
		requestUrlMock.next = () => Promise.reject(new Error("net down"));
		await expect(obsidianNetwork.request(req())).rejects.toThrow("net down");
	});
});

describe("settings tab", () => {
	function tab(net = obsidianNetwork) {
		const saved = vi.fn(() => Promise.resolve());
		const plugin = { settings: structuredClone(DEFAULT_SETTINGS), saveSettings: saved, network: net, app: {} } as unknown as BookHarnessPlugin;
		return { t: new PluginSettingsTab({} as never, plugin), plugin, saved };
	}

	it("reads and writes nested device settings and saves through the plugin", async () => {
		const { t, plugin, saved } = tab();
		await t.setControlValue("device.endpoint", "http://x:1");
		expect(plugin.settings.device.endpoint).toBe("http://x:1");
		expect(t.getControlValue("device.endpoint")).toBe("http://x:1");
		expect(t.getControlValue("missing.deep")).toBeUndefined();
		await t.setControlValue("logLevel", "debug");
		expect(saved).toHaveBeenCalledTimes(2);
	});

	it("runs the connection test only when the action is pressed and reports in a notice", async () => {
		const { t, plugin } = tab({ request: vi.fn(() => Promise.reject(new Error("x"))) } as never);
		plugin.settings.device.endpoint = "http://h:1";
		const items = t.getSettingDefinitions().flatMap((g) => ("items" in g ? g.items ?? [] : [])) as unknown as Array<{ name: string; action?: () => void }>;
		const action = items.find((i) => i.name === "Test connection")!.action!;
		expect(Notice.instances).toHaveLength(0);
		action();
		await vi.waitFor(() => expect(Notice.instances).toHaveLength(1));
		expect(Notice.instances[0]?.message).toMatch(/^Connection problem\.\nCould not reach/);
		(plugin as unknown as { network: unknown }).network = { request: () => Promise.resolve({ status: 200, text: JSON.stringify({ version: "1", models: [] }) }) };
		plugin.settings.device.endpoint = "http://h:1";
		action();
		await vi.waitFor(() => expect(Notice.instances).toHaveLength(2));
		expect(Notice.instances[1]?.message).toMatch(/^Connection works\./);
	});
});

describe("no unsolicited model calls (AC-C-1)", () => {
	it("loading the plugin, settings and layout, and editing or saving, sends nothing over the network", async () => {
		const request = vi.fn(() => Promise.reject(new Error("should not be called")));
		const written: Record<string, string> = {};
		const adapter = { exists: () => Promise.resolve(false), read: () => Promise.resolve(""), write: (p: string, d: string) => ((written[p] = d), Promise.resolve()) };
		const handlers: Array<(...a: unknown[]) => unknown> = [];
		const app = {
			loadLocalStorage: () => ({ endpoint: "http://configured:11434", generationModel: "m", embeddingModel: "e" }),
			saveLocalStorage: () => undefined,
			vault: { adapter, configDir: ".obsidian", on: (_n: string, cb: (...a: unknown[]) => unknown) => (handlers.push(cb), {}), getMarkdownFiles: () => [] },
			workspace: { onLayoutReady: (cb: () => void) => cb(), on: () => ({}) },
		};
		const plugin = new BookHarnessPlugin(app as never, { id: "book-harness", dir: ".obsidian/plugins/book-harness" } as never);
		(plugin as unknown as { register: (f: () => void) => void }).register = () => undefined;
		(plugin as { network: unknown }).network = { request };
		await plugin.onload();
		await plugin.saveSettings();
		handlers.forEach((h) => h({ path: "x.md" }, "y.md"));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(request).not.toHaveBeenCalled();
		expect(requestUrlMock.calls).toEqual([]);
	});
});
