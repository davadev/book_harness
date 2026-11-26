// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerBook } from "../core/books";
import { addChapter } from "../core/chapters";
import { GuardedVault } from "../core/guarded-vault";
import { BookSearch } from "../core/search";
import { DiagnosticsLog } from "../core/ai/diagnostics";
import { DEFAULT_SETTINGS } from "../settings/defaults";
import { JobRunner } from "../core/jobs";
import { onVaultRename } from "../platform/follow-renames";
import { PromptModal } from "../platform/prompt-modal";
import { BookHarnessView, PANEL_VIEW_TYPE } from "../platform/panel-view";
import { ObsidianVaultPort } from "../platform/vault-port";
import { counterRandom } from "./__mocks__/fakeVault";
import { makeFakeApp } from "./__mocks__/fakeApp";
import { MarkdownView, Notice } from "./__mocks__/obsidian";
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
	document.body.replaceChildren();
});
afterEach(() => vi.useRealTimers());

async function setup() {
	const fake = makeFakeApp({ "Book/one.md": "One", "Book/two.md": "Two", "Book/loose.md": "Loose", "Other/x.md": "x" });
	const vault = new GuardedVault(new ObsidianVaultPort(fake.app));
	const rnd = counterRandom();
	const book = await registerBook(vault, "Book", "Book", "en", rnd);
	const one = await addChapter(vault, book, [], { designation: "Chapter 1", notePath: "Book/one.md" }, rnd);
	const two = await addChapter(vault, book, [one], { designation: "Chapter 2", notePath: "Book/two.md" }, rnd);
	const runner = new JobRunner();
	const indexFiles = new Map<string, ArrayBuffer>();
	const host = { indexStore: { read: (k: string) => Promise.resolve(indexFiles.get(k) ?? null), write: (k: string, d: ArrayBuffer) => (indexFiles.set(k, d), Promise.resolve()) }, search: new BookSearch(), selectedEntity: null as string | null, clearSelectedEntity() { host.selectedEntity = null; }, settings: structuredClone(DEFAULT_SETTINGS), network: { request: vi.fn((_req?: { body?: string }): Promise<{ status: number; text: string }> => Promise.reject(new Error("no server"))) }, diagnostics: new DiagnosticsLog() };
	const view = new BookHarnessView({ app: fake.app } as never, runner, host);
	(view as unknown as { app: unknown }).app = fake.app;
	return { fake, vault, book, one, two, view, store: fake.store, runner, host };
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
		await vi.waitFor(() => expect([...store.values()].some((t) => t.includes("note_path: loose.md"))).toBe(true));
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

	it("counts words on request and shows when text has changed since", async () => {
		const { fake, view, store } = await setup();
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Not counted yet"));
		button(view, "Update word counts").click();
		await vi.waitFor(() => expect(text(view)).toContain("1 words"));
		expect(Notice.instances.at(-1)?.message).toBe("Counted 2 of 2 chapters.");
		store.set("Book/one.md", "One two three");
		view.markDirty();
		await vi.waitFor(() => expect(text(view)).toContain("out of date"));
		store.set("Book/two.md", "Changed");
		button(view, "Update word counts").click();
		await vi.waitFor(() => expect(Notice.instances.filter((n) => n.message === "Counted 2 of 2 chapters.")).toHaveLength(2));
	});

	it("tells the author when a count could not be stored or failed", async () => {
		const { fake, view } = await setup();
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Not counted yet"));
		const read = fake.appAny.vault.read;
		let n = 0;
		fake.appAny.vault.read = (f: { path: string }) => (f.path === "Book/one.md" && ++n === 2 ? Promise.resolve("changed meanwhile") : f.path === "Book/two.md" ? Promise.reject(new Error("io")) : read(f));
		button(view, "Update word counts").click();
		await vi.waitFor(() => expect(Notice.instances.at(-1)?.message).toBe("Counted 0 of 2 chapters; 1 failed."));
		const jobText = () => [...fake.store].find(([p]) => p.includes("/jobs/"))?.[1] ?? "";
		await vi.waitFor(() => expect(jobText()).toContain("Chapter 1 changed while it was being counted."));
		expect(jobText()).toContain('"message": "io"');
	});

	it("shows progress, lets the author cancel, and then dismiss the finished job", async () => {
		const { fake, view, runner, store } = await setup();
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Not counted yet"));
		let release: () => void = () => undefined;
		const gate = new Promise<void>((r) => (release = r));
		const create = fake.appAny.vault.create;
		let held = false;
		// Hold the first stored result so the job is observably running; only a job ever writes state notes.
		fake.appAny.vault.create = async (p: string, t: string) => {
			if (p.includes("/state/") && !held) {
				held = true;
				await gate;
			}
			return create(p, t);
		};
		button(view, "Update word counts").click();
		await vi.waitFor(() => expect(text(view)).toContain("Word count running: 0 of 2 chapters"));
		button(view, "Update word counts").click();
		expect(Notice.instances.at(-1)?.message).toBe("A word count is already running for this book.");
		button(view, "Cancel").click();
		release();
		await vi.waitFor(() => expect(text(view)).toContain("Word count canceled: 1 of 2 chapters"));
		expect(runner.hasRunningJob("x")).toBe(false);
		button(view, "Dismiss").click();
		await vi.waitFor(() => expect(text(view)).not.toContain("Word count canceled"));
		expect([...store.keys()].some((p) => p.includes("/jobs/"))).toBe(true);
	});

	it("shows a job left running by a previous session as interrupted and lets the author dismiss it", async () => {
		const { fake, view, store, book, one } = await setup();
		const job = `---\nbh_schema: 1\nbh_type: job\nbh_id: jb_aaaaaaaaaaaaaaaa\nbh_book: ${book.id}\n---\n\`\`\`bh-records\n${JSON.stringify({ id: "jb_aaaaaaaaaaaaaaaa", bookId: book.id, kind: "stats.words", state: "running", authorization: { action: "x", by: "user", at: "t" }, startedAt: "t", items: [{ chapterId: one.id, designation: "Chapter 1", state: "pending" }] })}\n\`\`\`\n`;
		store.set(`Book/_book-harness/jobs/jb_aaaaaaaaaaaaaaaa.md`, job);
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Word count interrupted: 0 of 1 chapters"));
		expect(text(view)).toContain("Nothing was restarted");
		expect(store.get("Book/_book-harness/jobs/jb_aaaaaaaaaaaaaaaa.md")).toContain('"state":"running"');
		button(view, "Dismiss").click();
		await vi.waitFor(() => expect(text(view)).not.toContain("interrupted"));
	});

	it("tells the author when the job record to dismiss has disappeared", async () => {
		const { fake, view, store, book, one } = await setup();
		const path = "Book/_book-harness/jobs/jb_aaaaaaaaaaaaaaaa.md";
		store.set(path, `---\nbh_schema: 1\nbh_type: job\nbh_id: jb_aaaaaaaaaaaaaaaa\nbh_book: ${book.id}\n---\n\`\`\`bh-records\n${JSON.stringify({ id: "jb_aaaaaaaaaaaaaaaa", bookId: book.id, kind: "stats.words", state: "completed", authorization: { action: "x", by: "user", at: "t" }, startedAt: "t", items: [{ chapterId: one.id, designation: "Chapter 1", state: "done" }] })}\n\`\`\`\n`);
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Word count finished: 1 of 1 chapters"));
		store.delete(path);
		button(view, "Dismiss").click();
		await vi.waitFor(() => expect(Notice.instances.at(-1)?.message).toBe("That job record no longer exists."));
	});

	it("adds a personal to-do and marks it done", async () => {
		const { fake, view, store } = await setup();
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Add a to-do"));
		button(view, "Add a to-do").click();
		const input = document.body.querySelector("input") as HTMLInputElement;
		input.value = "Check the map";
		input.dispatchEvent(new Event("input"));
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Save")!.click();
		await vi.waitFor(() => expect(text(view)).toContain("Check the map"));
		expect([...store.entries()].find(([p]) => p.endsWith("/todos.md"))?.[1]).toContain("- [ ] Check the map");
		(view.contentEl.querySelector('button[aria-label="Mark done: Check the map"]') as HTMLButtonElement).click();
		await vi.waitFor(() => expect(text(view)).not.toContain("Check the map"));
	});

	it("lists sync conflict copies as to-dos that open the copy", async () => {
		const { fake, view, store } = await setup();
		store.set("Book/one (conflicted copy 2026-11-26).md", "x");
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("A sync conflict copy exists"));
		button(view, "A sync conflict copy exists: Book/one (conflicted copy 2026-11-26).md. Compare it with the original and keep the version you want.").click();
		expect(fake.openFile).toHaveBeenCalled();
	});

	it("explains what is missing before offering to summarize, and never calls the model until confirmed", async () => {
		const { fake, view, host } = await setup();
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Summarize chapters"));
		button(view, "Summarize chapters").click();
		expect(Notice.instances.at(-1)?.message).toMatch(/Set the server address and the generation model/);
		host.settings.device = { endpoint: "http://h:11434", generationModel: "gen", embeddingModel: "" };
		button(view, "Summarize chapters").click();
		const dialog = document.body.textContent as string;
		expect(dialog).toContain("The text of 2 chapters will be sent to http://h:11434 using the model \"gen\"");
		expect(dialog).toContain("Your chapters are not changed.");
		expect(host.network.request).not.toHaveBeenCalled();
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Cancel")!.click();
		expect(host.network.request).not.toHaveBeenCalled();
	});

	it("summarizes after confirmation, shows the summary and flags it out of date when the text changes", async () => {
		const { fake, view, host, store } = await setup();
		host.settings.device = { endpoint: "http://h:11434", generationModel: "gen", embeddingModel: "" };
		host.network.request.mockImplementation(() => Promise.resolve({ status: 200, text: JSON.stringify({ message: { content: JSON.stringify({ summary: "A short summary.", key_points: ["one"] }) } }) }));
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Summarize chapters"));
		button(view, "Summarize chapters").click();
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Summarize")!.click();
		await vi.waitFor(() => expect(Notice.instances.at(-1)?.message).toBe("Summarized 2 of 2 chapters."));
		expect(host.network.request).toHaveBeenCalledTimes(2);
		await vi.waitFor(() => expect(text(view)).toContain("Chapter summaries finished: 2 of 2 chapters"));
		expect(text(view)).toContain("Summary Open");
		expect([...store.keys()].filter((p) => p.includes("/summaries/"))).toHaveLength(2);
		expect(host.diagnostics.recent()).toHaveLength(2);

		store.set("Book/one.md", "Changed text.");
		view.markDirty();
		await vi.waitFor(() => expect(text(view)).toContain("out of date: the text, prompt or model changed"));
		const open = Array.from(view.contentEl.querySelectorAll(".bh-chapter .bh-link")).find((b) => b.textContent === "Open") as HTMLButtonElement;
		open.click();
		expect(fake.openFile).toHaveBeenCalled();
	});

	it("tells the author when no chapter has a note or a job is already running, and surfaces failures", async () => {
		const { fake, view, host, store, runner } = await setup();
		host.settings.device = { endpoint: "http://h:11434", generationModel: "gen", embeddingModel: "" };
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Summarize chapters"));
		vi.spyOn(runner, "hasRunningJob").mockReturnValueOnce(true);
		button(view, "Summarize chapters").click();
		expect(Notice.instances.at(-1)?.message).toBe("A job is already running for this book.");
		for (const [p, t] of store) if (p.includes("/chapters/")) store.set(p, t.replace(/note_path: .*/, "note_path: null"));
		view.markDirty();
		await vi.waitFor(() => expect(text(view)).toContain("No file yet"));
		button(view, "Summarize chapters").click();
		expect(Notice.instances.at(-1)?.message).toBe("No chapter has a manuscript note yet.");
	});

	it("says so when a saved summary still has problems, and uses the singular for one chapter", async () => {
		const { fake, view, host, store } = await setup();
		store.delete("Book/two.md");
		for (const [p, t] of store) if (p.includes("/chapters/") && t.includes("Chapter 2")) store.set(p, t.replace(/note_path: .*/, "note_path: null"));
		host.settings.device = { endpoint: "http://h:11434", generationModel: "gen", embeddingModel: "" };
		host.network.request.mockImplementation(() => Promise.resolve({ status: 200, text: JSON.stringify({ message: { content: JSON.stringify({ summary: "", key_points: [] }) } }) }));
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Summarize chapters"));
		button(view, "Summarize chapters").click();
		expect(document.body.textContent).toContain("The text of 1 chapter will be sent");
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Summarize")!.click();
		await vi.waitFor(() => expect(text(view)).toContain("Chapter 1: Saved, but: The summary is empty."));
	});

	it("does not store a summary when the chapter changed while the model was working", async () => {
		const { fake, view, host, store } = await setup();
		host.settings.device = { endpoint: "http://h:11434", generationModel: "gen", embeddingModel: "" };
		host.network.request.mockImplementation(() => {
			store.set("Book/one.md", "Rewritten meanwhile.");
			store.set("Book/two.md", "Rewritten too.");
			return Promise.resolve({ status: 200, text: JSON.stringify({ message: { content: JSON.stringify({ summary: "Old news.", key_points: [] }) } }) });
		});
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Summarize chapters"));
		button(view, "Summarize chapters").click();
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Summarize")!.click();
		await vi.waitFor(() => expect(text(view)).toMatch(/Chapter \d: Chapter \d changed while it was being summarized\./));
		expect([...store.keys()].filter((p) => p.includes("/summaries/")).length).toBeLessThan(2);
	});

	it("retries a dropped connection once after a short pause", async () => {
		const { fake, view, host, store } = await setup();
		store.delete("Book/two.md");
		for (const [p, t] of store) if (p.includes("/chapters/") && t.includes("Chapter 2")) store.set(p, t.replace(/note_path: .*/, "note_path: null"));
		host.settings.device = { endpoint: "http://h:11434", generationModel: "gen", embeddingModel: "" };
		host.network.request.mockRejectedValueOnce(new Error("blip")).mockImplementation(() => Promise.resolve({ status: 200, text: JSON.stringify({ message: { content: JSON.stringify({ summary: "Fine.", key_points: [] }) } }) }));
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Summarize chapters"));
		button(view, "Summarize chapters").click();
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Summarize")!.click();
		await vi.waitFor(() => expect(Notice.instances.at(-1)?.message).toBe("Summarized 1 of 1 chapters."), { timeout: 3000 });
		expect(host.network.request).toHaveBeenCalledTimes(2);
	});

	it("proofreads after confirmation, lets the author review and apply, and never touches the chapter before that", async () => {
		const { fake, view, host, store } = await setup();
		const prose = "The captian walked to the harbour at dawn.";
		store.set("Book/one.md", prose);
		store.delete("Book/two.md");
		for (const [p, t] of store) if (p.includes("/chapters/") && t.includes("Chapter 2")) store.set(p, t.replace(/note_path: .*/, "note_path: null"));
		host.settings.device = { endpoint: "http://h:11434", generationModel: "gen", embeddingModel: "" };
		host.network.request.mockImplementation(() => Promise.resolve({ status: 200, text: JSON.stringify({ message: { content: JSON.stringify({ corrected: "The captain walked to the harbour at dawn." }) } }) }));
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Proofread chapters"));
		button(view, "Proofread chapters").click();
		expect(document.body.textContent).toContain("Each paragraph of 1 chapter that has not been reviewed yet will be sent, one at a time, to http://h:11434");
		expect(host.network.request).not.toHaveBeenCalled();
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Proofread")!.click();
		await vi.waitFor(() => expect(text(view)).toContain("Suggested changes for Chapter 1"));
		expect(store.get("Book/one.md")).toBe(prose);
		expect(text(view)).toContain("Proofreading: 0 of 1 paragraphs reviewed, 1 waiting for your decision.");
		expect(text(view)).toContain("1 paragraph with suggestions");
		const edit = () => view.contentEl.querySelector(".bh-edit") as HTMLElement;
		button(view, "Accept", edit()).click();
		await vi.waitFor(() => expect(text(view)).toContain("Apply 1 accepted change to the chapter"));
		expect(store.get("Book/one.md")).toBe(prose);
		button(view, "Apply 1 accepted change to the chapter").click();
		await vi.waitFor(() => expect(store.get("Book/one.md")).toBe("The captain walked to the harbour at dawn."));
		await vi.waitFor(() => expect(text(view)).toContain("Proofreading: 1 of 1 paragraphs reviewed."));
		expect(text(view)).not.toContain("Suggested changes");
		expect(Notice.instances.some((n) => n.message === "Applied 1 change.")).toBe(true);
	});

	it("rejecting a suggestion leaves the chapter alone and counts the paragraph as reviewed", async () => {
		const { fake, view, host, store } = await setup();
		store.set("Book/one.md", "The captian walked.");
		store.delete("Book/two.md");
		for (const [p, t] of store) if (p.includes("/chapters/") && t.includes("Chapter 2")) store.set(p, t.replace(/note_path: .*/, "note_path: null"));
		host.settings.device = { endpoint: "http://h:11434", generationModel: "gen", embeddingModel: "" };
		host.network.request.mockImplementation(() => Promise.resolve({ status: 200, text: JSON.stringify({ message: { content: JSON.stringify({ corrected: "The captain walked." }) } }) }));
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Proofread chapters"));
		button(view, "Proofread chapters").click();
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Proofread")!.click();
		await vi.waitFor(() => expect(text(view)).toContain("Suggested changes"));
		button(view, "Reject", view.contentEl.querySelector(".bh-edit") as HTMLElement).click();
		await vi.waitFor(() => expect(text(view)).toContain("Proofreading: 1 of 1 paragraphs reviewed."));
		expect(store.get("Book/one.md")).toBe("The captian walked.");
	});

	it("supports bulk decisions and reports a proposal that vanished or text that moved on", async () => {
		const { fake, view, host, store } = await setup();
		store.set("Book/one.md", "The captian walked.\n\nShe did'nt answer.");
		store.delete("Book/two.md");
		for (const [p, t] of store) if (p.includes("/chapters/") && t.includes("Chapter 2")) store.set(p, t.replace(/note_path: .*/, "note_path: null"));
		host.settings.device = { endpoint: "http://h:11434", generationModel: "gen", embeddingModel: "" };
		host.network.request.mockImplementation((req?: { body?: string }) => {
			const sent = JSON.parse(req?.body ?? "{}").messages.at(-1).content as string;
			const fixed = sent.includes("captian") ? "The captain walked." : "She didn't answer.";
			return Promise.resolve({ status: 200, text: JSON.stringify({ message: { content: JSON.stringify({ corrected: fixed }) } }) });
		});
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Proofread chapters"));
		button(view, "Proofread chapters").click();
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Proofread")!.click();
		await vi.waitFor(() => expect(text(view)).toContain("Accept all 2 undecided changes"));
		button(view, "Accept all 2 undecided changes").click();
		await vi.waitFor(() => expect(text(view)).toContain("Apply 2 accepted changes to the chapter"));
		store.set("Book/one.md", "Totally different now.");
		button(view, "Apply 2 accepted changes to the chapter").click();
		await vi.waitFor(() => expect(Notice.instances.at(-1)?.message).toBe("Applied 0 changes. 2 could not be placed because the text changed; they were left for you."));
		expect(store.get("Book/one.md")).toBe("Totally different now.");
		await vi.waitFor(() => expect(text(view)).toContain("Could not be placed"));
	});

	it("tells the author when a proposal vanished before they decided or applied it", async () => {
		const { fake, view, host, store } = await setup();
		store.set("Book/one.md", "The captian walked.");
		store.delete("Book/two.md");
		for (const [p, t] of store) if (p.includes("/chapters/") && t.includes("Chapter 2")) store.set(p, t.replace(/note_path: .*/, "note_path: null"));
		host.settings.device = { endpoint: "http://h:11434", generationModel: "gen", embeddingModel: "" };
		host.network.request.mockImplementation(() => Promise.resolve({ status: 200, text: JSON.stringify({ message: { content: JSON.stringify({ corrected: "The captain walked." }) } }) }));
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Proofread chapters"));
		button(view, "Proofread chapters").click();
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Proofread")!.click();
		await vi.waitFor(() => expect(text(view)).toContain("Suggested changes"));
		const proposalKey = () => [...store.keys()].find((k) => k.includes("/proposals/"))!;
		const saved = store.get(proposalKey())!;
		button(view, "Accept", view.contentEl.querySelector(".bh-edit") as HTMLElement).click();
		await vi.waitFor(() => expect(text(view)).toContain("Apply 1 accepted change"));
		const key = proposalKey();
		store.delete(key);
		button(view, "Apply 1 accepted change to the chapter").click();
		await vi.waitFor(() => expect(Notice.instances.at(-1)?.message).toBe("That proposal no longer exists."));
		store.set(key, saved);
		view.markDirty();
		await vi.waitFor(() => expect(text(view)).toContain("Not decided"));
		store.delete(key);
		button(view, "Reject", view.contentEl.querySelector(".bh-edit") as HTMLElement).click();
		await vi.waitFor(() => expect(Notice.instances.filter((n) => n.message === "That proposal no longer exists.")).toHaveLength(2));
	});

	it("discards a proofreading run when the chapter changed meanwhile", async () => {
		const { fake, view, host, store } = await setup();
		store.set("Book/one.md", "The captian walked.");
		store.delete("Book/two.md");
		for (const [p, t] of store) if (p.includes("/chapters/") && t.includes("Chapter 2")) store.set(p, t.replace(/note_path: .*/, "note_path: null"));
		host.settings.device = { endpoint: "http://h:11434", generationModel: "gen", embeddingModel: "" };
		host.network.request.mockImplementation(() => {
			store.set("Book/one.md", "The captian walked. And more.");
			return Promise.resolve({ status: 200, text: JSON.stringify({ message: { content: JSON.stringify({ corrected: "The captain walked." }) } }) });
		});
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Proofread chapters"));
		button(view, "Proofread chapters").click();
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Proofread")!.click();
		await vi.waitFor(() => expect(text(view)).toContain("changed while it was being proofread; nothing was recorded."));
		expect(text(view)).not.toContain("Suggested changes");
	});

	it("summarizes what proofreading found, including skipped paragraphs and already reviewed ones", async () => {
		const { fake, view, host, store } = await setup();
		store.set("Book/one.md", "Fine paragraph.\n\nAnother fine one.\n\nThird.");
		store.delete("Book/two.md");
		for (const [p, t] of store) if (p.includes("/chapters/") && t.includes("Chapter 2")) store.set(p, t.replace(/note_path: .*/, "note_path: null"));
		host.settings.device = { endpoint: "http://h:11434", generationModel: "gen", embeddingModel: "" };
		let n = 0;
		host.network.request.mockImplementation((req?: { body?: string }) => {
			n++;
			const sent = /<paragraph>\n([\s\S]*?)\n<\/paragraph>/.exec(JSON.parse(req?.body ?? "{}").messages.at(-1).content as string)?.[1] ?? "";
			return Promise.resolve({ status: 200, text: JSON.stringify({ message: { content: JSON.stringify({ corrected: n === 2 ? "" : sent }) } }) });
		});
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Proofread chapters"));
		for (let round = 0; round < 2; round++) {
			button(view, "Proofread chapters").click();
			Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Proofread")!.click();
			await vi.waitFor(() => expect(Notice.instances.filter((x) => x.message === "Proofread 1 of 1 chapters.")).toHaveLength(round + 1));
			if (round === 0) {
				await vi.waitFor(() => expect(text(view)).toContain("2 unchanged; skipped: Paragraph 2: The corrected paragraph is empty."));
				button(view, "Dismiss").click();
				await vi.waitFor(() => expect(text(view)).not.toContain("Proofreading finished"));
			}
		}
		await vi.waitFor(() => expect(text(view)).toContain("1 unchanged; 2 already reviewed"));
	});

	it("retries a dropped connection once while proofreading", async () => {
		const { fake, view, host, store } = await setup();
		store.set("Book/one.md", "Fine paragraph.");
		store.delete("Book/two.md");
		for (const [p, t] of store) if (p.includes("/chapters/") && t.includes("Chapter 2")) store.set(p, t.replace(/note_path: .*/, "note_path: null"));
		host.settings.device = { endpoint: "http://h:11434", generationModel: "gen", embeddingModel: "" };
		host.network.request.mockRejectedValueOnce(new Error("blip")).mockImplementation(() => Promise.resolve({ status: 200, text: JSON.stringify({ message: { content: JSON.stringify({ corrected: "Fine paragraph." }) } }) }));
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Proofread chapters"));
		button(view, "Proofread chapters").click();
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Proofread")!.click();
		await vi.waitFor(() => expect(Notice.instances.at(-1)?.message).toBe("Proofread 1 of 1 chapters."), { timeout: 3000 });
		expect(host.network.request).toHaveBeenCalledTimes(2);
	});

	it("manages entities: add, alias, rename, merge and remove, never touching the chapters", async () => {
		const { fake, view, store } = await setup();
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Add an entity"));
		const chapterBefore = store.get("Book/one.md");
		const pick = (choice: string | null, name: string | null, confirm: string) => {
			const sel = document.body.querySelector("select") as HTMLSelectElement;
			if (choice !== null) {
				sel.value = choice;
				sel.dispatchEvent(new Event("change"));
			}
			if (name !== null) {
				const input = document.body.querySelector("input") as HTMLInputElement;
				input.value = name;
				input.dispatchEvent(new Event("input"));
			}
			Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === confirm)!.click();
		};
		const add = async (type: string, name: string) => {
			button(view, "Add an entity").click();
			pick(type, name, "Add");
			await vi.waitFor(() => expect(text(view)).toContain(name));
		};
		await add("character", "Philip");
		await add("character", "P. Marlowe");
		await add("place", "Harbour");
		expect(text(view)).toContain("Entities (3)");
		const row = (name: string) => Array.from(view.contentEl.querySelectorAll(".bh-entity")).find((e) => e.querySelector(".bh-link")?.textContent === name) as HTMLElement;
		button(view, "Add alias", row("Philip")).click();
		const prompt = (value: string) => {
			const input = document.body.querySelector("input") as HTMLInputElement;
			input.value = value;
			input.dispatchEvent(new Event("input"));
			Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Save")!.click();
		};
		prompt("Phil");
		await vi.waitFor(() => expect(text(view)).toContain("Also: Phil"));
		button(view, "Rename", row("Philip")).click();
		prompt("Philip Marlowe");
		await vi.waitFor(() => expect(text(view)).toContain("Philip Marlowe"));
		button(view, "Merge", row("P. Marlowe")).click();
		await vi.waitFor(() => expect(document.body.querySelector("select")).not.toBeNull());
		pick(null, null, "Merge");
		await vi.waitFor(() => expect(text(view)).not.toContain("Merge P. Marlowe"));
		expect(text(view)).toContain("P. Marlowe");
		button(view, "Merge", row("Harbour")).click();
		await vi.waitFor(() => expect(Notice.instances.at(-1)?.message).toBe("There is no other place to merge Harbour into."));
		button(view, "Remove", row("Harbour")).click();
		await vi.waitFor(() => expect(text(view)).not.toContain("Harbour"));
		button(view, "Add alias", row("Philip Marlowe")).click();
		prompt("Philip Marlowe");
		button(view, "Add alias", row("Philip Marlowe")).click();
		prompt("Old Phil");
		await vi.waitFor(() => expect(text(view)).toContain("Old Phil"));
		button(view, "Split", row("Philip Marlowe")).click();
		await vi.waitFor(() => expect(document.body.querySelector("select")).not.toBeNull());
		pick("Old Phil", "The Old One", "Split");
		await vi.waitFor(() => expect(text(view)).toContain("The Old One"));
		button(view, "Split", row("Philip Marlowe")).click();
		await vi.waitFor(() => expect(document.body.querySelector("select")).not.toBeNull());
		pick("Phil", "", "Split");
		await vi.waitFor(() => expect(row("Phil")).toBeDefined());
		button(view, "Add alias", row("Phil")).click();
		prompt("Philly");
		await vi.waitFor(() => expect(text(view)).toContain("Philly"));
		button(view, "Remove alias", row("Phil")).click();
		await vi.waitFor(() => expect(document.body.querySelector("select")).not.toBeNull());
		pick(null, null, "Remove");
		await vi.waitFor(() => expect(text(view)).not.toContain("Philly"));
		button(view, "Add an entity").click();
		pick("character", "phil", "Add");
		await vi.waitFor(() => expect(Notice.instances.at(-1)?.message).toMatch(/already belongs to/));
		expect(store.get("Book/one.md")).toBe(chapterBefore);
	});

	it("finds entities after confirmation, shows what it did, hints at duplicates and lets the author decide", async () => {
		const { fake, view, host, store } = await setup();
		store.set("Book/one.md", "Philip Marlowe met Marlowe at the harbour.");
		store.delete("Book/two.md");
		for (const [p, t] of store) if (p.includes("/chapters/") && t.includes("Chapter 2")) store.set(p, t.replace(/note_path: .*/, "note_path: null"));
		host.settings.device = { endpoint: "http://h:11434", generationModel: "gen", embeddingModel: "" };
		host.network.request.mockImplementation((req?: { body?: string }) => {
			const system = (JSON.parse(req?.body ?? "{}").messages[0].content as string);
			const mentions = system.includes("list the characters:") ? [{ name: "Philip Marlowe", aliases: [], quote: "Philip Marlowe met", note: "Meets someone." }, { name: "Marlowe", aliases: [], quote: "met Marlowe", note: "Is met." }, { name: "Ghost", aliases: [], quote: "not in the text", note: "" }] : [];
			return Promise.resolve({ status: 200, text: JSON.stringify({ message: { content: JSON.stringify({ mentions }) } }) });
		});
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Find characters, places and objects"));
		button(view, "Find characters, places and objects").click();
		expect(document.body.textContent).toContain("will be sent to http://h:11434 using the model \"gen\", once for each of 3 kinds (character, place, object)");
		expect(host.network.request).not.toHaveBeenCalled();
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Find")!.click();
		await vi.waitFor(() => expect(Notice.instances.at(-1)?.message).toBe("Read 1 of 1 chapters."));
		await vi.waitFor(() => expect(text(view)).toContain("Could these be the same? (1)"));
		expect(text(view)).toContain("2 new (Philip Marlowe, Marlowe)");
		expect(text(view)).toContain("1 left out because the quote was not in the text");
		expect(store.get("Book/one.md")).toBe("Philip Marlowe met Marlowe at the harbour.");
		const history = [...store.entries()].find(([p, t]) => p.includes("/entities/") && t.includes("name: Philip Marlowe"))?.[1];
		expect(history).toContain("## History (AI-managed)");
		button(view, "Different").click();
		await vi.waitFor(() => expect(text(view)).not.toContain("Could these be the same?"));
		store.set("Book/one.md", "Nothing about them now.");
		host.network.request.mockImplementation(() => Promise.resolve({ status: 200, text: JSON.stringify({ message: { content: JSON.stringify({ mentions: [] }) } }) }));
		button(view, "Find characters, places and objects").click();
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Find")!.click();
		await vi.waitFor(() => expect(text(view)).toContain("No chapter supports these any more"));
	});

	it("uses the plural for several chapters and discards a reading when the chapter changed meanwhile", async () => {
		const { fake, view, host, store } = await setup();
		host.settings.device = { endpoint: "http://h:11434", generationModel: "gen", embeddingModel: "" };
		host.network.request.mockImplementation(() => {
			store.set("Book/one.md", "Rewritten meanwhile.");
			store.set("Book/two.md", "Also rewritten.");
			return Promise.resolve({ status: 200, text: JSON.stringify({ message: { content: JSON.stringify({ mentions: [] }) } }) });
		});
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Find characters, places and objects"));
		button(view, "Find characters, places and objects").click();
		expect(document.body.textContent).toContain("The text of 2 chapters will be sent");
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Find")!.click();
		await vi.waitFor(() => expect(text(view)).toMatch(/changed while it was being read; nothing was recorded\./));
	});

	it("retries a dropped connection once while finding entities", async () => {
		const { fake, view, host, store } = await setup();
		store.delete("Book/two.md");
		for (const [p, t] of store) if (p.includes("/chapters/") && t.includes("Chapter 2")) store.set(p, t.replace(/note_path: .*/, "note_path: null"));
		host.settings.device = { endpoint: "http://h:11434", generationModel: "gen", embeddingModel: "" };
		host.network.request.mockRejectedValueOnce(new Error("blip")).mockImplementation(() => Promise.resolve({ status: 200, text: JSON.stringify({ message: { content: JSON.stringify({ mentions: [] }) } }) }));
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Find characters, places and objects"));
		button(view, "Find characters, places and objects").click();
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Find")!.click();
		await vi.waitFor(() => expect(Notice.instances.at(-1)?.message).toBe("Read 1 of 1 chapters."), { timeout: 3000 });
	});

	it("shows the tapped entity beside the chapter and lets the author close or open it", async () => {
		const { fake, view, host, store } = await setup();
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Add an entity"));
		button(view, "Add an entity").click();
		(document.body.querySelector("input") as HTMLInputElement).value = "Philip";
		(document.body.querySelector("input") as HTMLInputElement).dispatchEvent(new Event("input"));
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Add")!.click();
		await vi.waitFor(() => expect(text(view)).toContain("Philip"));
		const key = [...store.keys()].find((k) => k.includes("/entities/"))!;
		host.selectedEntity = key.split("/").pop()!.replace(".md", "");
		view.markDirty();
		await vi.waitFor(() => expect(view.contentEl.querySelector(".bh-selected")).not.toBeNull());
		expect(view.contentEl.querySelector(".bh-selected")?.textContent).toContain("Philip (character)");
		button(view, "Open note", view.contentEl.querySelector(".bh-selected") as HTMLElement).click();
		expect(fake.openFile).toHaveBeenCalled();
		button(view, "Close", view.contentEl.querySelector(".bh-selected") as HTMLElement).click();
		await vi.waitFor(() => expect(view.contentEl.querySelector(".bh-selected")).toBeNull());
		host.selectedEntity = "en_gone";
		view.markDirty();
		await vi.waitFor(() => expect(text(view)).toContain("Add an entity"));
		expect(view.contentEl.querySelector(".bh-selected")).toBeNull();
	});

	it("searches the book on request, jumps to the exact passage, and warns when the chapter changed since", async () => {
		const { fake, view, store } = await setup();
		store.set("Book/one.md", "The captain met the Zorblax at dawn.");
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Search"));
		const input = () => view.contentEl.querySelector("input") as HTMLInputElement;
		button(view, "Search").click();
		expect(Notice.instances.at(-1)?.message).toBe("Type a word or phrase to search for.");
		input().value = "zorblax";
		button(view, "Search").click();
		await vi.waitFor(() => expect(text(view)).toContain("Keyword search over"));
		expect(input().value).toBe("zorblax");
		expect(text(view)).toContain("The captain met the Zorblax at dawn.");
		const selected: Array<[unknown, unknown]> = [];
		const editor = { getValue: () => store.get("Book/one.md")!, offsetToPos: (n: number) => n, setSelection: (a: unknown, b: unknown) => selected.push([a, b]), scrollIntoView: vi.fn() };
		(fake.leaf as unknown as { view: unknown }).view = Object.assign(new MarkdownView(), { editor });
		(view.contentEl.querySelector(".bh-result .bh-link") as HTMLButtonElement).click();
		await vi.waitFor(() => expect(selected).toEqual([[0, 36]]));
		expect(editor.scrollIntoView).toHaveBeenCalled();
		store.set("Book/one.md", "Edited since the search.");
		(view.contentEl.querySelector(".bh-result .bh-link") as HTMLButtonElement).click();
		await vi.waitFor(() => expect(Notice.instances.at(-1)?.message).toBe("This chapter changed since the search. Search again to jump to the exact place."));
		(fake.leaf as unknown as { view: unknown }).view = {};
		(view.contentEl.querySelector(".bh-result .bh-link") as HTMLButtonElement).click();
		store.delete("Book/one.md");
		(view.contentEl.querySelector(".bh-result .bh-link") as HTMLButtonElement).click();
		input().value = "nothingfound";
		button(view, "Search").click();
		await vi.waitFor(() => expect(text(view)).toContain("Nothing found for “nothingfound”"));
	});

	it("builds the meaning index after confirmation and then mixes meaning results into a search", async () => {
		const { fake, view, host, store } = await setup();
		store.set("Book/one.md", "The ship reached the quay at dawn.");
		store.set("Book/two.md", `A walk in the forest. ${"More words here. ".repeat(80)}\n\n${"Second paragraph about the forest again. ".repeat(40)}`);
		host.settings.device = { endpoint: "http://h:11434", generationModel: "", embeddingModel: "emb" };
		const embed = (texts: string[]) => texts.map((t) => [/(ship|quay|harbour)/i.test(t) ? 1 : 0, /forest/i.test(t) ? 1 : 0, 0.01]);
		host.network.request.mockImplementation((req?: { body?: string }) => Promise.resolve({ status: 200, text: JSON.stringify({ model: "emb", embeddings: embed((JSON.parse(req?.body ?? "{}") as { input: string[] }).input) }) }));
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Meaning index: not built yet (0 of 3 passages)."));
		button(view, "Build or update").click();
		expect(document.body.textContent).toContain("Only passages that are new or changed since the last build are sent.");
		expect(document.body.textContent).toContain('using the embedding model "emb"');
		expect(host.network.request).not.toHaveBeenCalled();
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Build")!.click();
		await vi.waitFor(() => expect(Notice.instances.at(-1)?.message).toBe("Indexed 2 of 2 chapters."));
		await vi.waitFor(() => expect(text(view)).toContain("Meaning index: up to date (3 of 3 passages)."));
		expect(text(view)).toContain("Chapter 1: 1 passage embedded.");
		expect(text(view)).toContain("Chapter 2: 2 passages embedded.");
		const input = () => view.contentEl.querySelector("input[type=search]") as HTMLInputElement;
		const box = () => view.contentEl.querySelector("input[type=checkbox]") as HTMLInputElement;
		input().value = "harbour";
		button(view, "Search").click();
		await vi.waitFor(() => expect(text(view)).toContain("Nothing found for “harbour”"));
		box().checked = true;
		input().value = "harbour";
		button(view, "Search").click();
		await vi.waitFor(() => expect(text(view)).toContain("Meaning results are included."));
		expect(text(view)).toContain("The ship reached the quay at dawn.");
		expect(view.contentEl.querySelector(".bh-result .bh-badge")?.textContent).toBe("meaning");
		expect(box().checked).toBe(true);
	});

	it("says so when the meaning index is already up to date, and uses the singular for one chapter", async () => {
		const { fake, view, host, store } = await setup();
		store.set("Book/one.md", "The ship reached the quay.");
		store.delete("Book/two.md");
		for (const [p, t] of store) if (p.includes("/chapters/") && t.includes("Chapter 2")) store.set(p, t.replace(/note_path: .*/, "note_path: null"));
		host.settings.device = { endpoint: "http://h:11434", generationModel: "", embeddingModel: "emb" };
		host.network.request.mockImplementation((req?: { body?: string }) => Promise.resolve({ status: 200, text: JSON.stringify({ model: "emb", embeddings: (JSON.parse(req?.body ?? "{}") as { input: string[] }).input.map(() => [1, 0.5]) }) }));
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Build or update"));
		for (const round of [1, 2]) {
			button(view, round === 1 ? "Build or update" : "Rebuild").click();
			expect(document.body.textContent).toContain("The text of 1 chapter will be sent");
			Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Build")!.click();
			await vi.waitFor(() => expect(Notice.instances.filter((n) => n.message === "Indexed 1 of 1 chapters.")).toHaveLength(round));
			await vi.waitFor(() => expect(text(view)).toContain(round === 1 ? "1 passage embedded." : "Already up to date."));
			button(view, "Dismiss").click();
			await vi.waitFor(() => expect(text(view)).not.toContain("Meaning index finished"));
		}
	});

	it("shows the context of a search hit on request and forgets it when the search changes", async () => {
		const { fake, view, store } = await setup();
		store.set("Book/one.md", "Philip Marlowe met the Zorblax.");
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Search"));
		(view.contentEl.querySelector("input[type=search]") as HTMLInputElement).value = "zorblax";
		button(view, "Search").click();
		await vi.waitFor(() => expect(text(view)).toContain("Show context"));
		button(view, "Show context").click();
		await vi.waitFor(() => expect(text(view)).toContain("No known entity is named in this passage."));
		(view.contentEl.querySelector("input[type=search]") as HTMLInputElement).value = "zorblax";
		button(view, "Search").click();
		await vi.waitFor(() => expect(text(view)).toContain("Show context"));
	});

	it("explains what is missing before building the meaning index", async () => {
		const { fake, view, host } = await setup();
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Search"));
		expect(view.contentEl.querySelector("input[type=checkbox]")).toBeNull();
		expect(text(view)).not.toContain("Meaning index");
		host.settings.device = { endpoint: "http://h:11434", generationModel: "", embeddingModel: "emb" };
		view.markDirty();
		await vi.waitFor(() => expect(text(view)).toContain("Meaning index:"));
		host.settings.device = { endpoint: "http://h:11434", generationModel: "", embeddingModel: "" };
	});

	it("guards building the meaning index against a missing setup and a running job", async () => {
		const { fake, view, host, runner } = await setup();
		host.settings.device = { endpoint: "http://h:11434", generationModel: "", embeddingModel: "emb" };
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Build or update"));
		host.settings.device = { endpoint: "", generationModel: "", embeddingModel: "emb" };
		button(view, "Build or update").click();
		expect(Notice.instances.at(-1)?.message).toBe("Set the server address and the embedding model in the Book Harness settings first.");
		host.settings.device = { endpoint: "http://h:11434", generationModel: "", embeddingModel: "emb" };
		vi.spyOn(runner, "hasRunningJob").mockReturnValueOnce(true);
		button(view, "Build or update").click();
		expect(Notice.instances.at(-1)?.message).toBe("A job is already running for this book.");
	});

	it("reports a meaning-index build that could not start", async () => {
		const { fake, view, host } = await setup();
		host.settings.device = { endpoint: "http://h:11434", generationModel: "", embeddingModel: "emb" };
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Build or update"));
		fake.appAny.vault.create = () => Promise.reject(new Error("disk full"));
		button(view, "Build or update").click();
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Build")!.click();
		await vi.waitFor(() => expect(Notice.instances.at(-1)?.message).toBe("disk full"));
	});

	it("explains what is missing before finding entities", async () => {
		const { fake, view } = await setup();
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Find characters, places and objects"));
		button(view, "Find characters, places and objects").click();
		expect(Notice.instances.at(-1)?.message).toMatch(/Set the server address/);
		expect(document.body.textContent).not.toContain("will be sent to");
	});

	it("merges a suggested duplicate on request", async () => {
		const { fake, view, store } = await setup();
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Add an entity"));
		const add = async (name: string) => {
			button(view, "Add an entity").click();
			const input = document.body.querySelector("input") as HTMLInputElement;
			input.value = name;
			input.dispatchEvent(new Event("input"));
			Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Add")!.click();
			await vi.waitFor(() => expect(text(view)).toContain(name));
		};
		await add("Philip Marlowe");
		await add("Marlowe");
		await vi.waitFor(() => expect(text(view)).toContain("Could these be the same?"));
		(view.contentEl.querySelector('button[aria-label^="Merge "]') as HTMLButtonElement).click();
		await vi.waitFor(() => expect(text(view)).not.toContain("Could these be the same?"));
		expect([...store.values()].filter((t) => t.includes("merged_into: en_")).length).toBe(1);
	});

	it("says so when an entity vanished before an action reached it", async () => {
		const { fake, view, store } = await setup();
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Add an entity"));
		button(view, "Add an entity").click();
		(document.body.querySelector("input") as HTMLInputElement).value = "Lamp";
		(document.body.querySelector("input") as HTMLInputElement).dispatchEvent(new Event("input"));
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Add")!.click();
		await vi.waitFor(() => expect(text(view)).toContain("Lamp"));
		for (const key of [...store.keys()]) if (key.includes("/entities/")) store.delete(key);
		button(view, "Remove").click();
		await vi.waitFor(() => expect(Notice.instances.at(-1)?.message).toBe("That entity no longer exists."));
	});

	it("explains what is missing before proofreading and guards against a second job", async () => {
		const { fake, view, host, store, runner } = await setup();
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Proofread chapters"));
		button(view, "Proofread chapters").click();
		expect(Notice.instances.at(-1)?.message).toMatch(/Set the server address/);
		host.settings.device = { endpoint: "http://h:11434", generationModel: "gen", embeddingModel: "" };
		vi.spyOn(runner, "hasRunningJob").mockReturnValueOnce(true);
		button(view, "Proofread chapters").click();
		expect(Notice.instances.at(-1)?.message).toBe("A job is already running for this book.");
		for (const [p, t] of store) if (p.includes("/chapters/")) store.set(p, t.replace(/note_path: .*/, "note_path: null"));
		view.markDirty();
		await vi.waitFor(() => expect(text(view)).toContain("No file yet"));
		button(view, "Proofread chapters").click();
		expect(Notice.instances.at(-1)?.message).toBe("No chapter has a manuscript note yet.");
	});

	it("reports a proofreading job that could not start and a proposal that no longer exists", async () => {
		const { fake, view, host } = await setup();
		host.settings.device = { endpoint: "http://h:11434", generationModel: "gen", embeddingModel: "" };
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Proofread chapters"));
		fake.appAny.vault.create = () => Promise.reject(new Error("disk full"));
		button(view, "Proofread chapters").click();
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Proofread")!.click();
		await vi.waitFor(() => expect(Notice.instances.at(-1)?.message).toBe("disk full"));
	});

	it("reports a summary job that could not start", async () => {
		const { fake, view, host } = await setup();
		host.settings.device = { endpoint: "http://h:11434", generationModel: "gen", embeddingModel: "" };
		fake.state.active = "Book/one.md";
		await view.onOpen();
		await vi.waitFor(() => expect(text(view)).toContain("Summarize chapters"));
		fake.appAny.vault.create = () => Promise.reject(new Error("disk full"));
		button(view, "Summarize chapters").click();
		Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Summarize")!.click();
		await vi.waitFor(() => expect(Notice.instances.at(-1)?.message).toBe("disk full"));
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
		expect([...store.values()].some((t) => t.includes("note_path: renamed.md"))).toBe(true);
	});

	it("logs instead of throwing when the vault cannot be read", async () => {
		const { fake } = await setup();
		fake.appAny.vault.getMarkdownFiles = () => {
			throw new Error("boom");
		};
		await expect(onVaultRename(fake.app, { path: "a" } as never, "b")).resolves.toBeUndefined();
	});
});
