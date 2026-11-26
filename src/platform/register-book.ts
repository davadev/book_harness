import { Modal, Notice, Setting, type App, type TFolder } from "obsidian";
import { registerBook } from "../core/books";
import { platformRandom } from "./random";
import { createGuardedVault } from "./guarded-vault";

export interface RegisterBookRequest {
	title: string;
	language: string;
}

/** Asks for the two things a book needs at registration; everything else is edited later in the book's own notes. */
export class RegisterBookModal extends Modal {
	private title: string;
	private language = "en";

	constructor(app: App, defaultTitle: string, private readonly onSubmit: (req: RegisterBookRequest) => void) {
		super(app);
		this.title = defaultTitle;
	}

	onOpen(): void {
		this.titleEl.setText("Register a book");
		new Setting(this.contentEl).setName("Title").addText((t) => t.setValue(this.title).onChange((v) => (this.title = v)));
		new Setting(this.contentEl)
			.setName("Primary language")
			.setDesc("A language code such as en, de or cs.")
			.addText((t) => t.setValue(this.language).onChange((v) => (this.language = v)));
		new Setting(this.contentEl).addButton((b) =>
			b.setButtonText("Register").setCta().onClick(() => {
				this.close();
				this.onSubmit({ title: this.title, language: this.language.trim().toLowerCase() });
			}),
		);
	}
}

/** Register `folder` as a book and tell the author what happened. Existing notes in the folder are not touched. */
export async function registerBookInFolder(app: App, folder: TFolder, req: RegisterBookRequest): Promise<void> {
	if (folder.path === "/") {
		new Notice("Pick a folder inside the vault, not the vault root.", 8000);
		return;
	}
	try {
		const book = await registerBook(createGuardedVault(app), folder.path, req.title, req.language, platformRandom);
		new Notice(`Registered "${book.title}". Your notes in this folder were not changed.`);
	} catch (e) {
		new Notice(e instanceof Error ? e.message : String(e), 8000);
	}
}

/** Command entry: registers the folder of the note that is open. */
export function registerActiveFolder(app: App): void {
	const folder = app.workspace.getActiveFile()?.parent;
	if (!folder) {
		new Notice("Open a note inside the folder you want to register as a book.", 8000);
		return;
	}
	new RegisterBookModal(app, folder.name, (req) => void registerBookInFolder(app, folder, req)).open();
}
