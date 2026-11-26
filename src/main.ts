import { Notice, Plugin } from "obsidian";
import { DEFAULT_CRASH_STATE, crashStatePath, decideOnLoad, readCrashState, writeCrashState } from "./crashGuard";
import { logDebug, logError, logWarn, setLogLevel } from "./logger";
import { onVaultRename } from "./platform/follow-renames";
import { PANEL_VIEW_TYPE, BookHarnessView } from "./platform/panel-view";
import { registerActiveFolder } from "./platform/register-book";
import { PluginSettingsTab } from "./settings/SettingsTab";
import { DEFAULT_SETTINGS, normalizeSettings, type BookHarnessSettings } from "./settings/defaults";

const CRASH_THRESHOLD = 5;
const SURVIVED_MS = 30_000;

export default class BookHarnessPlugin extends Plugin {
	settings: BookHarnessSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		try {
			await this.onloadInner();
		} catch (e) {
			logError("onload failed", e);
			new Notice(`Book Harness failed to load: ${e instanceof Error ? e.message : String(e)}`, 0);
			throw e;
		}
	}

	private async onloadInner(): Promise<void> {
		const adapter = this.app.vault.adapter;
		const path = crashStatePath(this.manifest, this.app.vault.configDir);
		const decision = decideOnLoad(await readCrashState(adapter, path), CRASH_THRESHOLD);
		await writeCrashState(adapter, path, decision.next);
		if (decision.action !== "proceed") {
			logWarn("startup stopped by crash guard:", decision.action);
			new Notice("Book Harness was turned off after repeated failed starts. Re-enable it under community plugins.", 0);
			return;
		}
		await this.loadSettings();
		logDebug("settings loaded");
		this.addCommand({ id: "register-book", name: "Register this note's folder as a book", callback: () => registerActiveFolder(this.app) });
		this.registerView(PANEL_VIEW_TYPE, (leaf) => new BookHarnessView(leaf));
		this.addCommand({ id: "open-panel", name: "Open the book panel", callback: () => void this.openPanel() });
		this.addRibbonIcon("book-open", "Open the book panel", () => void this.openPanel());
		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(this.app.vault.on("rename", (file, oldPath) => void onVaultRename(this.app, file, oldPath)));
		});
		this.addSettingTab(new PluginSettingsTab(this.app, this));
		const survived = window.setTimeout(() => {
			void writeCrashState(adapter, path, DEFAULT_CRASH_STATE);
		}, SURVIVED_MS);
		this.register(() => window.clearTimeout(survived));
	}

	async openPanel(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(PANEL_VIEW_TYPE)[0];
		const leaf = existing ?? this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		if (!existing) await leaf.setViewState({ type: PANEL_VIEW_TYPE, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
		setLogLevel(this.settings.logLevel);
	}

	async saveSettings(): Promise<void> {
		setLogLevel(this.settings.logLevel);
		await this.saveData(this.settings);
	}
}
