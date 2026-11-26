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
	const book = { openNote: vi.fn(), setStatus: vi.fn(), move: vi.fn(), rename: vi.fn(), unbind: vi.fn(), promoteActive: vi.fn(), planChapter: vi.fn(), updateStats: vi.fn(), cancelJob: vi.fn(), dismissJob: vi.fn(), addTodo: vi.fn(), completeTodo: vi.fn(), summarize: vi.fn(), proofread: vi.fn(), decideEdits: vi.fn(), applyProposal: vi.fn(), addEntity: vi.fn(), renameEntity: vi.fn(), addAlias: vi.fn(), mergeEntity: vi.fn(), removeAlias: vi.fn(), splitEntity: vi.fn(), archiveEntity: vi.fn(), closeEntity: vi.fn(), search: vi.fn(), openPassage: vi.fn(), showContext: vi.fn(), buildMeaning: vi.fn(), extractEntities: vi.fn(), mergeDuplicate: vi.fn(), keepDistinct: vi.fn(), addEvent: vi.fn(), exportEpub: vi.fn(), toggleStatistics: vi.fn(), checkConsistency: vi.fn(), decideFinding: vi.fn(), openPlace: vi.fn(), findEvents: vi.fn(), acceptCandidate: vi.fn(), rejectCandidate: vi.fn(), translate: vi.fn(), resolveConflict: vi.fn(), ask: vi.fn(), removeAnswer: vi.fn(), openCitation: vi.fn(), openOccurrence: vi.fn(), addTimeRelation: vi.fn(), removeStatement: vi.fn(), removeEvent: vi.fn() };
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

	it("searches on Enter or the button only, and shows what was searched, the results and any chapters without notes", () => {
		const a = actions();
		const ctx = { kind: "book", book, activePath: "A/z.md", role: "manuscript", chapterId: null } as const;
		const result = { channels: { keyword: 1, meaning: null }, ref: { bookId: "bk1", chapterId: "a", passageId: "p", sourceRevision: "r", start: 0, end: 5 }, chapter: "Chapter 1", notePath: "A/a.md", snippet: "…the Zorblax lamp…", score: 1, entities: ["Anna"], provenance: "manuscript" as const };
		const search = { query: "zorblax", filter: {}, results: [result], passagesIndexed: 12, chaptersIndexed: 1, missingChapters: ["Chapter 2"], meaning: { requested: false, used: false, status: null, note: null } };
		renderOverview(root, ctx, buildOverview(book, [], null, () => true, new Map(), [], [], [], new Map(), [], new Map(), [], [], null, search), a);
		const input = root.querySelector("input") as HTMLInputElement;
		expect(input.value).toBe("zorblax");
		expect(text()).toContain("Keyword search over 12 passages in 1 chapter, up to date with your notes. Not searched, no note yet: Chapter 2.");
		expect(text()).toContain("…the Zorblax lamp…");
		expect(text()).toContain("Mentions: Anna");
		input.dispatchEvent(new Event("input"));
		expect(a.search).not.toHaveBeenCalled();
		input.value = "lamp";
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
		expect(a.search).not.toHaveBeenCalled();
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		expect(a.search).toHaveBeenLastCalledWith("lamp", false, {});
		click("Search");
		expect(a.search).toHaveBeenCalledTimes(2);
		(Array.from(root.querySelectorAll(".bh-result .bh-link"))[0] as HTMLButtonElement).click();
		expect(a.openPassage).toHaveBeenCalledWith(result);
	});

	it("offers meaning search only when it can work, shows how fresh the index is, and labels how each hit was found", () => {
		const a = actions();
		const ctx = { kind: "book", book, activePath: "A/z.md", role: "manuscript", chapterId: null } as const;
		const hit = (keyword: number | null, meaning: number | null) => ({ channels: { keyword, meaning }, ref: { bookId: "bk1", chapterId: "a", passageId: `p${keyword}${meaning}`, sourceRevision: "r", start: 0, end: 1 }, chapter: "Chapter 1", notePath: "A/a.md", snippet: "text", score: 1, entities: [], provenance: "manuscript" as const });
		const search = { query: "q", filter: {}, results: [hit(1, 2), hit(null, 1), hit(3, null)], passagesIndexed: 3, chaptersIndexed: 1, missingChapters: [], meaning: { requested: true, used: true, status: { state: "partial" as const, indexed: 2, total: 3, builtWith: "e" }, note: "The meaning index covers 2 of 3 passages; the rest were searched by keyword only." } };
		const status = { state: "partial" as const, indexed: 2, total: 3, builtWith: "e" };
		renderOverview(root, ctx, buildOverview(book, [], null, () => true, new Map(), [], [], [], new Map(), [], new Map(), [], [], null, search, { available: true, enabled: true, status }), a);
		expect(text()).toContain("Meaning index: out of date (2 of 3 passages).");
		expect(text()).toContain("Meaning results are included. The meaning index covers 2 of 3 passages");
		expect(Array.from(root.querySelectorAll(".bh-result .bh-badge")).map((b) => b.textContent)).toEqual(["keyword and meaning", "meaning", "keyword"]);
		const checkbox = root.querySelector('input[type="checkbox"]') as HTMLInputElement;
		expect(checkbox.checked).toBe(true);
		checkbox.checked = false;
		click("Search");
		expect(a.search).toHaveBeenLastCalledWith("q", false, {});
		click("Build or update");
		expect(a.buildMeaning).toHaveBeenCalled();
		for (const [state, label, button] of [["current", "up to date", "Rebuild"], ["missing", "not built yet", "Build or update"], ["incompatible", "built with another model", "Build or update"]] as const) {
			renderOverview(root, ctx, buildOverview(book, [], null, () => true, new Map(), [], [], [], new Map(), [], new Map(), [], [], null, null, { available: true, enabled: false, status: { state, indexed: 0, total: 1, builtWith: null } }), a);
			expect(text()).toContain(`Meaning index: ${label}`);
			click(button);
		}
		renderOverview(root, ctx, buildOverview(book, [], null, () => true, new Map(), [], [], [], new Map(), [], new Map(), [], [], null, { ...search, meaning: { requested: true, used: false, status: null, note: "Meaning search was not used: offline." } }, { available: false, enabled: false, status: null }), a);
		expect(text()).toContain("Meaning search was not used: offline.");
		expect(root.querySelector('input[type="checkbox"]')).toBeNull();
		renderOverview(root, ctx, buildOverview(book, [], null, () => true, new Map(), [], [], [], new Map(), [], new Map(), [], [], null, { ...search, meaning: { requested: true, used: false, status: null, note: null } }, { available: true, enabled: false, status: null }), a);
		expect(root.querySelector(".bh-search")?.textContent).not.toContain("Meaning index:");
	});

	it("expands a search hit into its context on request, labelling what is inferred and what was cut", () => {
		const a = actions();
		const ctx = { kind: "book", book, activePath: "A/z.md", role: "manuscript", chapterId: null } as const;
		const hit = { channels: { keyword: 1, meaning: null }, ref: { bookId: "bk1", chapterId: "a", passageId: "p1", sourceRevision: "r", start: 0, end: 1 }, chapter: "Chapter 1", notePath: "A/a.md", snippet: "text", score: 1, entities: [], provenance: "manuscript" as const };
		const search = { query: "q", filter: {}, results: [hit], passagesIndexed: 1, chaptersIndexed: 1, missingChapters: [], meaning: { requested: false, used: false, status: null, note: null } };
		renderOverview(root, ctx, buildOverview(book, [], null, () => true, new Map(), [], [], [], new Map(), [], new Map(), [], [], null, search), a);
		click("Show context");
		expect(a.showContext).toHaveBeenCalledWith(hit);
		const none = { entities: [], truncated: false };
		renderOverview(root, ctx, buildOverview(book, [], null, () => true, new Map(), [], [], [], new Map(), [], new Map(), [], [], null, search, undefined, new Map([["a:p1", none]])), a);
		expect(text()).toContain("No known entity is named in this passage.");
		expect(text()).not.toContain("Show context");
		const full = { truncated: true, entities: [{ entityId: "e", name: "Anna", type: "character", history: [{ chapter: "Chapter 1", note: "Speaks.", quote: "said Anna" }, { chapter: "Chapter 2", note: "", quote: "Anna again" }], alsoNamed: [{ name: "Philip", basis: "b" }], provenance: ["observed" as const, "inferred" as const] }, { entityId: "f", name: "Lamp", type: "object", history: [], alsoNamed: [], provenance: ["observed" as const] }] };
		renderOverview(root, ctx, buildOverview(book, [], null, () => true, new Map(), [], [], [], new Map(), [], new Map(), [], [], null, search, undefined, new Map([["a:p1", full]])), a);
		expect(text()).toContain("Anna (character)");
		expect(text()).toContain("Chapter 1: Speaks. “said Anna”");
		expect(text()).toContain("Chapter 2: Appears. “Anna again”");
		expect(text()).toContain("Also named here (inferred from proximity only): Philip.");
		expect(text()).toContain("This is a selection: more is known than is shown.");
	});

	it("says that finding nothing does not mean the idea is absent, and counts chapters in the singular and plural", () => {
		const ctx = { kind: "book", book, activePath: "A/z.md", role: "manuscript", chapterId: null } as const;
		const none = { query: "ghost", filter: {}, results: [], passagesIndexed: 3, chaptersIndexed: 2, missingChapters: [], meaning: { requested: false, used: false, status: null, note: null } };
		renderOverview(root, ctx, buildOverview(book, [], null, () => true, new Map(), [], [], [], new Map(), [], new Map(), [], [], null, none), actions());
		expect(text()).toContain("in 2 chapters, up to date");
		expect(text()).toContain("Nothing found for “ghost”. Words are matched exactly as written; this does not mean the idea is absent from the book.");
		expect(text()).not.toContain("Not searched");
		renderOverview(root, ctx, buildOverview(book, [], null, () => true), actions());
		expect((root.querySelector("input") as HTMLInputElement).value).toBe("");
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

describe("timeline rendering", () => {
	it("says whether a time is exact or only possible, and singular/plural wording", () => {
		const a = actions();
		const ctx = { kind: "book", book, activePath: "A/x.md", role: "manuscript", chapterId: null } as const;
		const row = (id: string, definite: boolean) => ({ id, label: id, chapter: null, when: "1923-10-31", definite, because: [], after: [] });
		const view = { narrative: [row("only", true)], world: [row("only", true)], unordered: [["a", "b"]] as Array<[string, string]>, conflict: null, statements: [] };
		renderOverview(root, ctx, { ...buildOverview(book, [], null, () => true), timeline: view }, a);
		expect(text()).toContain("Timeline (1 event)");
		expect(text()).toContain("1923-10-31");
		expect(text()).not.toContain("possibly");
		expect(text()).toContain("1 pair of events have no known order");
		renderOverview(root, ctx, { ...buildOverview(book, [], null, () => true), timeline: { ...view, narrative: [row("a", false), row("b", false)], unordered: [["a", "b"], ["a", "c"]] } }, a);
		expect(text()).toContain("Timeline (2 events)");
		expect(text()).toContain("possibly 1923-10-31");
		expect(text()).toContain("2 pairs of events");
	});
});

describe("statistics rendering", () => {
	const ctx = { kind: "book", book, activePath: "A/x.md", role: "manuscript", chapterId: null } as const;
	const occ = (start: number) => ({ chapterId: "c1", designation: "Chapter 1", start, end: start + 4 });
	const row = (word: string, count: number, chapters = 1) => ({ word, count, per1000: 12.5, chapters, occurrences: Array.from({ length: Math.min(count, 7) }, (_, i) => occ(i * 10)) });
	const base = { language: "en", stopwords: true, totalWords: 1000, uniqueWords: 400, chapters: [{ id: "c1", designation: "Chapter 1", words: 1000, unique: 400, sentences: 80, averageSentence: 12.5, longestSentence: 40, paragraphs: 30 }], frequent: [row("lamp", 9, 2)], clusters: [{ word: "lamp", count: 5, span: 120, first: occ(0), occurrences: [occ(0), occ(10)] }], phrases: [{ phrase: "the lamp burned", count: 3, occurrences: [occ(0)] }], adjectives: { support: { mode: "heuristic" as const, note: "A guess." }, rows: [row("dark", 4)] } };

	it("shows the counts, the labelled adjective guess and buttons that jump to a place", () => {
		const a = actions();
		renderOverview(root, ctx, { ...buildOverview(book, [], null, () => true), statistics: base }, a);
		expect(text()).toContain("Statistics (1,000 words, 400 different)");
		expect(text()).toContain("lamp: 9 (12.5 per 1,000 words, in 2 chapters)");
		expect(text()).toContain("dark: 4 (12.5 per 1,000 words, in 1 chapter)");
		expect(text()).toContain("Adjectives (a guess)");
		expect(text()).toContain("“the lamp burned”: 3 times");
		expect(root.querySelectorAll('button[aria-label^="Show “lamp”, "]').length).toBe(5 + 2 /* frequent (capped at 5) + cluster */);
		(root.querySelector('button[aria-label="Show “lamp”, 2 of 9, in Chapter 1"]') as HTMLButtonElement).click();
		expect(a.openOccurrence).toHaveBeenCalledWith(occ(10), "lamp");
		click("Hide statistics");
		expect(a.toggleStatistics).toHaveBeenCalled();
	});
	it("says plainly when nothing was found, when a language has no common-word list and no adjective guess", () => {
		const a = actions();
		const empty = { ...base, stopwords: false, language: "cs", frequent: [], clusters: [], phrases: [], adjectives: { support: { mode: "unavailable" as const, note: "Nothing is guessed." }, rows: [] } };
		renderOverview(root, ctx, { ...buildOverview(book, [], null, () => true), statistics: empty }, a);
		expect(text()).toContain("No words to show yet.");
		expect(text()).toContain("There is no list of common words for “cs”");
		expect(text().match(/None found\./g)).toHaveLength(2);
		expect(text()).toContain("Nothing is guessed.");
		expect(text()).not.toContain("(a guess)");
	});
});

describe("ask the book rendering", () => {
	const ctx = { kind: "book", book, activePath: "A/x.md", role: "manuscript", chapterId: null } as const;
	const result = { ref: { bookId: "b", chapterId: "c", passageId: "p", sourceRevision: "r", start: 0, end: 5 }, chapter: "Chapter 1", notePath: "A/1.md", snippet: "s", score: 1, entities: [], provenance: "manuscript" as const, channels: { keyword: 1, meaning: null } };
	const answer = (over: object) => ({ question: "Who?", answer: "Nora.", status: "answered" as const, citations: [{ label: "P1", quote: "Nora kept the light", chapter: "Chapter 1", result }], dropped: 0, issues: [], excerpts: 1, chapters: ["Chapter 1"], usedChronology: false, ...over });

	it("labels how well each question was answered, shows quotes that open the place, and says what was left out", () => {
		const a = actions();
		const ask = { pending: "Next?", history: [answer({}), answer({ question: "Q2", status: "partly", dropped: 1, excerpts: 3, chapters: ["Chapter 1", "Chapter 2"], usedChronology: true, issues: ["A problem."] }), answer({ question: "Q3", status: "not_in_excerpts", dropped: 2, citations: [], excerpts: 0, chapters: [] })].map((result, i) => ({ id: `cv_${i}`, result })) };
		renderOverview(root, ctx, { ...buildOverview(book, [], null, () => true), ask }, a);
		expect(text()).toContain("Answered from the excerpts");
		expect(text()).toContain("Only partly answered");
		expect(text()).toContain("Not answered: the excerpts do not say");
		expect(text()).toContain("Based on 1 passage from Chapter 1.");
		expect(text()).toContain("Based on 3 passages from Chapter 1, Chapter 2. The timeline you built was included. 1 quote was left out because it does not appear in the text.");
		expect(text()).toContain("Based on 0 passages. 2 quotes were left out because they do not appear in the text.");
		expect(text()).toContain("A problem.");
		expect(text()).toContain("Asking: Next?");
		(root.querySelector(".bh-answer .bh-link") as HTMLButtonElement).click();
		expect(a.openCitation).toHaveBeenCalled();
		(root.querySelector('button[aria-label="Remove this answer: Q2"]') as HTMLButtonElement).click();
		expect(a.removeAnswer).toHaveBeenCalledWith("cv_1");
		const input = root.querySelector(".bh-ask input") as HTMLInputElement;
		input.value = "Why?";
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "x" }));
		expect(a.ask).not.toHaveBeenCalled();
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		expect(a.ask).toHaveBeenCalledWith("Why?");
	});
});

