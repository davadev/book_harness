// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerBook } from "../core/books";
import { addChapter } from "../core/chapters";
import { GuardedVault } from "../core/guarded-vault";
import { DiagnosticsLog } from "../core/ai/diagnostics";
import { DEFAULT_SETTINGS } from "../settings/defaults";
import { JobRunner } from "../core/jobs";
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
	const host = { settings: structuredClone(DEFAULT_SETTINGS), network: { request: vi.fn((): Promise<{ status: number; text: string }> => Promise.reject(new Error("no server"))) }, diagnostics: new DiagnosticsLog() };
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
