import { ItemView, Notice, TFile, type WorkspaceLeaf } from "obsidian";
import { listBooks, type Book } from "../core/books";
import { addChapter, bindNote, listChapters, readingOrder, setDesignation, setOrder, setStatus, type Chapter } from "../core/chapters";
import type { ChapterStatus } from "../core/status";
import type { SummaryStatus } from "../core/summary";
import { buildOverview, orderToMove, resolveContext } from "../core/panel-model";
import { addManualTodo, listManualTodos, setManualTodoDone } from "../core/manual-todos";
import { findConflictCopies } from "../core/sync-conflicts";
import { JobRunner, dismissJob, listJobs, presentJobs } from "../core/jobs";
import type { DiagnosticsLog } from "../core/ai/diagnostics";
import type { NetworkPort } from "../core/ai/network";
import { OllamaClient, normalizeEndpoint } from "../core/ai/ollama";
import { coverageView, defaultProofreadPrompt, loadCoverage, proofreadChapter, type CoverageView } from "../core/proofread";
import { EXTRACTED_KINDS, extractChapter, loadEvidence, rebuildHistories, unsupportedExtracted, type ChapterEvidence } from "../core/extraction";
import { ENTITY_TYPES, markDistinct, type Entity, activeEntities, addAlias, archiveEntity, createEntity, listAllEntities, mergeEntities, removeAlias, renameEntity, splitEntity } from "../core/entities";
import { listProposals } from "../core/proposals";
import { applyProposalById, decideEdits } from "../core/review";
import { loadPrompt, summarizeChapter, summaryStatus } from "../core/summary";
import type { BookHarnessSettings } from "../settings/defaults";
import { ConfirmModal } from "./confirm-modal";
import { PickModal } from "./pick-modal";
import { chapterStats, type ChapterStats } from "../core/task-state";
import { renderOverview, type BookActions, type OverviewActions } from "../ui/overview";
import { createGuardedVault } from "./guarded-vault";
import type { GuardedVault } from "../core/guarded-vault";
import { PromptModal } from "./prompt-modal";
import { platformRandom } from "./random";
import { registerActiveFolder } from "./register-book";

/** What the panel needs from the plugin: current settings, the network, and the run log. */
export interface PanelHost {
	settings: BookHarnessSettings;
	network: NetworkPort;
	diagnostics: DiagnosticsLog;
}

/** Tell the author what applying did, in plain words. */
export function announceApplied(result: { applied: number; conflicts: string[] }): void {
	new Notice(`Applied ${result.applied} change${result.applied === 1 ? "" : "s"}.${result.conflicts.length ? ` ${result.conflicts.length} could not be placed because the text changed; they were left for you.` : ""}`, 8000);
}

export const PANEL_VIEW_TYPE = "book-harness-panel";

export class BookHarnessView extends ItemView {
	private dirty = true;
	private drawing = false;
	private timer = 0;

	constructor(leaf: WorkspaceLeaf, private readonly runner: JobRunner, private readonly host: PanelHost) {
		super(leaf);
	}

	getViewType(): string {
		return PANEL_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Book Harness";
	}

	getIcon(): string {
		return "book-open";
	}

