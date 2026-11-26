import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerBook } from "../core/books";
import { addChapter } from "../core/chapters";
import { diffText } from "../core/diff";
import { GuardedVault } from "../core/guarded-vault";
import { createProposal } from "../core/proposals";
import { EditorReview, editorViewOf } from "../platform/editor-review";
import { ObsidianVaultPort } from "../platform/vault-port";
import { makeFakeApp } from "./__mocks__/fakeApp";
import { MarkdownView, Notice } from "./__mocks__/obsidian";
import { counterRandom } from "./__mocks__/fakeVault";

const TEXT = "The captian walked home.";
const FIXED = "The captain walked home.";

beforeEach(() => {
	Notice.instances.length = 0;
	vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

async function setup(open = true) {
	const fake = makeFakeApp({ "Book/one.md": TEXT, "Other/x.md": "x", "Book/loose.md": "not a chapter" });
	const vault = new GuardedVault(new ObsidianVaultPort(fake.app));
	const rnd = counterRandom();
	const book = await registerBook(vault, "Book", "Book", "en", rnd);
	const chapter = await addChapter(vault, book, [], { designation: "Chapter 1", notePath: "Book/one.md" }, rnd);
	const proposal = await createProposal(vault, book, chapter, TEXT, { action: "proofread" }, diffText(TEXT, FIXED).map((h) => ({ from: h.from, to: h.to, replacement: h.replacement })), rnd, "t");
	let value = TEXT;
	const dispatch = vi.fn();
	const editor = { getValue: () => value, offsetToPos: (n: number) => n, replaceRange: (t: string, f: number, to: number) => (value = value.slice(0, f) + t + value.slice(to)) };
	const leaf = (path: string, cm: unknown) => ({ view: Object.assign(new MarkdownView(), { file: { path }, editor: { ...editor, cm } }) });
	const leaves = open ? [leaf("Book/one.md", { dispatch }), leaf("Other/x.md", { dispatch }), leaf("Book/loose.md", { dispatch }), leaf("Book/one.md", undefined), { view: {} }, { view: Object.assign(new MarkdownView(), { file: null, editor }) }] : [];
	(fake.appAny.workspace as unknown as { getLeavesOfType: () => unknown[] }).getLeavesOfType = () => leaves;
	return { fake, vault, book, chapter, proposal, dispatch, getText: () => value, review: new EditorReview(fake.app) };
}

describe("EditorReview", () => {
	it("pushes the chapter's open suggestions into its editor, once, and nothing for notes outside a book", async () => {
		const { review, dispatch } = await setup();
		await review.refresh();
		expect(dispatch).toHaveBeenCalledTimes(3);
		const shown = (dispatch.mock.calls[0]![0] as { effects: { value: Array<{ original: string; replacement: string }> } }).effects.value;
		expect(shown.map((e) => [e.original, e.replacement])).toEqual([["captian", "captain"]]);
		expect((dispatch.mock.calls[1]![0] as { effects: { value: unknown[] } }).effects.value).toEqual([]);
		expect((dispatch.mock.calls[2]![0] as { effects: { value: unknown[] } }).effects.value).toEqual([]);
		await review.refresh();
		expect(dispatch).toHaveBeenCalledTimes(3);
	});

	it("does nothing without editors and coalesces scheduled refreshes", async () => {
		const { review } = await setup(false);
		const spy = vi.spyOn(review, "refresh");
		review.schedule();
		review.schedule();
		await vi.advanceTimersByTimeAsync(500);
		expect(spy).toHaveBeenCalledTimes(1);
		review.schedule();
		review.cancel();
		await vi.advanceTimersByTimeAsync(500);
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it("runs one refresh at a time and repeats once if asked meanwhile", async () => {
		const { review, dispatch } = await setup();
		const first = review.refresh();
		const second = review.refresh();
		await Promise.all([first, second]);
		await vi.advanceTimersByTimeAsync(10);
		expect(dispatch.mock.calls.length).toBeGreaterThanOrEqual(3);
	});

	it("applies an accepted suggestion at once through the gate and refreshes", async () => {
		const { review, dispatch, getText } = await setup();
		await review.refresh();
		const widgetDecide = (review.extension() as unknown as never[]).length;
		expect(widgetDecide).toBeGreaterThan(0);
		const edit = (dispatch.mock.calls[0]![0] as { effects: { value: Array<{ proposalId: string; editId: string }> } }).effects.value[0]!;
		await (review as unknown as { decide: (e: unknown, d: string) => Promise<void> }).decide({ ...edit, from: 4, to: 11, original: "captian", replacement: "captain", decision: "pending" }, "accepted");
		// The chapter is open in an editor, so the change goes through the editor (keeping cursor and undo).
		expect(getText()).toBe(FIXED);
		expect(Notice.instances.at(-1)?.message).toBe("Applied 1 change.");
	});

	it("carries out a click on a suggestion button", async () => {
		const { review, dispatch, fake } = await setup();
		await review.refresh();
		const edit = (dispatch.mock.calls[0]![0] as { effects: { value: Array<{ proposalId: string; editId: string; from: number; to: number; original: string; replacement: string; decision: "pending" }> } }).effects.value[0]!;
		review.onDecide(edit, "rejected");
		await vi.waitFor(() => expect(JSON.stringify([...fake.store.entries()].filter(([p]) => p.includes("/proposals/")))).toContain("rejected"));
	});

	it("records a rejection without touching the chapter", async () => {
		const { review, dispatch, fake } = await setup();
		await review.refresh();
		const edit = (dispatch.mock.calls[0]![0] as { effects: { value: Array<{ proposalId: string; editId: string }> } }).effects.value[0]!;
		await (review as unknown as { decide: (e: unknown, d: string) => Promise<void> }).decide(edit, "rejected");
		expect(fake.store.get("Book/one.md")).toBe(TEXT);
		expect(Notice.instances).toHaveLength(0);
	});

	it("tells the author when a suggestion is no longer available or a decision fails", async () => {
		const { review, fake } = await setup();
		const decide = (e: unknown, d: string) => (review as unknown as { decide: (e: unknown, d: string) => Promise<void> }).decide(e, d);
		await decide({ proposalId: "pr_unknown", editId: "e1" }, "accepted");
		expect(Notice.instances.at(-1)?.message).toBe("That suggestion is no longer available.");
		await review.refresh();
		fake.appAny.vault.process = () => Promise.reject("odd");
		const known = [...(review as unknown as { context: Map<string, unknown> }).context.keys()].find((k) => k.startsWith("pr_"))!;
		await decide({ proposalId: known, editId: "e1" }, "rejected");
		expect(Notice.instances.at(-1)?.message).toBe("odd");
	});

	it("logs instead of throwing when the vault cannot be read", async () => {
		const { review, fake } = await setup();
		fake.appAny.vault.getMarkdownFiles = () => {
			throw new Error("boom");
		};
		await expect(review.refresh()).resolves.toBeUndefined();
	});

	it("finds the CodeMirror view behind an editor, or none", () => {
		expect(editorViewOf(Object.assign(new MarkdownView(), { editor: { cm: { id: 1 } } }) as never)).toEqual({ id: 1 });
		expect(editorViewOf(Object.assign(new MarkdownView(), { editor: {} }) as never)).toBeNull();
	});
});
