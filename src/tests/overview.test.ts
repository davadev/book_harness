// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Book } from "../core/books";
import type { Chapter } from "../core/chapters";
import { buildOverview, type PanelContext } from "../core/panel-model";
import { renderOverview, type BookActions, type OverviewActions } from "../ui/overview";
import { installObsidianDom } from "./__mocks__/obsidianDom";

const book: Book = { id: "bk1", folder: "A", title: "My Book", primaryLanguage: "en", targetLanguages: ["de", "cs"], completion: { chapterStatus: "finalized" } };
const ch = (id: string, designation: string, order: number, notePath: string | null): Chapter => ({ id, bookId: "bk1", designation, order, status: "drafting", notePath, path: id });

type Mocked = OverviewActions & { registerFolder: ReturnType<typeof vi.fn> } & Record<keyof BookActions, ReturnType<typeof vi.fn>>;
function actions(): Mocked {
	const book = { openNote: vi.fn(), setStatus: vi.fn(), move: vi.fn(), rename: vi.fn(), unbind: vi.fn(), promoteActive: vi.fn(), planChapter: vi.fn() };
	return { ...book, registerFolder: vi.fn(), forBook: () => book as never } as never;
}

let root: HTMLElement;
beforeEach(() => {
	installObsidianDom();
	const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
	proto.empty = function (this: HTMLElement) {
		this.replaceChildren();
	};
	proto.addClass = function (this: HTMLElement, c: string) {
		this.classList.add(c);
	};
	root = document.createElement("div");
});

const text = () => root.textContent ?? "";
const click = (label: string) => (Array.from(root.querySelectorAll("button")).find((b) => b.textContent === label) as HTMLButtonElement).click();

