import { Notice, PluginSettingTab, type App, type SettingDefinitionItem } from "obsidian";
import { testConnection } from "../core/ai/connection";
import type BookHarnessPlugin from "../main";

export class PluginSettingsTab extends PluginSettingTab {
	constructor(app: App, private readonly host: BookHarnessPlugin) {
		super(app, host);
	}

	getControlValue(key: string): unknown {
		return key.split(".").reduce<unknown>((cur, part) => (cur as Record<string, unknown> | undefined)?.[part], this.host.settings);
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const parts = key.split(".");
		const last = parts.pop() as string;
		const holder = parts.reduce<Record<string, unknown>>((cur, part) => cur[part] as Record<string, unknown>, this.host.settings as unknown as Record<string, unknown>);
		holder[last] = value;
		await this.host.saveSettings();
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: "group",
				heading: "Model server (this device)",
				items: [
					{
						name: "Server address",
						desc: "Where your Ollama server is, for example http://my-computer:11434. Stored on this device only. Book Harness contacts this address only when you start an AI action or press Test connection; nothing is sent anywhere else. On a phone, use an address the phone can reach, not localhost.",
						control: { type: "text", key: "device.endpoint", placeholder: "http://my-computer:11434" },
					},
					{
						name: "Generation model",
						desc: "The model used for writing tasks such as summaries.",
						control: { type: "text", key: "device.generationModel", placeholder: "model name" },
					},
					{
						name: "Embedding model",
						desc: "The model used to build the search index.",
						control: { type: "text", key: "device.embeddingModel", placeholder: "model name" },
					},
					{
						name: "Test connection",
						desc: "Checks the server, lists the models and, if an embedding model is set, embeds one test word.",
						action: () => void this.runTest(),
					},
				],
			},
			{
				type: "group",
				heading: "Highlights in the editor",
				items: [
					{ name: "Highlight recognized names", desc: "Underline mentions of the entities found in each chapter. Your text is never changed; turning this off removes the underlines.", control: { type: "toggle", key: "highlight.enabled" } },
					{ name: "Characters", control: { type: "toggle", key: "highlight.character" } },
					{ name: "Places", control: { type: "toggle", key: "highlight.place" } },
					{ name: "Objects", control: { type: "toggle", key: "highlight.object" } },
					{ name: "Other kinds", control: { type: "toggle", key: "highlight.other" } },
				],
			},
			{
				type: "group",
				heading: "Diagnostics",
				items: [
					{
						name: "Log level",
						desc: "How much Book Harness writes to the developer console. Errors are always logged.",
						control: {
							type: "dropdown",
							key: "logLevel",
							options: { error: "Errors only", warn: "Warnings", info: "Info", debug: "Debug" },
						},
					},
					{
						name: "Copy recent model runs",
						desc: "Copies a list of the last model calls made since Obsidian started: which task, which model, how long, whether it needed a repair and how it ended. It contains no text from your book and no prompts, so it is safe to paste into a bug report.",
						action: () => void this.copyReport(),
					},
				],
			},
		];
	}

	private async copyReport(): Promise<void> {
		const report = this.host.diagnostics.report();
		await navigator.clipboard.writeText(report === "" ? "No model calls yet." : report);
		new Notice(report === "" ? "No model calls have been made yet." : "Copied the recent model runs.");
	}

	private async runTest(): Promise<void> {
		const report = await testConnection(this.host.network, this.host.settings.device);
		new Notice(`${report.ok ? "Connection works." : "Connection problem."}\n${report.lines.join("\n")}`, 15000);
	}
}