describe("translations rendering", () => {
	const ctx = { kind: "book", book, activePath: "A/x.md", role: "manuscript", chapterId: null } as const;
	const chapter = (n: number) => ch(`c${n}`, `Chapter ${n}`, n, `A/${n}.md`);
	const counts = { keep: 3, retranslate: 2, translate: 1, copy: 0, conflict: 1, dropped: 1 };
	const conflict = (kind: "edited-and-changed" | "restructured") => ({ id: `cf_${kind}`, kind, segmentId: "sg", sourceNow: ["Now."], sourceBefore: ["Before."], target: kind === "restructured" ? null : "Mine.", reason: `Reason ${kind}` });
	const row = (n: number, status: object, toTranslate = 0, conflicts: ReturnType<typeof conflict>[] = []) => ({ chapter: chapter(n), status: { language: "de", conflicts: conflicts.length, plan: null, ...status }, conflicts, toTranslate });

	it("says what state each translation is in and offers the decisions", () => {
		const a = actions();
		const rows = [row(1, { state: "no-source" }), row(2, { state: "missing" }, 1), row(3, { state: "current" }), row(4, { state: "conflicts" }, 0, [conflict("edited-and-changed"), conflict("restructured")]), row(5, { state: "broken", problem: "Record missing." }), row(6, { state: "stale", plan: { counts } }, 3), row(7, { state: "stale", plan: { counts: { keep: 3, retranslate: 0, translate: 0, copy: 0, conflict: 0, dropped: 0 } } })];
		const translations = [{ language: "de", name: "German", rows, toTranslate: 5 }, { language: "cs", name: "Czech", rows: [], toTranslate: 0 }];
		renderOverview(root, ctx, { ...buildOverview(book, [], null, () => true), translations: translations as never }, a);
		const t = text();
		expect(t).toContain("Chapter 1: no chapter note to translate");
		expect(t).toContain("Chapter 2: not translated yet (1 paragraph)");
		expect(t).toContain("Chapter 3: up to date");
		expect(t).toContain("Chapter 4: waiting for your decision (2)");
		expect(t).toContain("Chapter 5: cannot be read: Record missing.");
		expect(t).toContain("Chapter 6: out of date: the chapter changed since it was translated (2 changed, 1 new, 1 removed, 1 need your decision)");
		expect(t).toContain("Chapter 7: out of date: the chapter changed since it was translated");
		expect(t).toContain("Reason restructured");
		expect(t).toContain("The source now: Now.");
		expect(t).toContain("Your translation: Mine.");
		click("Translate or update German (5 paragraphs)");
		expect(a.translate).toHaveBeenCalledWith("de");
		click("Check Czech");
		expect(a.translate).toHaveBeenCalledWith("cs");
		click("Export German as EPUB");
		expect(a.exportEpub).toHaveBeenCalledWith("de");
		(root.querySelector('button[aria-label^="Keep my translation"]') as HTMLButtonElement).click();
		expect(a.resolveConflict).toHaveBeenCalledWith("c4", "de", "cf_edited-and-changed", "mine");
		const machine = Array.from(root.querySelectorAll('button[aria-label^="Translate this paragraph again"]'));
		expect(machine).toHaveLength(2);
		expect(machine.map((m) => m.textContent)).toEqual(["Use a new translation", "Translate it"]);
		(machine[0] as HTMLButtonElement).click();
		expect(a.resolveConflict).toHaveBeenCalledWith("c4", "de", "cf_edited-and-changed", "machine");
		const single = [{ language: "de", name: "German", rows: [row(8, { state: "missing" }, 1)], toTranslate: 1 }];
		renderOverview(root, ctx, { ...buildOverview(book, [], null, () => true), translations: single as never }, a);
		expect(text()).toContain("Translate or update German (1 paragraph)");
	});
});

