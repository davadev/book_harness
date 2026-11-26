import { Modal, Setting, type App } from "obsidian";

/** Shows exactly what will happen and waits for the author's yes. Used before anything is sent to a model. */
export class ConfirmModal extends Modal {
	constructor(app: App, private readonly heading: string, private readonly lines: readonly string[], private readonly confirmLabel: string, private readonly onConfirm: () => void) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.heading);
		for (const line of this.lines) this.contentEl.createEl("p", { text: line });
		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) =>
				b.setButtonText(this.confirmLabel).setCta().onClick(() => {
					this.close();
					this.onConfirm();
				}),
			);
	}
}
