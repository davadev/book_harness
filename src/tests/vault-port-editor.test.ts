import { describe, expect, it, vi } from "vitest";
import { MarkdownView } from "./__mocks__/obsidian";
import { makeFakeApp } from "./__mocks__/fakeApp";
import { ObsidianVaultPort } from "../platform/vault-port";

function withEditor(initial: string, path = "Book/one.md") {
	const fake = makeFakeApp({ [path]: initial });
	let value = initial;
	const calls: Array<[string, number, number]> = [];
	const editor = {
		getValue: () => value,
		offsetToPos: (n: number) => n,
		replaceRange: vi.fn((text: string, from: number, to: number) => {
			calls.push([text, from, to]);
			value = value.slice(0, from) + text + value.slice(to);
		}),
	};
	const view = Object.assign(new MarkdownView(), { file: { path }, editor });
	(fake.appAny.workspace as unknown as { getLeavesOfType: () => unknown[] }).getLeavesOfType = () => [{ view }, { view: {} }];
	return { fake, editor, calls, value: () => value, view };
}

describe("writeAuthorized", () => {
	it("edits only the changed middle through the open editor, in one operation", async () => {
		const { fake, editor, calls, value } = withEditor("The captian walked home.");
		const ok = await new ObsidianVaultPort(fake.app).writeAuthorized("Book/one.md", "The captian walked home.", "The captain walked home.");
		expect(ok).toBe(true);
		expect(editor.replaceRange).toHaveBeenCalledTimes(1);
		expect(calls).toEqual([["ai", 8, 10]]);
		expect(value()).toBe("The captain walked home.");
		expect(fake.store.get("Book/one.md")).toBe("The captian walked home.");
	});

	it("refuses when the editor holds text the proposal was not checked against", async () => {
		const { fake, editor } = withEditor("Edited since.");
		expect(await new ObsidianVaultPort(fake.app).writeAuthorized("Book/one.md", "Old text.", "New text.")).toBe(false);
		expect(editor.replaceRange).not.toHaveBeenCalled();
	});

	it("handles insertions, deletions and replacing everything", async () => {
		for (const [from, to] of [["abc", "abcd"], ["abcd", "abc"], ["abc", "xyz"], ["aa", "aaa"]] as const) {
			const { fake, value } = withEditor(from);
			expect(await new ObsidianVaultPort(fake.app).writeAuthorized("Book/one.md", from, to)).toBe(true);
			expect(value()).toBe(to);
		}
	});

	it("falls back to an atomic file replacement when the note is not open, and refuses a stale file", async () => {
		const fake = makeFakeApp({ "Book/one.md": "old" });
		const port = new ObsidianVaultPort(fake.app);
		expect(await port.writeAuthorized("Book/one.md", "old", "new")).toBe(true);
		expect(fake.store.get("Book/one.md")).toBe("new");
		expect(await port.writeAuthorized("Book/one.md", "old", "other")).toBe(false);
	});

	it("ignores editors showing other notes", async () => {
		const { fake, editor } = withEditor("text", "Book/other.md");
		fake.store.set("Book/one.md", "old");
		expect(await new ObsidianVaultPort(fake.app).writeAuthorized("Book/one.md", "old", "new")).toBe(true);
		expect(editor.replaceRange).not.toHaveBeenCalled();
	});
});