describe("event suggestions rendering", () => {
	const ctx = { kind: "book", book, activePath: "A/x.md", role: "manuscript", chapterId: null } as const;
	const rel = (kind: "before" | "after_by" | "same_time" | "date", id: string) => ({ id, kind, a: "Lamp goes out", b: kind === "date" ? "" : "Door opens", duration: "3 days", date: "1913-04", quote: `quote ${id}` });

	it("describes every kind of suggestion with its quote and lets the author decide", () => {
		const a = actions();
		const entry = { chapterId: "c1", designation: "Chapter 1", current: true, events: [{ id: "e1", label: "Lamp goes out", quote: "quote e1" }], relations: [rel("before", "r1"), rel("after_by", "r2"), rel("same_time", "r3"), rel("date", "r4")] };
		renderOverview(root, ctx, { ...buildOverview(book, [], null, () => true), eventCandidates: [entry] }, a);
		const t = text();
		expect(t).toContain("Event: Lamp goes out (the text says: “quote e1”)");
		expect(t).toContain("Lamp goes out happens before Door opens");
		expect(t).toContain("Door opens happens 3 days after Lamp goes out");
		expect(t).toContain("Lamp goes out and Door opens happen at the same time");
		expect(t).toContain("Lamp goes out happens in 1913-04");
		(root.querySelector('button[aria-label="Accept: Event: Lamp goes out"]') as HTMLButtonElement).click();
		expect(a.acceptCandidate).toHaveBeenCalledWith("c1", "e1");
		(root.querySelector('button[aria-label="Reject: Lamp goes out happens in 1913-04"]') as HTMLButtonElement).click();
		expect(a.rejectCandidate).toHaveBeenCalledWith("c1", "r4");
		click("Find events in chapters");
		expect(a.findEvents).toHaveBeenCalled();
	});
	it("does not offer to accept suggestions from a chapter that changed", () => {
		const a = actions();
		const entry = { chapterId: "c1", designation: "Chapter 1", current: false, events: [{ id: "e1", label: "Lamp goes out", quote: "q" }], relations: [] };
		renderOverview(root, ctx, { ...buildOverview(book, [], null, () => true), eventCandidates: [entry] }, a);
		expect(text()).toContain("find events again");
		expect(root.querySelector('button[aria-label^="Accept"]')).toBeNull();
		expect(root.querySelector('button[aria-label^="Reject"]')).not.toBeNull();
	});
	it("shows where a statement came from in the text", () => {
		const a = actions();
		const row = { id: "x", label: "X", chapter: null, when: null, definite: false, because: [], after: [] };
		renderOverview(root, ctx, { ...buildOverview(book, [], null, () => true), timeline: { narrative: [row], world: [row], unordered: [], conflict: null, statements: [{ id: "s", text: "X happens in 1913", quote: "In the spring of 1913" }, { id: "t", text: "Y before X", quote: null }] } }, a);
		expect(text()).toContain("X happens in 1913 (the text says: “In the spring of 1913”)");
		expect(text()).toContain("Y before X");
		expect(text()).not.toContain("Y before X (the text says");
	});
});

