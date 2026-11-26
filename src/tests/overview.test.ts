// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Book } from "../core/books";
import type { Chapter } from "../core/chapters";
import { buildOverview, type PanelContext } from "../core/panel-model";
import { renderOverview, type BookActions, type OverviewActions } from "../ui/overview";
import type { JobRecord } from "../core/jobs";
import type { ChapterStats } from "../core/task-state";
import { installObsidianDom } from "./__mocks__/obsidianDom";

const book: Book = { id: "bk1", folder: "A", title: "My Book", primaryLanguage: "en", targetLanguages: ["de", "cs"], completion: { chapterStatus: "finalized" } };
const ch = (id: string, designation: string, order: number, notePath: string | null): Chapter => ({ id, bookId: "bk1", designation, order, status: "drafting", notePath, path: id });

type Mocked = OverviewActions & { registerFolder: ReturnType<typeof vi.fn> } & Record<keyof BookActions, ReturnType<typeof vi.fn>>;
function actions(): Mocked {
	const book = { openNote: vi.fn(), setStatus: vi.fn(), move: vi.fn(), rename: vi.fn(), unbind: vi.fn(), promoteActive: vi.fn(), planChapter: vi.fn(), updateStats: vi.fn(), cancelJob: vi.fn(), dismissJob: vi.fn(), addTodo: vi.fn(), completeTodo: vi.fn(), summarize: vi.fn(), proofread: vi.fn(), decideEdits: vi.fn(), applyProposal: vi.fn(), addEntity: vi.fn(), renameEntity: vi.fn(), addAlias: vi.fn(), mergeEntity: vi.fn(), removeAlias: vi.fn(), splitEntity: vi.fn(), archiveEntity: vi.fn(), closeEntity: vi.fn(), extractEntities: vi.fn(), mergeDuplicate: vi.fn(), keepDistinct: vi.fn() };
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

	it("shows word counts with their freshness and offers an explicit update", () => {
		const a = actions();
		const chapters = [ch("a", "Chapter 1", 1, "A/a.md"), ch("b", "Chapter 2", 2, "A/b.md"), ch("c", "Chapter 3", 3, "A/c.md"), ch("d", "Chapter 4", 4, "A/d.md"), ch("e", "Chapter 5", 5, "A/e.md"), ch("f", "Chapter 6", 6, null)];
		const stats = new Map<string, ChapterStats>([["a", { words: 12345, status: "current" }], ["b", { words: 7, status: "stale" }], ["c", { words: null, status: "not_processed" }], ["d", { words: 3, status: "failed" }], ["e", { words: 4, status: "canceled" }]]);
		const ctx = { kind: "book", book, activePath: "A/z.md", role: "manuscript", chapterId: null } as const;
		renderOverview(root, ctx, buildOverview(book, chapters, null, () => true, stats), a);
		const notes = Array.from(root.querySelectorAll(".bh-chapter .bh-note")).map((n) => n.textContent);
		expect(notes).toEqual(["12,345 words", "7 words (out of date: the text changed since it was counted)", "Not counted yet", "3 words (last count failed)", "4 words (last count was canceled)"]);
		click("Update word counts");
		expect(a.updateStats).toHaveBeenCalled();
	});

	it("shows jobs with their problems and the right button for each state", () => {
		const a = actions();
		const job = (state: JobRecord["state"]): JobRecord => ({
			id: `jb_${state}`, bookId: "bk1", kind: "stats.words", state, authorization: { action: "x", by: "user", at: "t" }, startedAt: "t",
			items: [{ chapterId: "a", designation: "Chapter 1", state: "done" }, { chapterId: "b", designation: "Chapter 2", state: "failed", message: "io" }, { chapterId: "c", designation: "Chapter 3", state: "pending", message: "Not run: the app closed first." }],
		});
		const ctx = { kind: "book", book, activePath: "A/z.md", role: "manuscript", chapterId: null } as const;
		const overview = { ...buildOverview(book, [], null, () => true), jobs: [job("running"), job("interrupted"), job("completed")] };
		renderOverview(root, ctx, overview, a);
		const boxes = Array.from(root.querySelectorAll(".bh-job"));
		expect(boxes.map((b) => b.querySelector("strong")?.textContent)).toEqual(["Word count running: 1 of 3 chapters", "Word count interrupted: 1 of 3 chapters", "Word count finished: 1 of 3 chapters"]);
		expect(boxes[0]?.textContent).toContain("Chapter 2: io");
		expect(boxes[0]?.textContent).not.toContain("Not run");
		expect(boxes[1]?.textContent).toContain("Nothing was restarted");
		(boxes[0]?.querySelector("button") as HTMLButtonElement).click();
		(boxes[1]?.querySelector("button") as HTMLButtonElement).click();
		expect(a.cancelJob).toHaveBeenCalledWith("jb_running");
		expect(a.dismissJob).toHaveBeenCalledWith("jb_interrupted");
		expect(boxes[0]?.querySelector("button")?.textContent).toBe("Cancel");
		expect(boxes[2]?.querySelector("button")?.textContent).toBe("Dismiss");
	});

	it("shows suggested changes with per-change and explicit bulk decisions, and applies only accepted ones", () => {
		const a = actions();
		const edit = (id: string, decision: "pending" | "accepted" | "conflict" | "rejected" | "applied", original: string, replacement: string) => ({ id, from: 0, to: 1, original, replacement, before: "The long sentence before ", after: " and then the rest of it", decision });
		const proposal = { id: "pr_a", bookId: "bk1", chapterId: "a", origin: { action: "proofread" }, baseRevision: "r", createdAt: "t", edits: [edit("e1", "pending", "captian", "captain"), edit("e2", "pending", "teh", ""), edit("e3", "accepted", "", "new"), edit("e4", "conflict", "x", "y"), edit("e5", "rejected", "q", "r"), edit("e6", "applied", "s", "t")] };
		const ctx = { kind: "book", book, activePath: "A/z.md", role: "manuscript", chapterId: null } as const;
		renderOverview(root, ctx, buildOverview(book, [ch("a", "Chapter 1", 1, "A/a.md")], null, () => true, new Map(), [], [], [], new Map(), [proposal]), a);
		const box = root.querySelector(".bh-proposal") as HTMLElement;
		expect(box.textContent).toContain("Suggested changes for Chapter 1");
		expect(box.textContent).toContain("Your chapter is not changed until you accept a change and apply it.");
		expect(Array.from(box.querySelectorAll(".bh-edit")).map((e) => [e.querySelector("del")?.textContent, e.querySelector("ins")?.textContent])).toEqual([["captian", "captain"], ["teh", "(removed)"], ["(nothing)", "new"], ["x", "y"]]);
		expect(box.textContent).toContain("Could not be placed: the text changed");
		const label = (l: string) => box.querySelector(`button[aria-label="${l}"]`) as HTMLButtonElement;
		label("Accept the change captian to captain").click();
		expect(a.decideEdits).toHaveBeenLastCalledWith("pr_a", ["e1"], "accepted");
		label("Reject the change teh to ").click();
		expect(a.decideEdits).toHaveBeenLastCalledWith("pr_a", ["e2"], "rejected");
		expect(box.querySelector('button[aria-label="Accept the change x to y"]')).toBeNull();
		click("Accept all 2 undecided changes");
		expect(a.decideEdits).toHaveBeenLastCalledWith("pr_a", ["e1", "e2"], "accepted");
		click("Reject all 2 undecided changes");
		expect(a.decideEdits).toHaveBeenLastCalledWith("pr_a", ["e1", "e2"], "rejected");
		click("Apply 1 accepted change to the chapter");
		expect(a.applyProposal).toHaveBeenCalledWith("pr_a");
	});

	it("offers no bulk buttons for a single undecided change and hides proposals that are fully decided", () => {
		const a = actions();
		const e = (id: string, decision: "pending" | "rejected" | "applied") => ({ id, from: 0, to: 1, original: "a", replacement: "b", before: "", after: "", decision });
		const base = { bookId: "bk1", chapterId: "a", origin: { action: "proofread" }, baseRevision: "r", createdAt: "t" };
		const ctx = { kind: "book", book, activePath: "A/z.md", role: "manuscript", chapterId: null } as const;
		const proposals = [{ ...base, id: "pr_1", edits: [e("e1", "pending")] }, { ...base, id: "pr_2", edits: [e("e1", "rejected"), e("e2", "applied")] }, { ...base, id: "pr_3", chapterId: "gone", edits: [e("e1", "pending")] }];
		renderOverview(root, ctx, buildOverview(book, [ch("a", "Chapter 1", 1, "A/a.md")], null, () => true, new Map(), [], [], [], new Map(), proposals), a);
		expect(root.querySelectorAll(".bh-proposal")).toHaveLength(2);
		expect(text()).toContain("Suggested changes for Unknown chapter");
		expect(text()).not.toContain("Accept all");
		expect(text()).toContain("Reject all 1 undecided change");
		expect(text()).not.toContain("Apply");
	});

	it("shows proofreading coverage per chapter and offers the action", () => {
		const a = actions();
		const ctx = { kind: "book", book, activePath: "A/z.md", role: "manuscript", chapterId: null } as const;
		const cov = new Map([["a", { total: 5, reviewed: 3, waiting: 1, pending: 1 }], ["b", { total: 2, reviewed: 2, waiting: 0, pending: 0 }], ["c", { total: 0, reviewed: 0, waiting: 0, pending: 0 }]]);
		renderOverview(root, ctx, buildOverview(book, [ch("a", "Chapter 1", 1, "A/a.md"), ch("b", "Chapter 2", 2, "A/b.md"), ch("c", "Chapter 3", 3, "A/c.md")], null, () => true, new Map(), [], [], [], new Map(), [], cov), a);
		const notes = Array.from(root.querySelectorAll(".bh-chapter .bh-note")).map((n) => n.textContent).filter((t) => t?.startsWith("Proofreading"));
		expect(notes).toEqual(["Proofreading: 3 of 5 paragraphs reviewed, 1 waiting for your decision, 1 not checked yet.", "Proofreading: 2 of 2 paragraphs reviewed."]);
		click("Proofread chapters");
		expect(a.proofread).toHaveBeenCalled();
	});

	it("lists entities by kind with their aliases and per-entity actions", () => {
		const a = actions();
		const ent = (id: string, type: string, name: string, aliases: string[] = []) => ({ id, bookId: "bk1", type, name, aliases, mergedInto: null, origin: "author" as const, distinctFrom: [] as string[], archived: false, path: `A/_book-harness/entities/${type}/${id}.md`, body: "" });
		const ctx = { kind: "book", book, activePath: "A/z.md", role: "manuscript", chapterId: null } as const;
		const entities = [ent("en_2", "place", "Harbour"), ent("en_1", "character", "Philip", ["Phil", "Marlowe"]), ent("en_3", "character", "Anna")];
		renderOverview(root, ctx, buildOverview(book, [], null, () => true, new Map(), [], [], [], new Map(), [], new Map(), entities), a);
		expect(text()).toContain("Entities (3)");
		expect(Array.from(root.querySelectorAll(".bh-entities > .bh-note")).map((n) => n.textContent)).toEqual(["character", "place"]);
		expect(Array.from(root.querySelectorAll(".bh-entity .bh-link")).map((n) => n.textContent)).toEqual(["Anna", "Philip", "Harbour"]);
		expect(text()).toContain("Also: Phil, Marlowe");
		const philip = Array.from(root.querySelectorAll(".bh-entity")).find((e) => e.textContent?.includes("Philip")) as HTMLElement;
		(philip.querySelector(".bh-link") as HTMLButtonElement).click();
		expect(a.openNote).toHaveBeenCalledWith("A/_book-harness/entities/character/en_1.md");
		const press = (label: string) => (philip.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement).click();
		press("Rename Philip");
		expect(a.renameEntity).toHaveBeenCalledWith("en_1", "Philip");
		press("Add another name for Philip");
		expect(a.addAlias).toHaveBeenCalledWith("en_1");
		press("Merge Philip into another character");
		expect(a.mergeEntity).toHaveBeenCalledWith("en_1");
		press("Remove one of the other names of Philip");
		expect(a.removeAlias).toHaveBeenCalledWith("en_1");
		press("Move one of the other names of Philip to a new entity");
		expect(a.splitEntity).toHaveBeenCalledWith("en_1");
		expect(root.querySelectorAll('button[aria-label^="Remove one of the other names"]')).toHaveLength(1);
		press("Remove Philip from the list");
		expect(a.archiveEntity).toHaveBeenCalledWith("en_1");
		click("Add an entity");
		expect(a.addEntity).toHaveBeenCalled();
	});

	it("offers duplicate hints with merge or different, flags unsupported entities, and starts extraction on request", () => {
		const a = actions();
		const ent = (id: string, name: string) => ({ id, bookId: "bk1", type: "character", name, aliases: [], mergedInto: null, origin: "extracted" as const, distinctFrom: [], archived: false, path: `p/${id}`, body: "" });
		const ctx = { kind: "book", book, activePath: "A/z.md", role: "manuscript", chapterId: null } as const;
		const entities = [ent("en_1", "Philip Marlowe"), ent("en_2", "Marlowe")];
		renderOverview(root, ctx, buildOverview(book, [], null, () => true, new Map(), [], [], [], new Map(), [], new Map(), entities, [ent("en_9", "Ghost")]), a);
		expect(text()).toContain("Could these be the same? (1)");
		expect(text()).toContain('Philip Marlowe and Marlowe (character, both contain "marlowe")');
		(root.querySelector('button[aria-label="Merge Marlowe into Philip Marlowe"]') as HTMLButtonElement).click();
		expect(a.mergeDuplicate).toHaveBeenCalledWith("en_2", "en_1");
		(root.querySelector('button[aria-label="Philip Marlowe and Marlowe are different"]') as HTMLButtonElement).click();
		expect(a.keepDistinct).toHaveBeenCalledWith("en_1", "en_2");
		expect(text()).toContain("No chapter supports these any more");
		expect(text()).toContain("Ghost (character): the text it was found in has changed.");
		click("Find characters, places and objects");
		expect(a.extractEntities).toHaveBeenCalled();
	});

	it("shows the tapped entity with its aliases and notes, and can open or close it", () => {
		const a = actions();
		const sel = { id: "en_1", bookId: "bk1", type: "character", name: "Philip", aliases: ["Phil"], mergedInto: null, origin: "author" as const, distinctFrom: [], archived: false, path: "A/_book-harness/entities/character/en_1.md", body: "# Philip\n\n## History (AI-managed)\n\n- Chapter 1: Walks.\n" };
		const ctx = { kind: "book", book, activePath: "A/z.md", role: "manuscript", chapterId: null } as const;
		renderOverview(root, ctx, buildOverview(book, [], null, () => true, new Map(), [], [], [], new Map(), [], new Map(), [], [], sel), a);
		const box = root.querySelector(".bh-selected") as HTMLElement;
		expect(box.textContent).toContain("Philip (character)");
		expect(box.textContent).toContain("Also: Phil");
		expect(box.querySelector(".bh-body")?.textContent).toBe("## History (AI-managed)\n\n- Chapter 1: Walks.");
		(Array.from(box.querySelectorAll("button")).find((b) => b.textContent === "Open note") as HTMLButtonElement).click();
		expect(a.openNote).toHaveBeenCalledWith(sel.path);
		(Array.from(box.querySelectorAll("button")).find((b) => b.textContent === "Close") as HTMLButtonElement).click();
		expect(a.closeEntity).toHaveBeenCalled();
		renderOverview(root, ctx, buildOverview(book, [], null, () => true, new Map(), [], [], [], new Map(), [], new Map(), [], [], { ...sel, aliases: [] }), a);
		expect(text()).not.toContain("Also:");
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

	it("lets the author add their own to-dos and mark them done", () => {
		const a = actions();
		const ctx = { kind: "book", book, activePath: "A/z.md", role: "manuscript", chapterId: null } as const;
		const manual = [{ id: "manual:abc", text: "Check the map", done: false }];
		renderOverview(root, ctx, buildOverview(book, [], null, () => true, new Map(), [], [], manual), a);
		expect(text()).toContain("Check the map");
		click("Add a to-do");
		expect(a.addTodo).toHaveBeenCalled();
		(root.querySelector('button[aria-label="Mark done: Check the map"]') as HTMLButtonElement).click();
		expect(a.completeTodo).toHaveBeenCalledWith("manual:abc");
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
