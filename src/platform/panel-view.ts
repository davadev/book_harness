import { ItemView, MarkdownView, Notice, TFile, type WorkspaceLeaf } from "obsidian";
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
import type { IndexStorePort } from "../core/embeddings";
import type { PassageContext } from "../core/graph";
import type { BookSearch, SearchOutcome, SearchResult } from "../core/search";
import { revisionOf } from "../core/revision";
import { entitiesForChapter } from "../core/occurrences";
import { loadPrompt, summarizeChapter, summaryStatus } from "../core/summary";
import type { BookHarnessSettings } from "../settings/defaults";
import { ConfirmModal } from "./confirm-modal";
import { PickModal } from "./pick-modal";
import { chapterStats, type ChapterStats } from "../core/task-state";
import { renderOverview, type BookActions, type OverviewActions } from "../ui/overview";
import { createGuardedVault } from "./guarded-vault";
import type { GuardedVault } from "../core/guarded-vault";
import type { StoredConstraint, TimelineEvent } from "../core/temporal/timeline";
import { addAfterBy, addBefore, addDate, addEvent, addSimultaneous, buildTimeline, loadTimeline, parseCivil, retireConstraint, retireEvent } from "../core/temporal/timeline";
import { buildEpub } from "../core/publishing/epub";
import { blocksExport, planExport } from "../core/publishing/validate";
import { exportFileName, writeExport } from "./export-writer";
import { analyzeBook, type BookStatistics, type Occurrence } from "../core/stats/statistics";
import { askBook, chronologyText, gatherEvidence, type AskResult, type Citation } from "../core/agent/ask";
import { loadTranslationOverview, type LanguageOverview } from "../core/translation/overview";
import { loadGlossary, syncTranslation, type Resolution } from "../core/translation/translate";
import { PromptModal } from "./prompt-modal";
import { platformRandom } from "./random";
import { sleep } from "./sleep";
import { registerActiveFolder } from "./register-book";

/** What the panel needs from the plugin: current settings, the network, and the run log. */
export interface PanelHost {
	settings: BookHarnessSettings;
	network: NetworkPort;
	diagnostics: DiagnosticsLog;
	selectedEntity: string | null;
	clearSelectedEntity(): void;
	search: BookSearch;
	indexStore: IndexStorePort;
}

/** Tell the author what applying did, in plain words. */
export function announceApplied(result: { applied: number; conflicts: string[] }): void {
	new Notice(`Applied ${result.applied} change${result.applied === 1 ? "" : "s"}.${result.conflicts.length ? ` ${result.conflicts.length} could not be placed because the text changed; they were left for you.` : ""}`, 8000);
}

export const PANEL_VIEW_TYPE = "book-harness-panel";

