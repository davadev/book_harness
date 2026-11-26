import { Notice, Plugin } from "obsidian";
import { DEFAULT_CRASH_STATE, crashStatePath, decideOnLoad, readCrashState, writeCrashState } from "./crashGuard";
import { logDebug, logError, logWarn, setLogLevel } from "./logger";
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
		this.addSettingTab(new PluginSettingsTab(this.app, this));
		const survived = window.setTimeout(() => {
			void writeCrashState(adapter, path, DEFAULT_CRASH_STATE);
		}, SURVIVED_MS);
		this.register(() => window.clearTimeout(survived));
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
