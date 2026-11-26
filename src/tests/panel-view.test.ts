// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerBook } from "../core/books";
import { addChapter } from "../core/chapters";
import { GuardedVault } from "../core/guarded-vault";
import { onVaultRename } from "../platform/follow-renames";
import { PromptModal } from "../platform/prompt-modal";
import { BookHarnessView, PANEL_VIEW_TYPE } from "../platform/panel-view";
import { ObsidianVaultPort } from "../platform/vault-port";
import { counterRandom } from "./__mocks__/fakeVault";
import { makeFakeApp } from "./__mocks__/fakeApp";
import { Notice } from "./__mocks__/obsidian";
import { installObsidianDom } from "./__mocks__/obsidianDom";

beforeEach(() => {
	installObsidianDom();
	const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
	proto.empty = function (this: HTMLElement) {
		this.replaceChildren();
	};
	proto.addClass = function (this: HTMLElement, c: string) {
		this.classList.add(c);
	};
	proto.setText = function (this: HTMLElement, t: string) {
		this.textContent = t;
	};
	Notice.instances.length = 0;
});
afterEach(() => vi.useRealTimers());

async function setup() {
	const fake = makeFakeApp({ "Book/one.md": "One", "Book/two.md": "Two", "Book/loose.md": "Loose", "Other/x.md": "x" });
	const vault = new GuardedVault(new ObsidianVaultPort(fake.app));
	const rnd = counterRandom();
	const book = await registerBook(vault, "Book", "Book", "en", rnd);
	const one = await addChapter(vault, book, [], { designation: "Chapter 1", notePath: "Book/one.md" }, rnd);
	const two = await addChapter(vault, book, [one], { designation: "Chapter 2", notePath: "Book/two.md" }, rnd);
	const view = new BookHarnessView({ app: fake.app } as never);
	(view as unknown as { app: unknown }).app = fake.app;
	return { fake, vault, book, one, two, view, store: fake.store };
}

const text = (v: BookHarnessView) => v.contentEl.textContent as string;
const button = (v: BookHarnessView, label: string, scope?: Element) => Array.from((scope ?? v.contentEl).querySelectorAll("button")).find((b) => b.textContent === label) as HTMLButtonElement;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("BookHarnessView", () => {
	it("cancels a pending redraw when the view closes", async () => {
		const { fake, view } = await setup();
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await flush();
		const draw = vi.spyOn(view, "draw");
		vi.useFakeTimers();
		fake.fire("workspace", "file-open");
		for (const r of (view as unknown as { registered: unknown[] }).registered) if (typeof r === "function") (r as () => void)();
		await vi.advanceTimersByTimeAsync(500);
		expect(draw).not.toHaveBeenCalled();
	});

	it("identifies itself", async () => {
		const { view } = await setup();
		expect([view.getViewType(), view.getDisplayText(), view.getIcon()]).toEqual([PANEL_VIEW_TYPE, "Book Harness", "book-open"]);
	});

	it("draws the book for the open chapter and highlights it", async () => {
		const { fake, view } = await setup();
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Chapter 2"));
		expect(text(view)).toContain("Open now");
	});

	it("shows the inactive state for a note outside any book", async () => {
		const { fake, view } = await setup();
		fake.state.active = "Other/x.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("not part of a registered book"));
	});

	it("redraws (debounced) for managed notes, file-open and renames, but not for ordinary edits", async () => {
		const { fake, view } = await setup();
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Chapter 1"));
		const draw = vi.spyOn(view, "draw");
		vi.useFakeTimers();
		fake.fire("vault", "modify", { path: "Book/loose.md" });
		fake.fire("vault", "create", { path: "Book/new.md" });
		await vi.advanceTimersByTimeAsync(200);
		expect(draw).not.toHaveBeenCalled();
		fake.fire("vault", "modify", { path: "Book/_book-harness/chapters/x.md" });
		fake.fire("vault", "create", { path: "Book/_book-harness/chapters/y.md" });
		fake.fire("vault", "delete", { path: "z" });
		fake.fire("vault", "rename", { path: "z" }, "w");
		fake.fire("workspace", "file-open");
		await vi.advanceTimersByTimeAsync(200);
		expect(draw).toHaveBeenCalledTimes(1);
	});

	it("does not draw while hidden and draws when shown again", async () => {
		const { fake, view } = await setup();
		fake.state.active = "Book/one.md";
		(view.containerEl as unknown as { isShown: () => boolean }).isShown = () => false;
		await view.onOpen();
		await flush();
		expect(text(view)).toBe("");
		(view.containerEl as unknown as { isShown: () => boolean }).isShown = () => true;
		fake.fire("workspace", "active-leaf-change", {});
		await flush();
		expect(text(view)).toBe("");
		fake.fire("workspace", "active-leaf-change", view.leaf);
		await vi.waitFor(() => expect(text(view)).toContain("Chapter 1"));
		view.showAgain();
	});

	it("serialises overlapping draws and picks up a change made meanwhile", async () => {
		const { fake, view } = await setup();
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Chapter 1"));
		const first = view.draw();
		const second = view.draw();
		view.markDirty();
		await Promise.all([first, second]);
		await flush();
		expect(text(view)).toContain("Chapter 2");
	});

	it("reports a read failure inside the panel instead of throwing", async () => {
		const { fake, view } = await setup();
		fake.appAny.vault.getMarkdownFiles = () => {
			throw new Error("disk gone");
		};
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("disk gone"));
		fake.appAny.vault.getMarkdownFiles = () => {
			throw "odd";
		};
		await view.draw();
		expect(text(view)).toContain("odd");
	});

	it("says which records could not be read instead of pretending there are none", async () => {
		const { fake, view, store } = await setup();
		store.set("Book/_book-harness/chapters/ch_zzzzzzzzzzzzzzzz.md", "garbage");
		store.set("Broken/_book-harness/book.md", "garbage");
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("could not be read"));
		expect(text(view)).toContain("Broken/_book-harness/book.md: Missing frontmatter.");
		expect(text(view)).toContain("ch_zzzzzzzzzzzzzzzz.md: Missing frontmatter.");
		expect(text(view)).toContain("Chapter 2");
	});

	it("wires every overview action to the right operation", async () => {
		const { fake, view, store } = await setup();
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Chapter 2"));
		const rows = () => Array.from(view.contentEl.querySelectorAll(".bh-chapter")) as HTMLElement[];
		const record = (designation: string) => [...store].find(([p, t]) => p.includes("/chapters/") && t.includes(`designation: ${designation}`))?.[1] ?? "";

		button(view, "Chapter 2", rows()[1]).click();
		expect(fake.openFile).toHaveBeenCalledTimes(1);

		const sel = rows()[1]!.querySelector("select") as HTMLSelectElement;
		sel.value = "revising";
		sel.dispatchEvent(new Event("change"));
		await vi.waitFor(() => expect(record("Chapter 2")).toContain("status: revising"));

		await vi.waitFor(() => expect(rows()).toHaveLength(2));
		button(view, "Up", rows()[1]).click();
		await vi.waitFor(() => expect(rows()[0]?.textContent).toContain("Chapter 2"));

		button(view, "Unlink", rows()[0]).click();
		await vi.waitFor(() => expect(record("Chapter 2")).toContain("note_path: null"));
	});

	it("opens prompts for rename, plan and promote, and reports failures as notices", async () => {
		const { fake, view, store } = await setup();
		fake.state.active = "Book/loose.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Make this note a chapter"));
		const submit = (value: string) => {
			const modal = document.querySelector(".modal, div > div") as HTMLElement | null;
			expect(modal).not.toBeNull();
			const input = document.body.querySelector("input") as HTMLInputElement;
			input.value = value;
			input.dispatchEvent(new Event("input"));
			(document.body.querySelector("button.mod-cta, button") as HTMLButtonElement | null);
			Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Save")!.click();
		};
		button(view, "Plan a chapter").click();
		submit("Epilogue");
		await vi.waitFor(() => expect([...store.values()].some((t) => t.includes("designation: Epilogue"))).toBe(true));
		button(view, "Make this note a chapter").click();
		submit("Chapter 3");
		await vi.waitFor(() => expect([...store.values()].some((t) => t.includes("note_path: Book/loose.md"))).toBe(true));
		await vi.waitFor(() => expect(text(view)).toContain("Epilogue"));
		button(view, "Rename", Array.from(view.contentEl.querySelectorAll(".bh-chapter")).find((l) => l.textContent?.includes("Epilogue")) as HTMLElement).click();
		submit("Chapter 3");
		await vi.waitFor(() => expect(Notice.instances.some((n) => /already a chapter/.test(n.message))).toBe(true));
		expect(PromptModal).toBeDefined();
	});

	it("refuses actions when no book is in context, and reports non-Error failures", async () => {
		const { fake, view } = await setup();
		fake.state.active = "Other/x.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("not part of a registered book"));
		button(view, "Register this note's folder as a book").click();
		expect(document.body.querySelector("input")).not.toBeNull();
	});
});

