// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Notice } from "./__mocks__/obsidian";
import { installObsidianDom } from "./__mocks__/obsidianDom";
import { RegisterBookModal, registerActiveFolder } from "../platform/register-book";

beforeEach(() => {
	installObsidianDom();
	Notice.instances.length = 0;
	(HTMLElement.prototype as unknown as { setText: (t: string) => void }).setText = function (this: HTMLElement, t: string) {
		this.textContent = t;
	};
});

describe("RegisterBookModal", () => {
	it("submits the edited title and a normalized language", () => {
		const submit = vi.fn();
		const modal = new RegisterBookModal({} as never, "Default", submit);
		modal.open();
		expect(modal.titleEl.textContent).toBe("Register a book");
		const inputs = modal.contentEl.querySelectorAll("input") as NodeListOf<HTMLInputElement>;
		expect(inputs[0]?.value).toBe("Default");
		expect(inputs[1]?.value).toBe("en");
		inputs[0]!.value = "Real title";
		inputs[0]!.dispatchEvent(new Event("input"));
		inputs[1]!.value = " DE ";
		inputs[1]!.dispatchEvent(new Event("input"));
		(modal.contentEl.querySelector("button") as HTMLButtonElement).click();
		expect(submit).toHaveBeenCalledWith({ title: "Real title", language: "de" });
	});

	it("opens from the command for the open note's folder and registers only after submit", async () => {
		const create = vi.fn(() => Promise.resolve());
		const vault = { create, getAbstractFileByPath: () => null, createFolder: () => Promise.resolve(), getMarkdownFiles: () => [] };
		const app = { vault, workspace: { getActiveFile: () => ({ parent: { path: "My Book", name: "My Book" } }) } } as never;
		registerActiveFolder(app);
		expect(create).not.toHaveBeenCalled();
		const button = document.querySelector("button") as HTMLButtonElement;
		button.click();
		await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
		expect(create.mock.calls[0]).toEqual(["My Book/_book-harness/book.md", expect.stringContaining("title: My Book")]);
		expect(Notice.instances[0]?.message).toMatch(/Registered "My Book"/);
	});
});
