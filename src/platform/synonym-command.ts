import { Notice, type App, type Editor, type MarkdownView } from "obsidian";
import { OllamaClient, normalizeEndpoint } from "../core/ai/ollama";
import type { DiagnosticsLog } from "../core/ai/diagnostics";
import type { NetworkPort } from "../core/ai/network";
import { proposeReplacement, suggestAlternatives } from "../core/synonyms";
import type { BookHarnessSettings } from "../settings/defaults";
import { ConfirmModal } from "./confirm-modal";
import type { EditorHighlights } from "./editor-highlights";
import { createGuardedVault } from "./guarded-vault";
import { PickModal } from "./pick-modal";
import { platformRandom } from "./random";
import { sleep } from "./sleep";

export interface SynonymHost {
	settings: BookHarnessSettings;
	network: NetworkPort;
	diagnostics: DiagnosticsLog;
}

const fail = (e: unknown) => new Notice((e as Error).message, 8000);

/**
 * Suggest other words for the selected one, in its own sentence. Asks first (the sentence and paragraph go to the model
 * server), shows the alternatives, and turns the one you pick into a proposal that you still accept in the chapter.
 */
export async function suggestForSelection(app: App, host: SynonymHost, highlights: EditorHighlights, review: { schedule(): void }, editor: Editor, view: MarkdownView): Promise<void> {
	const path = view.file?.path;
	const selected = editor.getSelection();
	if (!path || selected.trim() === "" || selected.trim().split(/\s+/).length > 3) {
		new Notice("Select one word (or a short phrase of up to three words) first.", 8000);
		return;
	}
	const text = editor.getValue();
	const start = editor.posToOffset(editor.getCursor("from"));
	const end = editor.posToOffset(editor.getCursor("to"));
	const ctx = await highlights.contextFor(path, text);
	if (!ctx) return void new Notice("This note is not a chapter of a registered book.", 8000);
	const device = host.settings.device;
	const base = normalizeEndpoint(device.endpoint);
	if (base === null || device.generationModel === "") return void new Notice("Set the server address and the generation model in the Book Harness settings first.", 8000);
	new ConfirmModal(app, "Suggest other words", [`The selected word, its sentence and its paragraph will be sent to ${base} using the model "${device.generationModel}".`, "Nothing is changed in your chapter. If you pick an alternative it becomes a proposal that you accept or reject in the chapter."], "Suggest", () => {
		void (async () => {
			const now = () => new Date().toISOString();
			const found = await suggestAlternatives({ client: new OllamaClient(host.network, base), model: device.generationModel, diagnostics: host.diagnostics, now, sleep }, ctx.book.primaryLanguage, text, { start, end }, selected);
			new PickModal(app, `Another word for “${selected}”`, found.alternatives.map((a) => ({ value: a.text, label: a.note === "" ? a.text : `${a.text} (${a.note})` })), null, "Propose", (choice) => {
				void proposeReplacement(createGuardedVault(app), ctx.book, ctx.chapter, text, { start, end }, choice, device.generationModel, platformRandom, now()).then(() => {
					review.schedule();
					new Notice("Proposed. Review it in the chapter: nothing changes until you accept it.", 8000);
				}, fail);
			}).open();
		})().catch(fail);
	}).open();
}