describe("possible contradictions rendering", () => {
	const ctx = { kind: "book", book, activePath: "A/x.md", role: "manuscript", chapterId: null } as const;
	const place = (n: number) => ({ chapterId: `c${n}`, chapter: `Chapter ${n}`, notePath: `A/${n}.md`, passageId: "p", start: 0, end: 5, quote: `quote ${n}`, revision: "r" });
	const finding = (decision: "open" | "mistake" | "intended" | "not-a-conflict") => ({ id: `fd_${decision}`, entityId: "en_1", topic: "Eye colour", first: place(1), second: place(3), explanation: "Grey, then green.", decision, decidedAt: decision === "open" ? null : {} });

	it("shows both places and lets the author decide, offering a second look when the chapters changed", () => {
		const a = actions();
		const list = [{ entityName: "Nora", finding: finding("open"), secondLook: false }, { entityName: "Nora", finding: finding("intended"), secondLook: true }, { entityName: "Nora", finding: finding("mistake"), secondLook: false }];
		renderOverview(root, ctx, { ...buildOverview(book, [], null, () => true), findings: list }, a);
		const t = text();
		expect(t).toContain("Possible contradictions (3)");
		expect(t).toContain("Nora: Eye colour");
		expect(t).toContain("Grey, then green.");
		expect(t).toContain("“quote 1”");
		expect(t).toContain("A chapter this rests on changed since you decided. Look again.");
		expect(root.querySelectorAll('button[aria-label="Intended: Eye colour"]').length).toBe(3);
		expect(root.querySelectorAll('button[aria-label="A mistake to fix: Eye colour"]').length).toBe(2); // not offered where it is already the decision, except for a second look
		(root.querySelector('button[aria-label="A mistake to fix: Eye colour"]') as HTMLButtonElement).click();
		expect(a.decideFinding).toHaveBeenCalledWith("en_1", "fd_open", "mistake");
		click("Chapter 3");
		expect(a.openPlace).toHaveBeenCalledWith(place(3));
	});
	it("offers a consistency check for every entity", () => {
		const a = actions();
		const entity = { id: "en_1", bookId: "bk1", type: "character", name: "Nora", aliases: [], mergedInto: null, origin: "author", distinctFrom: [], archived: false, path: "A/n.md", body: "# Nora" } as never;
		renderOverview(root, ctx, buildOverview(book, [], null, () => true, new Map(), [], [], [], new Map(), [], new Map(), [entity]), a);
		(root.querySelector('button[aria-label="Look for places where the book contradicts itself about Nora"]') as HTMLButtonElement).click();
		expect(a.checkConsistency).toHaveBeenCalledWith("en_1");
	});
});

