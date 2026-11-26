import { Notice, Plugin, type MarkdownView } from "obsidian";
import { DEFAULT_CRASH_STATE, crashStatePath, decideOnLoad, readCrashState, writeCrashState } from "./crashGuard";
import { logDebug, logError, logWarn, setLogLevel } from "./logger";
import { EditorHighlights } from "./platform/editor-highlights";
import { suggestForSelection } from "./platform/synonym-command";
import { linkSelection, removeHighlightAtCursor } from "./platform/highlight-commands";
import { EditorReview } from "./platform/editor-review";
import { JobRunner } from "./core/jobs";
import { onVaultRename } from "./platform/follow-renames";
import { PANEL_VIEW_TYPE, BookHarnessView } from "./platform/panel-view";
import { registerActiveFolder } from "./platform/register-book";
import { PluginSettingsTab } from "./settings/SettingsTab";
import type { IndexStorePort } from "./core/embeddings";
import { createIndexStore } from "./platform/index-store";
import { BookSearch } from "./core/search";
import { DiagnosticsLog } from "./core/ai/diagnostics";
import type { NetworkPort } from "./core/ai/network";
import { obsidianNetwork } from "./platform/network";
import { DEFAULT_SETTINGS, normalizeSettings, type BookHarnessSettings } from "./settings/defaults";

const CRASH_THRESHOLD = 5;
const SURVIVED_MS = 30_000;
const DEVICE_KEY = "book-harness-device";

export default class BookHarnessPlugin extends Plugin {
	settings: BookHarnessSettings = { ...DEFAULT_SETTINGS };
	private readonly runner = new JobRunner();
	readonly network: NetworkPort = obsidianNetwork;
	readonly diagnostics = new DiagnosticsLog();
	readonly search = new BookSearch();
	indexStore!: IndexStorePort;
	private editorReview: EditorReview | null = null;
	/** The entity whose details the panel shows (set by tapping a highlight), or null. */
	selectedEntity: string | null = null;

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
		this.indexStore = createIndexStore(this.app, this.manifest);
		logDebug("settings loaded");
		this.addCommand({ id: "register-book", name: "Register this note's folder as a book", callback: () => registerActiveFolder(this.app) });
		this.editorReview = new EditorReview(this.app);
		this.registerEditorExtension(this.editorReview.extension());
		const highlights = new EditorHighlights(this.app, () => this.settings.highlight, (id) => void this.selectEntity(id));
		this.registerEditorExtension(highlights.extension());
		this.addCommand({
			id: "toggle-highlights",
			name: "Show or hide entity highlights",
			callback: () => {
				this.settings.highlight.enabled = !this.settings.highlight.enabled;
				void this.saveSettings().then(() => highlights.schedule());
			},
		});
		this.addCommand({ id: "link-selection", name: "Link the selected words to an entity", editorCallback: (editor, view) => void linkSelection(this.app, highlights, editor, view as MarkdownView) });
		this.addCommand({ id: "remove-highlight", name: "Remove the entity highlight at the cursor", editorCallback: (editor, view) => void removeHighlightAtCursor(this.app, highlights, editor, view as MarkdownView) });
		this.addCommand({ id: "suggest-alternatives", name: "Suggest other words for the selected word", editorCallback: (editor, view) => void suggestForSelection(this.app, this, highlights, this.editorReview as EditorReview, editor, view as MarkdownView) });
		this.registerView(PANEL_VIEW_TYPE, (leaf) => new BookHarnessView(leaf, this.runner, this));
		this.addCommand({ id: "open-panel", name: "Open the book panel", callback: () => void this.openPanel() });
		this.addRibbonIcon("book-open", "Open the book panel", () => void this.openPanel());
		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(this.app.vault.on("rename", (file, oldPath) => void onVaultRename(this.app, file, oldPath)));
			const review = this.editorReview as EditorReview;
			const refresh = () => {
				review.schedule();
				highlights.schedule();
			};
			this.register(() => {
				review.cancel();
				highlights.cancel();
			});
			this.registerEvent(this.app.workspace.on("active-leaf-change", refresh));
			this.registerEvent(this.app.workspace.on("file-open", refresh));
			this.registerEvent(this.app.workspace.on("layout-change", refresh));
			this.registerEvent(this.app.vault.on("modify", refresh));
			review.schedule();
		});
		this.addSettingTab(new PluginSettingsTab(this.app, this));
		const survived = window.setTimeout(() => {
			void writeCrashState(adapter, path, DEFAULT_CRASH_STATE);
		}, SURVIVED_MS);
		this.register(() => window.clearTimeout(survived));
	}

	/** A highlight was tapped: show that entity beside the chapter. */
	async selectEntity(id: string): Promise<void> {
		this.selectedEntity = id;
		await this.openPanel();
		for (const leaf of this.app.workspace.getLeavesOfType(PANEL_VIEW_TYPE)) if (leaf.view instanceof BookHarnessView) leaf.view.markDirty();
	}

	clearSelectedEntity(): void {
		this.selectedEntity = null;
	}

	async openPanel(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(PANEL_VIEW_TYPE)[0];
		const leaf = existing ?? this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		if (!existing) await leaf.setViewState({ type: PANEL_VIEW_TYPE, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData(), this.app.loadLocalStorage(DEVICE_KEY));
		setLogLevel(this.settings.logLevel);
	}

	async saveSettings(): Promise<void> {
		setLogLevel(this.settings.logLevel);
		// Only the shared part goes to data.json; this device's server address never syncs.
		await this.saveData({ logLevel: this.settings.logLevel, highlight: this.settings.highlight });
		this.app.saveLocalStorage(DEVICE_KEY, this.settings.device);
	}
}