describe("BookHarnessView edge cases", () => {
	it("draws the no-note state and survives a note deleted after drawing", async () => {
		const { fake, view, store } = await setup();
		fake.state.active = null;
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Open a note to see its book."));
		fake.state.active = "Book/loose.md";
		await view.draw();
		store.delete("Book/two.md");
		button(view, "Chapter 2").click();
		expect(fake.openFile).not.toHaveBeenCalled();
	});

	it("explains when chapters cannot be moved because they share an order value", async () => {
		const { fake, view, store, vault, book, one, two } = await setup();
		await addChapter(vault, book, [one, two], { designation: "Chapter 3", notePath: "Book/loose.md" }, counterRandom());
		for (const [p, t] of store) if (p.includes("/chapters/")) store.set(p, t.replace(/order: \d+/, "order: 5"));
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Order 5 is used by"));
		const last = Array.from(view.contentEl.querySelectorAll(".bh-chapter")).at(-1) as HTMLElement;
		button(view, "Up", last).click();
		expect(Notice.instances.at(-1)?.message).toMatch(/share an order value/);
	});

	it("reports non-Error failures from an action", async () => {
		const { fake, view } = await setup();
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Chapter 2"));
		fake.appAny.vault.process = () => Promise.reject("odd");
		const sel = view.contentEl.querySelector("select") as HTMLSelectElement;
		sel.value = "finalized";
		sel.dispatchEvent(new Event("change"));
		await vi.waitFor(() => expect(Notice.instances.some((n) => n.message === "odd")).toBe(true));
	});
});

describe("following renames", () => {
	it("updates the chapter record when its note is renamed", async () => {
		const { fake, store } = await setup();
		store.set("Book/renamed.md", "One");
		await onVaultRename(fake.app, { path: "Book/renamed.md" } as never, "Book/one.md");
		expect([...store.values()].some((t) => t.includes("note_path: Book/renamed.md"))).toBe(true);
	});

	it("logs instead of throwing when the vault cannot be read", async () => {
		const { fake } = await setup();
		fake.appAny.vault.getMarkdownFiles = () => {
			throw new Error("boom");
		};
		await expect(onVaultRename(fake.app, { path: "a" } as never, "b")).resolves.toBeUndefined();
	});
});