export class BookHarnessView extends ItemView {
	private dirty = true;
	private drawing = false;
	private lastSearch: SearchOutcome | null = null;
	/** Statistics the author asked to see, with the book they belong to. Cleared when another book is shown. */
	private statistics: { bookId: string; data: BookStatistics } | null = null;
	private useMeaning = false;
	/** Questions asked of each book in this session, newest first; not saved anywhere. */
	private readonly asked = new Map<string, AskResult[]>();
	private asking: string | null = null;
	private readonly askDisclosed = new Set<string>();
	private readonly contexts = new Map<string, PassageContext>();
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
			const selected = book && this.host.selectedEntity ? entitiesForChapter(entityData.entities, [this.host.selectedEntity])[0] ?? null : null;
			const device = this.host.settings.device;
			const embedding = normalizeEndpoint(device.endpoint) !== null && device.embeddingModel !== "" ? { base: normalizeEndpoint(device.endpoint) as string, model: device.embeddingModel } : null;
			const meaningStatus = book && embedding ? await this.host.search.meaningStatus(vault, book, shown, this.host.indexStore, embedding.model) : null;
			const manual = book ? await listManualTodos(vault, book) : [];
			const jobs = book ? await listJobs(vault, book) : { jobs: [], problems: [] };
			problems.push(...jobs.problems);
			const translations = book ? await loadTranslationOverview(vault, book, shown) : [];
			const timeline = book ? await loadTimeline(vault, book) : null;
			if (timeline) problems.push(...timeline.problems);
			const overview = book ? buildOverview(book, shown, active, (p) => vault.exists(p), stats, presentJobs(jobs.jobs, this.runner), findConflictCopies(book, vault.markdownPaths()), manual, summaries, proposals.proposals, coverage, activeEntities(entityData.entities), unsupported, selected, this.lastSearch, { available: embedding !== null, enabled: this.useMeaning, status: meaningStatus }, this.contexts, timeline && timeline.events.length > 0 ? buildTimeline(timeline.events, timeline.constraints, shown) : null, this.statistics && this.statistics.bookId === book.id ? this.statistics.data : null, { history: this.asked.get(book.id) ?? [], pending: this.asking }, translations) : null;
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
	private readyToSend(book: Book, chapters: Chapter[], model: "generationModel" | "embeddingModel" = "generationModel"): { base: string; device: BookHarnessSettings["device"]; targets: Chapter[] } | null {
		const device = this.host.settings.device;
		const base = normalizeEndpoint(device.endpoint);
		if (base === null || device[model] === "") {
			new Notice(`Set the server address and the ${model === "generationModel" ? "generation" : "embedding"} model in the Book Harness settings first.`, 8000);
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
		const job = await this.runner.runChapterJob({ vault, book, random: platformRandom, now, onChange: () => this.scheduleRefresh() }, "chapter.summary", "summarize-chapters", chapters, async (chapter, signal) => {
			const r = await summarizeChapter(vault, book, chapter, { client, model, prompt, signal, diagnostics: this.host.diagnostics, now, sleep });
			return r.kind === "saved" ? { state: "done", message: r.issues.length ? `Saved, but: ${r.issues.join(" ")}` : undefined } : { state: "discarded", message: r.reason };
		});
		new Notice(`Summarized ${job.items.filter((i) => i.state === "done").length} of ${job.items.length} chapters.`, 8000);
		this.markDirty();
	}

	/** Embedding endpoint and model, or null when they are not set up. */
	private semantic(): { client: OllamaClient; model: string; store: IndexStorePort } | null {
		const device = this.host.settings.device;
		const base = normalizeEndpoint(device.endpoint);
		return base !== null && device.embeddingModel !== "" ? { client: new OllamaClient(this.host.network, base), model: device.embeddingModel, store: this.host.indexStore } : null;
	}

	private async startEmbedding(vault: GuardedVault, book: Book, all: Chapter[], targets: Chapter[], semantic: { client: OllamaClient; model: string; store: IndexStorePort }): Promise<void> {
		const now = () => new Date().toISOString();
		const job = await this.runner.runChapterJob({ vault, book, random: platformRandom, now, onChange: () => this.scheduleRefresh() }, "embeddings.build", "build-meaning-index", targets, async (chapter, signal) => {
			const added = await this.host.search.buildChapterVectors(vault, book, all, chapter, semantic, signal);
			return { state: "done", message: added === 0 ? "Already up to date." : `${added} passage${added === 1 ? "" : "s"} embedded.` };
		});
		new Notice(`Indexed ${job.items.filter((i) => i.state === "done").length} of ${job.items.length} chapters.`, 8000);
		this.markDirty();
	}

	private async openPassage(r: SearchResult): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(r.notePath);
		if (!(file instanceof TFile)) return;
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		const view = leaf.view;
		if (!(view instanceof MarkdownView)) return;
		const text = view.editor.getValue();
		if (revisionOf(text) !== r.ref.sourceRevision) {
			new Notice("This chapter changed since the search. Search again to jump to the exact place.", 8000);
			return;
		}
		const from = view.editor.offsetToPos(r.ref.start);
		const to = view.editor.offsetToPos(r.ref.end);
		view.editor.setSelection(from, to);
		view.editor.scrollIntoView({ from, to }, true);
	}

	private async openOccurrence(chapters: readonly Chapter[], o: Occurrence, word: string): Promise<void> {
		const path = (chapters.find((c) => c.id === o.chapterId) as Chapter).notePath;
		const file = path === null ? null : this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return void new Notice("That chapter has no note to open.");
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		const view = leaf.view;
		if (!(view instanceof MarkdownView)) return;
		if (view.editor.getValue().slice(o.start, o.end).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() !== word) {
			new Notice("This chapter changed since the statistics were counted. Show the statistics again to refresh them.", 8000);
			return;
		}
		const from = view.editor.offsetToPos(o.start);
		const to = view.editor.offsetToPos(o.end);
		view.editor.setSelection(from, to);
		view.editor.scrollIntoView({ from, to }, true);
	}

