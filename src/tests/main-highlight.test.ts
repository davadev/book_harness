// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import BookHarnessPlugin from "../main";
import { setHighlights } from "../platform/editor/entity-highlights";

describe("a tapped highlight", () => {
	it("asks the plugin to show that entity in the panel", async () => {
		const adapter = { exists: () => Promise.resolve(false), read: () => Promise.resolve(""), write: () => Promise.resolve() };
		const workspace = { onLayoutReady: (cb: () => void) => cb(), on: () => ({}), getLeavesOfType: () => [] as unknown[], getRightLeaf: () => null };
		const app = { loadLocalStorage: () => null, saveLocalStorage: () => undefined, vault: { adapter, configDir: ".obsidian", on: () => ({}), getMarkdownFiles: () => [] }, workspace };
		const plugin = new BookHarnessPlugin(app as never, { id: "book-harness", dir: ".obsidian/plugins/book-harness" } as never);
		(plugin as unknown as { register: () => void }).register = () => undefined;
		await plugin.onload();
		const select = vi.spyOn(plugin, "selectEntity").mockResolvedValue();
		const extensions = (plugin as unknown as { editorExtensions: never[] }).editorExtensions;
		const parent = document.body.appendChild(document.createElement("div"));
		const view = new EditorView({ parent, state: EditorState.create({ doc: "Philip walked.", extensions }) });
		view.dispatch({ effects: setHighlights.of([{ entityId: "en_p", type: "character", name: "Philip", from: 0, to: 6, text: "Philip" }]) });
		(view.dom.querySelector("[data-bh-entity]") as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(select).toHaveBeenCalledWith("en_p");
		view.destroy();
	});
});