	onOpen(): Promise<void> {
		const refresh = () => this.scheduleRefresh();
		// Only notes the panel reads trigger a redraw: managed records, or any rename/delete (a chapter's note may move).
		const managed = (f: { path: string }) => f.path.includes("/_book-harness/");
		this.registerEvent(this.app.workspace.on("file-open", refresh));
		this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => (leaf === this.leaf ? this.showAgain() : undefined)));
		this.registerEvent(this.app.vault.on("modify", (f) => (managed(f) ? refresh() : undefined)));
		this.registerEvent(this.app.vault.on("create", (f) => (managed(f) ? refresh() : undefined)));
		this.registerEvent(this.app.vault.on("delete", refresh));
		this.registerEvent(this.app.vault.on("rename", refresh));
		this.register(() => window.clearTimeout(this.timer));
		this.markDirty();
		return Promise.resolve();
	}

	private scheduleRefresh(): void {
		window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => this.markDirty(), 150);
	}

	/** Mark stale; draw only when the panel is on screen (playbook: never draw while hidden). */
	markDirty(): void {
		this.dirty = true;
		if (typeof this.containerEl.isShown !== "function" || this.containerEl.isShown()) void this.draw();
	}

	/** Called when the panel becomes visible again. */
	showAgain(): void {
		if (this.dirty) void this.draw();
	}

	async draw(): Promise<void> {
		if (this.drawing) return;
		this.drawing = true;
		try {
			this.dirty = false;
			const vault = createGuardedVault(this.app);
			const { books, problems: bookProblems } = await listBooks(vault);
			const active = this.app.workspace.getActiveFile()?.path ?? null;
			const loaded = await Promise.all(books.map((b) => listChapters(vault, b)));
			const chapters = loaded.flatMap((r) => r.chapters);
			const problems = [...bookProblems, ...loaded.flatMap((r) => r.problems)].map((p) => `${p.path}: ${p.reason}`);
			const ctx = resolveContext(books, active, chapters);
			const book = ctx.kind === "book" ? ctx.book : null;
			const shown = book ? chapters.filter((c) => c.bookId === book.id) : [];
			const stats = new Map<string, ChapterStats>();
			for (const c of shown) stats.set(c.id, await chapterStats(vault, book as Book, c));
			const prompt = book ? await loadPrompt(vault, book) : null;
			if (prompt) problems.push(...prompt.problems);
			const summaries = new Map<string, { status: SummaryStatus; path: string | null }>();
			if (book && prompt) for (const c of shown) summaries.set(c.id, await summaryStatus(vault, book, c, { promptId: prompt.prompt.id, model: this.host.settings.device.generationModel }));
			const proposals = book ? await listProposals(vault, book) : { proposals: [], problems: [] };
			problems.push(...proposals.problems);
			const coverage = new Map<string, CoverageView>();
			if (book) for (const c of shown) if (c.notePath !== null && vault.exists(c.notePath)) coverage.set(c.id, coverageView(await vault.read(c.notePath), await loadCoverage(vault, book, c.id)));
			const entityData = book ? await listAllEntities(vault, book) : { entities: [], problems: [] };
			problems.push(...entityData.problems);
			const evidence: ChapterEvidence[] = [];
			if (book) for (const c of shown) { const e = await loadEvidence(vault, book, c.id); if (e) evidence.push(e); }
			const unsupported = book && evidence.length > 0 ? unsupportedExtracted(entityData.entities, evidence) : [];
			const manual = book ? await listManualTodos(vault, book) : [];
			const jobs = book ? await listJobs(vault, book) : { jobs: [], problems: [] };
			problems.push(...jobs.problems);
			const overview = book ? buildOverview(book, shown, active, (p) => vault.exists(p), stats, presentJobs(jobs.jobs, this.runner), findConflictCopies(book, vault.markdownPaths()), manual, summaries, proposals.proposals, coverage, activeEntities(entityData.entities), unsupported) : null;
			renderOverview(this.contentEl, ctx, overview, this.actions(chapters), problems);
		} catch (e) {
			this.contentEl.empty();
			this.contentEl.createEl("p", { cls: "bh-empty", text: `Book Harness could not read this book: ${e instanceof Error ? e.message : String(e)}` });
		} finally {
			this.drawing = false;
			if (this.dirty) void this.draw();
		}
	}

	/** The checks every model action shares. Says what is wrong in a notice and returns null, or what the action needs. */
	private readyToSend(book: Book, chapters: Chapter[]): { base: string; device: BookHarnessSettings["device"]; targets: Chapter[] } | null {
		const device = this.host.settings.device;
		const base = normalizeEndpoint(device.endpoint);
		if (base === null || device.generationModel === "") {
			new Notice("Set the server address and the generation model in the Book Harness settings first.", 8000);
			return null;
		}
		if (this.runner.hasRunningJob(book.id)) {
			new Notice("A job is already running for this book.", 8000);
			return null;
		}
		const targets = chapters.filter((c) => c.notePath !== null);
		if (targets.length === 0) {
			new Notice("No chapter has a manuscript note yet.", 8000);
			return null;
		}
		return { base, device, targets };
	}

	private async startSummaries(vault: GuardedVault, book: Book, chapters: Chapter[], base: string, model: string): Promise<void> {
		const { prompt } = await loadPrompt(vault, book);
		const client = new OllamaClient(this.host.network, base);
		const now = () => new Date().toISOString();
		const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
		const job = await this.runner.runChapterJob({ vault, book, random: platformRandom, now, onChange: () => this.scheduleRefresh() }, "chapter.summary", "summarize-chapters", chapters, async (chapter, signal) => {
			const r = await summarizeChapter(vault, book, chapter, { client, model, prompt, signal, diagnostics: this.host.diagnostics, now, sleep });
			return r.kind === "saved" ? { state: "done", message: r.issues.length ? `Saved, but: ${r.issues.join(" ")}` : undefined } : { state: "discarded", message: r.reason };
		});
		new Notice(`Summarized ${job.items.filter((i) => i.state === "done").length} of ${job.items.length} chapters.`, 8000);
		this.markDirty();
	}

	private async startExtraction(vault: GuardedVault, book: Book, chapters: Chapter[], base: string, model: string): Promise<void> {
		const client = new OllamaClient(this.host.network, base);
		const now = () => new Date().toISOString();
		const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
		const job = await this.runner.runChapterJob({ vault, book, random: platformRandom, now, onChange: () => this.scheduleRefresh() }, "entities.extract", "find-entities", chapters, async (chapter, signal) => {
			const r = await extractChapter(vault, book, chapter, { client, model, signal, diagnostics: this.host.diagnostics, now, sleep, random: platformRandom });
			if (r.kind === "discarded-stale") return { state: "discarded", message: `${chapter.designation} changed while it was being read; nothing was recorded.` };
			const parts = [`${r.created.length} new${r.created.length ? ` (${r.created.join(", ")})` : ""}`, `${r.matched} already known`, r.ungrounded ? `${r.ungrounded} left out because the quote was not in the text` : "", ...r.notes].filter((x) => x !== "");
			return { state: "done", message: parts.join("; ") };
		});
		await rebuildHistories(vault, book, readingOrder(chapters));
		new Notice(`Read ${job.items.filter((i) => i.state === "done").length} of ${job.items.length} chapters.`, 8000);
		this.markDirty();
	}

	private async startProofreading(vault: GuardedVault, book: Book, chapters: Chapter[], base: string, model: string): Promise<void> {
		const client = new OllamaClient(this.host.network, base);
		const now = () => new Date().toISOString();
		const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
		const prompt = defaultProofreadPrompt();
		const job = await this.runner.runChapterJob({ vault, book, random: platformRandom, now, onChange: () => this.scheduleRefresh() }, "proofread", "proofread-chapters", chapters, async (chapter, signal) => {
			const r = await proofreadChapter(vault, book, chapter, { client, model, prompt, signal, diagnostics: this.host.diagnostics, now, sleep, random: platformRandom });
			if (r.stale) return { state: "discarded", message: `${chapter.designation} changed while it was being proofread; nothing was recorded.` };
			const parts = [`${r.proposed} paragraph${r.proposed === 1 ? "" : "s"} with suggestions`, `${r.unchanged} unchanged`, r.skippedReviewed ? `${r.skippedReviewed} already reviewed` : "", ...r.failed.map((f) => `skipped: ${f}`)].filter((x) => x !== "");
			return { state: "done", message: parts.join("; ") };
		});
		new Notice(`Proofread ${job.items.filter((i) => i.state === "done").length} of ${job.items.length} chapters.`, 8000);
		this.markDirty();
	}

	private actions(allChapters: Chapter[]): OverviewActions {
		return { registerFolder: () => registerActiveFolder(this.app), forBook: (book) => this.bookActions(book, allChapters.filter((c) => c.bookId === book.id)) };
	}

	private bookActions(book: Book, chapters: Chapter[]): BookActions {
		const vault = createGuardedVault(this.app);
		const fail = (e: unknown) => new Notice(e instanceof Error ? e.message : String(e), 8000);
		const run = (work: Promise<unknown>) => void work.then(() => this.markDirty(), fail);
		const aliasOptions = (e: Entity) => e.aliases.map((a) => ({ value: a, label: a }));
		const entities = async () => (await listAllEntities(vault, book)).entities;
		const withEntity = async (id: string, fn: (all: Entity[], e: Entity) => Promise<unknown>) => {
			const all = await entities();
			const e = all.find((x) => x.id === id);
			if (!e) throw new Error("That entity no longer exists.");
			return fn(all, e);
		};
		const find = (id: string): Chapter => chapters.find((c) => c.id === id) as Chapter;
		return {
			openNote: (path) => {
				const f = this.app.vault.getAbstractFileByPath(path);
				if (f instanceof TFile) void this.app.workspace.getLeaf(false).openFile(f);
			},
			setStatus: (id: string, status: ChapterStatus) => run(setStatus(vault, book, find(id), status)),
			move: (id, direction) => {
				const order = orderToMove(readingOrder(chapters), id, direction);
				if (order === null) new Notice("These chapters share an order value. Resolve that first.", 8000);
				else run(setOrder(vault, book, find(id), order));
			},
			rename: (id, current) => new PromptModal(this.app, "Rename chapter", "Designation", current, (v) => run(setDesignation(vault, book, chapters, find(id), v))).open(),
			unbind: (id) => run(bindNote(vault, book, chapters, find(id), null)),
			promoteActive: (path) => new PromptModal(this.app, "Make this note a chapter", "Designation", "", (v) => run(addChapter(vault, book, chapters, { designation: v, notePath: path }, platformRandom))).open(),
			updateStats: () => {
				if (this.runner.hasRunningJob(book.id)) {
					new Notice("A word count is already running for this book.", 8000);
					return;
				}
				void this.runner.runWordCounts({ vault, book, random: platformRandom, now: () => new Date().toISOString(), onChange: () => this.scheduleRefresh() }, chapters).then(
					(job) => {
						const failed = job.items.filter((i) => i.state === "failed").length;
						new Notice(`Counted ${job.items.filter((i) => i.state === "done").length} of ${job.items.length} chapters${failed ? `; ${failed} failed` : ""}.`, 8000);
						this.markDirty();
					},
					fail,
				);
			},
			summarize: () => {
				const ready = this.readyToSend(book, chapters);
				if (ready === null) return;
				const { base, device, targets } = ready;
				new ConfirmModal(
					this.app,
					"Summarize chapters",
					[
						`The text of ${targets.length} chapter${targets.length === 1 ? "" : "s"} will be sent to ${base} using the model "${device.generationModel}".`,
						"Each summary is saved as a separate note. Your chapters are not changed.",
						"You can cancel while it runs.",
					],
					"Summarize",
					() => void this.startSummaries(vault, book, targets, base, device.generationModel).catch(fail),
				).open();
			},
			proofread: () => {
				const ready = this.readyToSend(book, chapters);
				if (ready === null) return;
				const { base, device, targets } = ready;
				new ConfirmModal(
					this.app,
					"Proofread chapters",
					[
						`Each paragraph of ${targets.length} chapter${targets.length === 1 ? "" : "s"} that has not been reviewed yet will be sent, one at a time, to ${base} using the model "${device.generationModel}".`,
						"Corrections are suggestions only. Your chapters change only when you accept a change and apply it. A paragraph the model cannot handle safely is left as written.",
						"You can cancel while it runs.",
					],
					"Proofread",
					() => void this.startProofreading(vault, book, targets, base, device.generationModel).catch(fail),
				).open();
			},
			decideEdits: (proposalId, editIds, decision) => run(decideEdits(vault, book, chapters, proposalId, editIds, decision)),
			applyProposal: (proposalId) => run(applyProposalById(vault, book, chapters, proposalId).then(announceApplied)),
			addEntity: () =>
				new PickModal(this.app, "Add an entity", ENTITY_TYPES.map((t) => ({ value: t, label: t })), "Name", "Add", (type, name) => run(entities().then((all) => createEntity(vault, book, all, { type, name }, platformRandom)))).open(),
			renameEntity: (id, current) => new PromptModal(this.app, "Rename", "Name (the old name stays as an alias)", current, (v) => run(withEntity(id, (all, e) => renameEntity(vault, all, e, v)))).open(),
			addAlias: (id) => new PromptModal(this.app, "Add another name", "Alias", "", (v) => run(withEntity(id, (all, e) => addAlias(vault, all, e, v)))).open(),
			mergeEntity: (id) =>
				run(
					withEntity(id, (all, e) => {
						const targets = activeEntities(all).filter((t) => t.id !== e.id && t.type === e.type);
						if (targets.length === 0) throw new Error(`There is no other ${e.type} to merge ${e.name} into.`);
						new PickModal(this.app, `Merge ${e.name} into…`, targets.map((t) => ({ value: t.id, label: t.name })), null, "Merge", (targetId) => run(mergeEntities(vault, e, targets.find((t) => t.id === targetId) as Entity))).open();
						return Promise.resolve();
					}),
				),
			extractEntities: () => {
				const ready = this.readyToSend(book, chapters);
				if (ready === null) return;
				const { base, device, targets } = ready;
				new ConfirmModal(
					this.app,
					"Find characters, places and objects",
					[
						`The text of ${targets.length} chapter${targets.length === 1 ? "" : "s"} will be sent to ${base} using the model "${device.generationModel}", once for each of ${EXTRACTED_KINDS.length} kinds (${EXTRACTED_KINDS.join(", ")}).`,
						"New entries are added to your entity list. Names you already have are matched exactly and never changed. Your chapters are not changed.",
						"You can cancel while it runs.",
					],
					"Find",
					() => void this.startExtraction(vault, book, targets, base, device.generationModel).catch(fail),
				).open();
			},
			mergeDuplicate: (fromId, intoId) => run(withEntity(fromId, (all, from) => mergeEntities(vault, from, all.find((e) => e.id === intoId) as Entity))),
			keepDistinct: (aId, bId) => run(withEntity(aId, (all, a) => markDistinct(vault, a, all.find((e) => e.id === bId) as Entity))),
			removeAlias: (id) =>
				run(
					withEntity(id, (_all, e) => {
						new PickModal(this.app, `Remove a name of ${e.name}`, aliasOptions(e), null, "Remove", (alias) => run(removeAlias(vault, e, alias))).open();
						return Promise.resolve();
					}),
				),
			splitEntity: (id) =>
				run(
					withEntity(id, (all, e) => {
						new PickModal(this.app, `Move a name of ${e.name} to a new ${e.type}`, aliasOptions(e), "New name", "Split", (alias, name) => run(splitEntity(vault, book, all, e, { name: name || alias, aliases: [alias] }, platformRandom))).open();
						return Promise.resolve();
					}),
				),
			archiveEntity: (id) => run(withEntity(id, (_all, e) => archiveEntity(vault, e))),
			cancelJob: (id) => this.runner.cancel(id),
			dismissJob: (id) =>
				run(
					listJobs(vault, book).then(({ jobs }) => {
						const job = jobs.find((j) => j.id === id);
						if (!job) throw new Error("That job record no longer exists.");
						return dismissJob(vault, book, job.state === "running" ? { ...job, state: "interrupted" } : job);
					}),
				),
			addTodo: () => new PromptModal(this.app, "Add a to-do", "To do", "", (v) => run(addManualTodo(vault, book, v))).open(),
			completeTodo: (id) => run(setManualTodoDone(vault, book, id, true)),
			planChapter: () => new PromptModal(this.app, "Plan a chapter", "Designation", "", (v) => run(addChapter(vault, book, chapters, { designation: v }, platformRandom))).open(),
		};
	}
}