	private async startTranslation(vault: GuardedVault, book: Book, targets: Chapter[], language: string, base: string, model: string, resolutions: Readonly<Record<string, Resolution>> = {}): Promise<void> {
		const client = new OllamaClient(this.host.network, base);
		const now = () => new Date().toISOString();
		const glossary = await loadGlossary(vault, book, language);
		const job = await this.runner.runChapterJob({ vault, book, random: platformRandom, now, onChange: () => this.scheduleRefresh() }, "translation.sync", `translate-${language}`, targets, async (chapter, signal) => {
			const r = await syncTranslation(vault, book, chapter, language, { model: { client, model, signal, diagnostics: this.host.diagnostics, now, sleep }, random: platformRandom, glossary }, resolutions);
			const parts = [`${r.translated} translated`, `${r.kept} kept`, `${r.dropped} removed`, `${r.conflicts} waiting for your decision`, ...r.failed, ...r.issues];
			return { state: "done", message: parts.join("; ") };
		});
		new Notice(`Translation: ${job.items.filter((i) => i.state === "done").length} of ${job.items.length} chapters done.`, 8000);
		this.markDirty();
	}

	private async startExtraction(vault: GuardedVault, book: Book, chapters: Chapter[], base: string, model: string): Promise<void> {
		const client = new OllamaClient(this.host.network, base);
		const now = () => new Date().toISOString();
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
			search: (query, meaning) => {
				if (query.trim() === "") {
					new Notice("Type a word or phrase to search for.", 8000);
					return;
				}
				this.useMeaning = meaning;
				this.contexts.clear();
				const semantic = meaning ? this.semantic() : null;
				run(
					this.host.search.search(vault, book, chapters, query, 20, semantic).then((outcome) => {
						this.lastSearch = outcome;
					}),
				);
			},
			buildMeaning: () => {
				const ready = this.readyToSend(book, chapters, "embeddingModel");
				const semantic = this.semantic();
				if (ready === null || semantic === null) return;
				new ConfirmModal(
					this.app,
					"Build the meaning index",
					[
						`The text of ${ready.targets.length} chapter${ready.targets.length === 1 ? "" : "s"} will be sent in passages to ${ready.base} using the embedding model "${this.host.settings.device.embeddingModel}". Only passages that are new or changed since the last build are sent.`,
						"The result is stored on this device only, is not part of your book, and can be deleted at any time. Your chapters are not changed.",
						"You can cancel while it runs.",
					],
					"Build",
					() => void this.startEmbedding(vault, book, chapters, ready.targets, semantic).catch(fail),
				).open();
			},
			openPassage: (result) => void this.openPassage(result),
			showContext: (result) =>
				run(
					this.host.search.context(vault, book, chapters, result.ref).then((context) => {
						this.contexts.set(`${result.ref.chapterId}:${result.ref.passageId}`, context);
					}),
				),
			closeEntity: () => {
				this.host.clearSelectedEntity();
				this.markDirty();
			},
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
			ask: (question) => {
				const q = question.trim();
				if (q === "") return void new Notice("Type a question first.", 8000);
				if (this.asking !== null) return void new Notice("Still answering the last question.", 8000);
				const device = this.host.settings.device;
				const base = normalizeEndpoint(device.endpoint);
				if (base === null || device.generationModel === "") return void new Notice("Set the server address and the generation model in the Book Harness settings first.", 8000);
				const run1 = () => {
					this.asking = q;
					this.markDirty();
					void (async () => {
						const semantic = this.useMeaning ? this.semantic() : null;
						const { evidence } = await gatherEvidence(vault, book, chapters, this.host.search, q, semantic);
						const t = await loadTimeline(vault, book);
						const chronology = t.events.length > 0 ? chronologyText(buildTimeline(t.events, t.constraints, chapters)) : null;
						const now = () => new Date().toISOString();
						const result = await askBook({ client: new OllamaClient(this.host.network, base), model: device.generationModel, diagnostics: this.host.diagnostics, now, sleep }, q, evidence, chronology);
						this.asked.set(book.id, [result, ...(this.asked.get(book.id) ?? [])].slice(0, 10));
					})().catch(fail).finally(() => {
						this.asking = null;
						this.markDirty();
					});
				};
				if (this.askDisclosed.has(book.id)) return run1();
				new ConfirmModal(this.app, "Ask the book", [`Your question and up to 8 short passages from your chapters will be sent to ${base} using the model "${device.generationModel}" each time you ask.`, "Nothing is changed in your book. The answer is shown with quotes you can check; quotes that are not in the text are removed.", "This confirmation is shown once for this book until you restart Obsidian."], "Ask", () => {
					this.askDisclosed.add(book.id);
					run1();
				}).open();
			},
			openCitation: (c: Citation) => void this.openPassage(c.result),
			translate: (language) => {
				const ready = this.readyToSend(book, chapters);
				if (ready === null) return;
				const { base, device, targets } = ready;
				void loadTranslationOverview(vault, book, targets).then((all) => {
					const lang = all.find((l) => l.language === language) as LanguageOverview;
					const rows = lang.rows;
					const needModel = rows.filter((r) => r.toTranslate > 0).map((r) => r.chapter);
					// stale chapters with nothing to translate still need their record brought up to date (removed paragraphs, moves, decisions): no model is involved
					const bookkeeping = rows.filter((r) => r.toTranslate === 0 && r.status.state === "stale").map((r) => r.chapter);
					if (needModel.length === 0 && bookkeeping.length === 0) return void new Notice(`Nothing needs translating into ${language} right now.`, 8000);
					const quiet = async () => {
						for (const c of bookkeeping) await syncTranslation(vault, book, c, language, { model: null, random: platformRandom, glossary: [] });
					};
					if (needModel.length === 0) return run(quiet());
					new ConfirmModal(this.app, `Translate into ${lang.name}`, [`${lang.toTranslate} paragraph(s) of ${needModel.length} chapter(s) will be sent to ${base}, one at a time with the paragraphs next to it, using the model "${device.generationModel}".`, "Your chapters are not changed. Translations are saved as separate notes. A paragraph whose translation you edited is never replaced without asking you.", "You can cancel while it runs."], "Translate", () => void quiet().then(() => this.startTranslation(vault, book, needModel, language, base, device.generationModel)).catch(fail)).open();
				}, fail);
			},
			resolveConflict: (chapterId, language, conflictId, choice) => {
				const chapter = chapters.find((c) => c.id === chapterId) as Chapter;
				if (choice === "mine") {
					// recording a decision never calls the model
					return run(syncTranslation(vault, book, chapter, language, { model: null, random: platformRandom, glossary: [] }, { [conflictId]: "mine" }));
				}
				const ready = this.readyToSend(book, chapters);
				if (ready === null) return;
				new ConfirmModal(this.app, "Use a new translation", ["This replaces your own translation of this paragraph with a new one made by the model. The paragraph and its neighbours are sent to " + ready.base + ".", "Your chapter is not changed."], "Replace mine", () => void this.startTranslation(vault, book, [chapter], language, ready.base, ready.device.generationModel, { [conflictId]: "machine" }).catch(fail)).open();
			},
			toggleStatistics: () => {
				if (this.statistics?.bookId === book.id) {
					this.statistics = null;
					return this.markDirty();
				}
				run(
					(async () => {
						const items = [];
						for (const c of readingOrder(chapters)) if (c.notePath !== null && vault.exists(c.notePath)) items.push({ id: c.id, designation: c.designation, text: await vault.read(c.notePath) });
						const known = activeEntities((await listAllEntities(vault, book)).entities).flatMap((e) => [e.name, ...e.aliases]).flatMap((n) => n.split(/\s+/));
						this.statistics = { bookId: book.id, data: analyzeBook(items, { language: book.primaryLanguage, ignore: new Set(known) }) };
					})(),
				);
			},
			openOccurrence: (o, word) => void this.openOccurrence(chapters, o, word),
			exportEpub: () =>
				void (async () => {
					const items = await Promise.all(readingOrder(chapters).map(async (chapter) => ({ chapter, text: chapter.notePath !== null && vault.exists(chapter.notePath) ? await vault.read(chapter.notePath) : null })));
					const open = new Set((await listProposals(vault, book)).proposals.filter((p) => p.edits.some((e) => e.decision !== "rejected" && e.decision !== "applied")).map((p) => p.chapterId));
					const plan = planExport(book, items, open);
					const blocked = blocksExport(plan);
					const lines = [
						`${plan.included.length} chapter${plan.included.length === 1 ? "" : "s"} will be in the book${plan.omitted.length > 0 ? `; ${plan.omitted.length} will be left out` : ""}. No AI is used, and your chapters are not changed.`,
						...plan.issues.map((i) => `${i.severity === "error" ? "Problem" : "Note"}: ${i.message}`),
						blocked ? "Fix these, or export as a draft with what exists. A draft is saved with a different file name so it is not mistaken for the finished book." : "",
					].filter((l) => l !== "");
					const stamp = new Date().toISOString();
					new ConfirmModal(this.app, blocked ? "This book is not ready to export" : "Export as EPUB", lines, blocked ? "Export as draft" : "Export", () =>
						run(
							writeExport(this.app, book.folder, exportFileName(book.title, stamp, blocked), buildEpub(book, plan.included, { modified: `${stamp.slice(0, 19)}Z` })).then((path) => {
								new Notice(`Saved ${path}${blocked ? ` (draft; left out: ${plan.omitted.map((o) => o.chapter.designation).join(", ") || "nothing"})` : ""}`);
							}),
						),
					).open();
				})().catch(fail),
			addEvent: () =>
				new PickModal(this.app, "Add an event", [{ value: "", label: "(not in a chapter yet)" }, ...readingOrder(chapters).map((c) => ({ value: c.id, label: c.designation }))], "What happens", "Add", (chapterId, label) =>
					run(loadTimeline(vault, book).then((t) => addEvent(vault, book, t.events, label, chapterId === "" ? null : chapterId, platformRandom))),
				).open(),
			addTimeRelation: () =>
				void loadTimeline(vault, book).then((t) => {
					const events = t.events.filter((e) => !e.retired);
					if (events.length === 0) return void new Notice("Add an event first.");
					const options = events.map((e) => ({ value: e.id, label: e.label })).sort((x, y) => x.label.localeCompare(y.label));
					const find = (id: string) => events.find((e) => e.id === id) as TimelineEvent;
					const kinds = [
						{ value: "before", label: "One event happens before another" },
						{ value: "after", label: "One event happens a set time after another" },
						{ value: "same", label: "Two events happen at the same time" },
						{ value: "date", label: "An event has a date" },
					];
					new PickModal(this.app, "Add a time relation", kinds, null, "Next", (kind) => {
						if (kind === "date") return new PickModal(this.app, "Which event has a date?", options, "Date (1923, 1923-10 or 1923-10-31)", "Add", (id, text) => run(Promise.resolve().then(() => addDate(vault, book, find(id), parseCivil(text), platformRandom)))).open();
						const first = kind === "before" ? "Which event happens first?" : kind === "after" ? "Which event comes first?" : "First event";
						new PickModal(this.app, first, options, kind === "after" ? "How long after (for example 3 days)" : null, "Next", (a, duration) =>
							new PickModal(this.app, kind === "before" ? "Which happens later?" : kind === "after" ? "Which happens after it?" : "Second event", options, null, "Add", (b) =>
								run(kind === "before" ? addBefore(vault, book, find(a), find(b), platformRandom) : kind === "after" ? addAfterBy(vault, book, find(a), find(b), duration, platformRandom) : addSimultaneous(vault, book, find(a), find(b), platformRandom)),
							).open(),
						).open();
					}).open();
				}, fail),
			removeStatement: (id) => run(loadTimeline(vault, book).then((t) => retireConstraint(vault, book, t.constraints.find((c) => c.id === id) as StoredConstraint))),
			removeEvent: (id) => run(loadTimeline(vault, book).then((t) => retireEvent(vault, book, t.events.find((e) => e.id === id) as TimelineEvent))),
			completeTodo: (id) => run(setManualTodoDone(vault, book, id, true)),
			planChapter: () => new PromptModal(this.app, "Plan a chapter", "Designation", "", (v) => run(addChapter(vault, book, chapters, { designation: v }, platformRandom))).open(),
		};
	}
}
