import { Modal, Setting, type App } from "obsidian";

/** Choose one of a few options, with an optional text field (used for "add an entity": a kind and a name). */
export class PickModal extends Modal {
	private choice: string;
	private text = "";

	constructor(app: App, private readonly heading: string, private readonly options: ReadonlyArray<{ value: string; label: string }>, private readonly withText: string | null, private readonly confirmLabel: string, private readonly onSubmit: (choice: string, text: string) => void) {
		super(app);
		this.choice = options[0].value;
	}

	onOpen(): void {
		this.titleEl.setText(this.heading);
		new Setting(this.contentEl).setName("Choose").addDropdown((d) => {
			for (const o of this.options) d.addOption(o.value, o.label);
			d.setValue(this.choice).onChange((v) => (this.choice = v));
		});
		if (this.withText !== null) new Setting(this.contentEl).setName(this.withText).addText((t) => t.onChange((v) => (this.text = v)));
		new Setting(this.contentEl).addButton((b) =>
			b.setButtonText(this.confirmLabel).setCta().onClick(() => {
				this.close();
				this.onSubmit(this.choice, this.text);
			}),
		);
	}
}