describe("overview rendering", () => {
	it("explains an empty vault and offers to register a book", () => {
		const a = actions();
		renderOverview(root, { kind: "no-books" }, null, a);
		expect(text()).toContain("No books yet");
		click("Register this note's folder as a book");
		expect(a.registerFolder).toHaveBeenCalled();
	});

	it("explains why it is inactive", () => {
		const a = actions();
		renderOverview(root, { kind: "inactive", reason: "no-active-note" }, null, a);
		expect(text()).toContain("Open a note to see its book.");
		renderOverview(root, { kind: "inactive", reason: "not-in-a-book" }, null, a);
		expect(text()).toContain("not part of a registered book");
		click("Register this note's folder as a book");
		expect(a.registerFolder).toHaveBeenCalled();
	});

	it("shows an empty book with the right actions for a plain manuscript note", () => {
		const a = actions();
		const ctx = { kind: "book", book, activePath: "A/x.md", role: "manuscript", chapterId: null } as const;
		renderOverview(root, ctx, buildOverview(book, [], "A/x.md", () => true), a);
		expect(text()).toContain("My Book");
		expect(text()).toContain("en → de, cs");
		expect(text()).toContain("No chapters yet");
		click("Make this note a chapter");
		click("Plan a chapter");
		expect(a.promoteActive).toHaveBeenCalledWith("A/x.md");
		expect(a.planChapter).toHaveBeenCalled();
	});

	it("omits the promote button when the note is already a chapter and shows no language arrow for one language", () => {
		const ctx: PanelContext = { kind: "book", book: { ...book, targetLanguages: [] }, activePath: "A/a.md", role: "chapter", chapterId: "a" };
		renderOverview(root, ctx, buildOverview(book, [ch("a", "Chapter 1", 1, "A/a.md")], "A/a.md", () => true), actions());
		expect(text()).not.toContain("Make this note a chapter");
		expect(text()).toContain("en");
		expect(text()).not.toContain("→");
		expect(text()).toContain("Open now");
	});

	it("renders chapters in order with controls that call the actions", () => {
		const a = actions();
		const chapters = [ch("b", "Chapter 3", 2, "A/b.md"), ch("a", "Chapter 1", 1, "A/a.md"), ch("p", "Chapter 5", 3, null), ch("m", "Chapter 9", 4, "A/gone.md")];
		const ctx = { kind: "book", book, activePath: "A/z.md", role: "manuscript", chapterId: null } as const;
		renderOverview(root, ctx, buildOverview(book, chapters, null, (p) => p !== "A/gone.md"), a);
		const items = Array.from(root.querySelectorAll(".bh-chapter")).map((li) => li.querySelector("button")?.textContent);
		expect(items).toEqual(["Chapter 1", "Chapter 3", "Chapter 5", "Chapter 9"]);
		expect(text()).toContain("To do (");
		expect(text()).toContain('There is no "Chapter 2"');
		expect(text()).toContain("No file yet");
		expect(text()).toContain("Note not found");
		const first = root.querySelector(".bh-chapter") as HTMLElement;
		(first.querySelector(".bh-link") as HTMLButtonElement).click();
		expect(a.openNote).toHaveBeenCalledWith("A/a.md");
		const select = first.querySelector("select") as HTMLSelectElement;
		expect(select.getAttribute("aria-label")).toBe("Status of Chapter 1");
		select.value = "finalized";
		select.dispatchEvent(new Event("change"));
		expect(a.setStatus).toHaveBeenCalledWith("a", "finalized");
		const btn = (li: Element, label: string) => Array.from(li.querySelectorAll("button")).find((b) => b.textContent === label) as HTMLButtonElement;
		expect(btn(first, "Up").disabled).toBe(true);
		btn(first, "Down").click();
		expect(a.move).toHaveBeenCalledWith("a", "down");
		btn(first, "Rename").click();
		expect(a.rename).toHaveBeenCalledWith("a", "Chapter 1");
		btn(first, "Unlink").click();
		expect(a.unbind).toHaveBeenCalledWith("a");
		const lis = Array.from(root.querySelectorAll(".bh-chapter"));
		expect(btn(lis[3]!, "Down").disabled).toBe(true);
		btn(lis[3]!, "Up").click();
		expect(a.move).toHaveBeenCalledWith("m", "up");
		expect(btn(lis[2]!, "Unlink")).toBeUndefined();
		// a planned slot and a missing note cannot be opened
		(lis[2]!.querySelector(".bh-link") as HTMLButtonElement).click();
		(lis[3]!.querySelector(".bh-link") as HTMLButtonElement).click();
		expect(a.openNote).toHaveBeenCalledTimes(1);
	});

	it("lists to-dos, required first, and opens the note for one that has a note", () => {
		const a = actions();
		const chapters = [ch("a", "Chapter 1", 1, "A/a.md"), ch("b", "Chapter 2", 2, null)];
		const ctx = { kind: "book", book, activePath: "A/z.md", role: "manuscript", chapterId: null } as const;
		renderOverview(root, ctx, buildOverview(book, chapters, null, () => true), a);
		const items = Array.from(root.querySelectorAll(".bh-todo")).map((li) => li.textContent);
		expect(items).toEqual(["RequiredChapter 1 is drafting; this book requires finalized.", "Required Chapter 2 has no manuscript note yet."]);
		(root.querySelector(".bh-todo button") as HTMLButtonElement).click();
		expect(a.openNote).toHaveBeenCalledWith("A/a.md");
		expect(root.querySelector(".bh-info")).toBeNull();
	});

	it("labels informational notes differently from requirements", () => {
		const chapters = [ch("a", "Chapter 1", 1, null), ch("c", "Chapter 3", 3, null)];
		const ctx = { kind: "book", book: { ...book, completion: { chapterStatus: "planned" as const } }, activePath: "A/z.md", role: "manuscript", chapterId: null } as const;
		renderOverview(root, ctx, buildOverview(ctx.book, chapters, null, () => true), actions());
		expect(root.querySelector(".bh-info")?.textContent).toContain("Note");
	});

	it("lists conflicts the author must resolve", () => {
		const chapters = [ch("a", "One", 1, null), ch("b", "One", 1, null)];
		const ctx = { kind: "book", book, activePath: "A/z.md", role: "manuscript", chapterId: null } as const;
		renderOverview(root, ctx, buildOverview(book, chapters, null, () => true), actions());
		expect(text()).toContain("Order 1 is used by");
	});

	it("draws only the header when no overview is available", () => {
		renderOverview(root, { kind: "book", book, activePath: "A/z.md", role: "folder", chapterId: null }, null, actions());
		expect(root.querySelector("ol")).toBeNull();
		expect(text()).toContain("My Book");
	});
});