describe("search filters rendering", () => {
	it("offers the chapters and entities of the book and passes the choice with the query", () => {
		const a = actions();
		const ctx = { kind: "book", book, activePath: "A/x.md", role: "manuscript", chapterId: null } as const;
		const entity = { id: "en_1", bookId: "bk1", type: "character", name: "Nora", aliases: [], mergedInto: null, origin: "author", distinctFrom: [], archived: false, path: "A/n.md", body: "# Nora" } as never;
		const search = { query: "lamp", filter: { chapterId: "c2", entityId: "en_1" }, results: [], passagesIndexed: 1, chaptersIndexed: 1, missingChapters: [], meaning: { requested: false, used: false, status: null, note: null } };
		renderOverview(root, ctx, buildOverview(book, [ch("c1", "Chapter 1", 1, "A/1.md"), ch("c2", "Chapter 2", 2, "A/2.md")], null, () => true, new Map(), [], [], [], new Map(), [], new Map(), [entity], [], null, search), a);
		const chapter = root.querySelector('select[aria-label="Search only in one chapter"]') as HTMLSelectElement;
		const named = root.querySelector('select[aria-label="Only passages that name one entity"]') as HTMLSelectElement;
		expect(Array.from(chapter.options).map((o) => o.textContent)).toEqual(["Whole book", "Chapter 1", "Chapter 2"]);
		expect(Array.from(named.options).map((o) => o.textContent)).toEqual(["Any passage", "Names Nora"]);
		expect([chapter.value, named.value]).toEqual(["c2", "en_1"]); // what the last search was narrowed to
		(root.querySelector(".bh-search input") as HTMLInputElement).value = "lamp";
		click("Search");
		expect(a.search).toHaveBeenLastCalledWith("lamp", false, { chapterId: "c2", entityId: "en_1" });
		chapter.value = "";
		named.value = "";
		click("Search");
		expect(a.search).toHaveBeenLastCalledWith("lamp", false, {});
	});
});
