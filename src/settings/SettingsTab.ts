import { PluginSettingTab, type App, type SettingDefinitionItem } from "obsidian";
import type BookHarnessPlugin from "../main";

export class PluginSettingsTab extends PluginSettingTab {
	constructor(app: App, plugin: BookHarnessPlugin) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
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
				],
			},
		];
	}
}
