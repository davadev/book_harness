import { Modal, Setting, type App } from "obsidian";

/** One text field, one button. Used for short author input such as a chapter designation. */
export class PromptModal extends Modal {
	private value: string;

	constructor(app: App, private readonly heading: string, private readonly label: string, initial: string, private readonly onSubmit: (value: string) => void) {
		super(app);
		this.value = initial;
	}

	onOpen(): void {
		this.titleEl.setText(this.heading);
		new Setting(this.contentEl).setName(this.label).addText((t) => t.setValue(this.value).onChange((v) => (this.value = v)));
		new Setting(this.contentEl).addButton((b) =>
			b.setButtonText("Save").setCta().onClick(() => {
				this.close();
				this.onSubmit(this.value);
			}),
		);
	}
}
