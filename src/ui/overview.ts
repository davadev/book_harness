import type { TranslationRow } from "../core/translation/overview";
import type { AskResult, Citation } from "../core/agent/ask";
import type { BookStatistics, Occurrence, WordRow } from "../core/stats/statistics";
import type { TimelineRow, TimelineView } from "../core/temporal/timeline";
import { CHAPTER_STATUSES, type ChapterStatus } from "../core/status";
import type { Book } from "../core/books";
import type { Entity } from "../core/entities";
import type { IndexStatus } from "../core/embeddings";
import type { PassageContext } from "../core/graph";
import type { SearchResult } from "../core/search";
import type { Overview, PanelContext } from "../core/panel-model";
import type { JobRecord } from "../core/jobs";
import type { ChapterStats } from "../core/task-state";

/** Everything the overview can ask the platform to do. Each is an explicit author action. */
export interface BookActions {
	openNote(path: string): void;
	setStatus(chapterId: string, status: ChapterStatus): void;
	move(chapterId: string, direction: "up" | "down"): void;
	rename(chapterId: string, designation: string): void;
	unbind(chapterId: string): void;
	promoteActive(path: string): void;
	planChapter(): void;
	updateStats(): void;
	summarize(): void;
	proofread(): void;
	decideEdits(proposalId: string, editIds: string[], decision: "accepted" | "rejected"): void;
	applyProposal(proposalId: string): void;
	extractEntities(): void;
	mergeDuplicate(fromId: string, intoId: string): void;
	keepDistinct(aId: string, bId: string): void;
	closeEntity(): void;
	search(query: string, meaning: boolean): void;
	buildMeaning(): void;
	openPassage(result: SearchResult): void;
	showContext(result: SearchResult): void;
	addEntity(): void;
	renameEntity(id: string, current: string): void;
	addAlias(id: string): void;
	mergeEntity(id: string): void;
	removeAlias(id: string): void;
	splitEntity(id: string): void;
	archiveEntity(id: string): void;
	addTodo(): void;
	addEvent(): void;
	exportEpub(): void;
	toggleStatistics(): void;
	translate(language: string): void;
	resolveConflict(chapterId: string, language: string, conflictId: string, choice: "mine" | "machine"): void;
	ask(question: string): void;
	openCitation(c: Citation): void;
	openOccurrence(o: Occurrence, word: string): void;
	addTimeRelation(): void;
	removeStatement(id: string): void;
	removeEvent(id: string): void;
	completeTodo(manualId: string): void;
	cancelJob(jobId: string): void;
	dismissJob(jobId: string): void;
}

export interface OverviewActions {
	registerFolder(): void;
	/** Actions that need a book; only requested once a book is in context. */
	forBook(book: Book): BookActions;
}

const STATUS_LABEL: Record<ChapterStatus, string> = {
	planned: "Planned",
	drafting: "Drafting",
	written: "Written",
	revising: "Revising",
	finalized: "Finalized",
};

const JOB_LABEL: Record<JobRecord["state"], string> = {
	running: "Running",
	completed: "Finished",
	canceled: "Canceled",
	interrupted: "Interrupted",
	dismissed: "",
};

const KIND_LABEL: Record<JobRecord["kind"], string> = { "stats.words": "Word count", "chapter.summary": "Chapter summaries", proofread: "Proofreading", "entities.extract": "Finding entities", "embeddings.build": "Meaning index", "translation.sync": "Translation" };

function renderJob(root: HTMLElement, job: JobRecord, actions: BookActions): void {
	const box = root.createDiv({ cls: "bh-job" });
	const done = job.items.filter((i) => i.state === "done").length;
	box.createEl("strong", { text: `${KIND_LABEL[job.kind]} ${JOB_LABEL[job.state].toLowerCase()}: ${done} of ${job.items.length} chapters` });
	if (job.state === "interrupted") box.createDiv({ cls: "bh-note", text: "The app closed before it finished. Nothing was restarted; run it again if you want the rest." });
	for (const item of job.items.filter((i) => i.message && i.state !== "pending")) box.createDiv({ cls: "bh-note", text: `${item.designation}: ${item.message}` });
	const label = job.state === "running" ? "Cancel" : "Dismiss";
	box.createEl("button", { cls: "bh-button", text: label }).addEventListener("click", () => (job.state === "running" ? actions.cancelJob(job.id) : actions.dismissJob(job.id)));
}

const MEANING_STATE: Record<IndexStatus["state"], string> = {
	missing: "not built yet",
	current: "up to date",
	partial: "out of date",
	incompatible: "built with another model",
};

function renderSearch(root: HTMLElement, overview: Overview, actions: BookActions): void {
	const box = root.createDiv({ cls: "bh-search" });
	const form = box.createDiv({ cls: "bh-actions" });
	const input = form.createEl("input", { cls: "bh-input", type: "search", placeholder: "Search this book", attr: { "aria-label": "Search this book" } });
	input.value = overview.search?.query ?? "";
	let box2: HTMLInputElement | null = null;
	if (overview.meaning.available) {
		const label = box.createEl("label", { cls: "bh-note" });
		box2 = label.createEl("input", { type: "checkbox", attr: { "aria-label": "Also search by meaning" } });
		box2.checked = overview.meaning.enabled;
		label.createSpan({ text: " Also search by meaning (sends your query to your model server)" });
	}
	const go = () => actions.search(input.value, box2?.checked ?? false);
	form.createEl("button", { cls: "bh-button", text: "Search" }).addEventListener("click", go);
	// Searching happens on Enter or the button, never on every keystroke: the field keeps focus and the phone keyboard stays open.
	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter") go();
	});
	if (overview.meaning.available && overview.meaning.status) {
		const st = overview.meaning.status;
		const line = box.createDiv({ cls: "bh-note", text: `Meaning index: ${MEANING_STATE[st.state]} (${st.indexed} of ${st.total} passages).` });
		line.createEl("button", { cls: "bh-link", text: st.state === "current" ? "Rebuild" : "Build or update" }).addEventListener("click", () => actions.buildMeaning());
	}
	const s = overview.search;
	if (!s) return;
	box.createDiv({ cls: "bh-note", text: `Keyword search over ${s.passagesIndexed} passages in ${s.chaptersIndexed} chapter${s.chaptersIndexed === 1 ? "" : "s"}, up to date with your notes.${s.missingChapters.length ? ` Not searched, no note yet: ${s.missingChapters.join(", ")}.` : ""}` });
	if (s.meaning.requested) box.createDiv({ cls: "bh-note", text: s.meaning.used ? `Meaning results are included.${s.meaning.note ? ` ${s.meaning.note}` : ""}` : s.meaning.note ?? "" });
	if (s.results.length === 0) box.createDiv({ cls: "bh-empty", text: `Nothing found for “${s.query}”. Words are matched exactly as written; this does not mean the idea is absent from the book.` });
	for (const r of s.results) {
		const row = box.createDiv({ cls: "bh-result" });
		row.createEl("button", { cls: "bh-link", text: r.chapter }).addEventListener("click", () => actions.openPassage(r));
		const how = r.channels.keyword !== null && r.channels.meaning !== null ? "keyword and meaning" : r.channels.meaning !== null ? "meaning" : "keyword";
		row.createSpan({ cls: "bh-badge", text: how });
		row.createDiv({ cls: "bh-note", text: r.snippet });
		if (r.entities.length > 0) row.createDiv({ cls: "bh-note", text: `Mentions: ${r.entities.join(", ")}` });
		const context = overview.contexts.get(`${r.ref.chapterId}:${r.ref.passageId}`);
		if (!context) row.createEl("button", { cls: "bh-link", text: "Show context" }).addEventListener("click", () => actions.showContext(r));
		else renderContext(row, context);
	}
}

function translationLine(r: TranslationRow): string {
	const s = r.status;
	if (s.state === "no-source") return "no chapter note to translate";
	if (s.state === "missing") return `not translated yet (${r.toTranslate} paragraph${r.toTranslate === 1 ? "" : "s"})`;
	if (s.state === "current") return "up to date";
	if (s.state === "conflicts") return `waiting for your decision (${s.conflicts})`;
	if (s.state === "broken") return `cannot be read: ${s.problem as string}`;
	const c = (s.plan as NonNullable<typeof s.plan>).counts;
	const parts = [c.retranslate > 0 ? `${c.retranslate} changed` : "", c.translate > 0 ? `${c.translate} new` : "", c.dropped > 0 ? `${c.dropped} removed` : "", c.conflict > 0 ? `${c.conflict} need your decision` : ""].filter((x) => x !== "");
	return `out of date: the chapter changed since it was translated${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

function renderTranslations(root: HTMLElement, overview: Overview, actions: BookActions): void {
	const box = root.createDiv({ cls: "bh-translations" });
	box.createEl("h4", { text: "Translations" });
	box.createDiv({ cls: "bh-note", text: "A translation is a separate note. Your own chapter is never changed. Updates translate only the paragraphs that changed, and never overwrite a paragraph you edited without asking." });
	for (const lang of overview.translations) {
		box.createEl("h5", { text: `${lang.name} (${lang.language})` });
		const go = box.createEl("button", { cls: "bh-button", text: lang.toTranslate > 0 ? `Translate or update ${lang.name} (${lang.toTranslate} paragraph${lang.toTranslate === 1 ? "" : "s"})` : `Check ${lang.name}` });
		go.addEventListener("click", () => actions.translate(lang.language));
		const list = box.createEl("ul");
		for (const r of lang.rows) {
			const li = list.createEl("li");
			li.createSpan({ text: `${r.chapter.designation}: ${translationLine(r)}` });
			for (const c of r.conflicts) {
				const item = li.createDiv({ cls: "bh-callout" });
				item.createDiv({ text: c.reason });
				item.createDiv({ cls: "bh-note", text: `The source now: ${c.sourceNow.join(" ")}` });
				if (c.target !== null) item.createDiv({ cls: "bh-note", text: `Your translation: ${c.target}` });
				const row = item.createDiv({ cls: "bh-actions" });
				if (c.kind === "edited-and-changed") row.createEl("button", { cls: "bh-button", text: "Keep mine", attr: { "aria-label": `Keep my translation of this paragraph in ${r.chapter.designation}` } }).addEventListener("click", () => actions.resolveConflict(r.chapter.id, lang.language, c.id, "mine"));
				row.createEl("button", { cls: "bh-button", text: c.kind === "edited-and-changed" ? "Use a new translation" : "Translate it", attr: { "aria-label": `Translate this paragraph again in ${r.chapter.designation}${c.kind === "edited-and-changed" ? "; this replaces my text" : ""}` } }).addEventListener("click", () => actions.resolveConflict(r.chapter.id, lang.language, c.id, "machine"));
			}
		}
	}
}

const ASK_STATUS: Record<AskResult["status"], string> = { answered: "Answered from the excerpts", partly: "Only partly answered", not_in_excerpts: "Not answered: the excerpts do not say" };

function renderAsk(root: HTMLElement, ask: Overview["ask"], actions: BookActions): void {
	const box = root.createDiv({ cls: "bh-ask" });
	box.createEl("h4", { text: "Ask the book" });
	const form = box.createDiv({ cls: "bh-actions" });
	const input = form.createEl("input", { cls: "bh-input", type: "text", placeholder: "Ask a question about your book", attr: { "aria-label": "Ask a question about your book" } });
	const go = () => actions.ask(input.value);
	form.createEl("button", { cls: "bh-button", text: "Ask" }).addEventListener("click", go);
	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter") go();
	});
	box.createDiv({ cls: "bh-note", text: "Your question and a few passages found in your chapters are sent to your model server. The answer can be wrong: read the quotes. Nothing is changed in your book." });
	if (ask.pending !== null) box.createDiv({ cls: "bh-note", text: `Asking: ${ask.pending}` });
	for (const a of ask.history) {
		const item = box.createDiv({ cls: "bh-answer" });
		item.createEl("strong", { text: a.question });
		item.createSpan({ cls: "bh-badge", text: ASK_STATUS[a.status] });
		item.createDiv({ text: a.answer });
		for (const c of a.citations) {
			const row = item.createDiv({ cls: "bh-note" });
			row.createEl("button", { cls: "bh-link", text: c.chapter }).addEventListener("click", () => actions.openCitation(c));
			row.createSpan({ text: ` “${c.quote}”` });
		}
		const facts = [`Based on ${a.excerpts} passage${a.excerpts === 1 ? "" : "s"}${a.chapters.length ? ` from ${a.chapters.join(", ")}` : ""}.`, a.usedChronology ? "The timeline you built was included." : "", a.dropped > 0 ? `${a.dropped} quote${a.dropped === 1 ? " was" : "s were"} left out because ${a.dropped === 1 ? "it does" : "they do"} not appear in the text.` : ""].filter((x) => x !== "");
		item.createDiv({ cls: "bh-note", text: facts.join(" ") });
		for (const issue of a.issues) item.createDiv({ cls: "bh-note", text: issue });
	}
}

function renderContext(row: HTMLElement, c: PassageContext): void {
	const box = row.createDiv({ cls: "bh-context-box" });
	if (c.entities.length === 0) box.createDiv({ cls: "bh-note", text: "No known entity is named in this passage." });
	for (const e of c.entities) {
		box.createEl("strong", { text: `${e.name} (${e.type})` });
		for (const h of e.history) box.createDiv({ cls: "bh-note", text: `${h.chapter}: ${h.note === "" ? "Appears." : h.note} “${h.quote}”` });
		if (e.alsoNamed.length > 0) box.createDiv({ cls: "bh-note", text: `Also named here (inferred from proximity only): ${e.alsoNamed.map((a) => a.name).join(", ")}.` });
	}
	if (c.truncated) box.createDiv({ cls: "bh-note", text: "This is a selection: more is known than is shown." });
}

function renderSelected(root: HTMLElement, e: Entity, actions: BookActions): void {
	const box = root.createDiv({ cls: "bh-selected" });
	box.createEl("h4", { text: `${e.name} (${e.type})` });
	if (e.aliases.length > 0) box.createDiv({ cls: "bh-note", text: `Also: ${e.aliases.join(", ")}` });
	box.createDiv({ cls: "bh-body", text: e.body.replace(/^# .*\n+/, "").trim() });
	const controls = box.createDiv({ cls: "bh-actions" });
	controls.createEl("button", { cls: "bh-button", text: "Open note" }).addEventListener("click", () => actions.openNote(e.path));
	controls.createEl("button", { cls: "bh-button", text: "Close" }).addEventListener("click", () => actions.closeEntity());
}

function renderEntities(root: HTMLElement, overview: Overview, actions: BookActions): void {
	const box = root.createDiv({ cls: "bh-entities" });
	box.createEl("h4", { text: `Entities (${overview.entities.length})` });
	let kind = "";
	for (const e of overview.entities) {
		if (e.type !== kind) {
			kind = e.type;
			box.createDiv({ cls: "bh-note", text: kind });
		}
		const row = box.createDiv({ cls: "bh-entity" });
		row.createEl("button", { cls: "bh-link", text: e.name }).addEventListener("click", () => actions.openNote(e.path));
		if (e.aliases.length > 0) row.createDiv({ cls: "bh-note", text: `Also: ${e.aliases.join(", ")}` });
		const controls = row.createDiv({ cls: "bh-chapter-controls" });
		const add = (label: string, aria: string, fn: () => void) => controls.createEl("button", { cls: "bh-icon-button", text: label, attr: { "aria-label": aria } }).addEventListener("click", fn);
		add("Rename", `Rename ${e.name}`, () => actions.renameEntity(e.id, e.name));
		add("Add alias", `Add another name for ${e.name}`, () => actions.addAlias(e.id));
		add("Merge", `Merge ${e.name} into another ${e.type}`, () => actions.mergeEntity(e.id));
		if (e.aliases.length > 0) {
			add("Remove alias", `Remove one of the other names of ${e.name}`, () => actions.removeAlias(e.id));
			add("Split", `Move one of the other names of ${e.name} to a new entity`, () => actions.splitEntity(e.id));
		}
		add("Remove", `Remove ${e.name} from the list`, () => actions.archiveEntity(e.id));
	}
}

function renderProposal(root: HTMLElement, entry: Overview["proposals"][number], actions: BookActions): void {
	const { proposal, designation } = entry;
	const box = root.createDiv({ cls: "bh-proposal" });
	const open = proposal.edits.filter((e) => e.decision === "pending");
	const accepted = proposal.edits.filter((e) => e.decision === "accepted");
	box.createEl("strong", { text: `Suggested changes for ${designation}` });
	box.createDiv({ cls: "bh-note", text: "Your chapter is not changed until you accept a change and apply it." });
	for (const edit of proposal.edits.filter((e) => e.decision !== "rejected" && e.decision !== "applied")) {
		const row = box.createDiv({ cls: "bh-edit" });
		row.createSpan({ cls: "bh-context", text: `…${edit.before.slice(-24)}` });
		row.createEl("del", { text: edit.original === "" ? "(nothing)" : edit.original });
		row.createEl("ins", { text: edit.replacement === "" ? "(removed)" : edit.replacement });
		row.createSpan({ cls: "bh-context", text: `${edit.after.slice(0, 24)}…` });
		const state = { pending: "Not decided", accepted: "Accepted", conflict: "Could not be placed: the text changed", rejected: "", applied: "" }[edit.decision];
		row.createSpan({ cls: "bh-badge", text: state });
		const controls = row.createDiv({ cls: "bh-chapter-controls" });
		if (edit.decision !== "conflict") {
			controls.createEl("button", { cls: "bh-icon-button", text: "Accept", attr: { "aria-label": `Accept the change ${edit.original} to ${edit.replacement}` } }).addEventListener("click", () => actions.decideEdits(proposal.id, [edit.id], "accepted"));
		}
		controls.createEl("button", { cls: "bh-icon-button", text: "Reject", attr: { "aria-label": `Reject the change ${edit.original} to ${edit.replacement}` } }).addEventListener("click", () => actions.decideEdits(proposal.id, [edit.id], "rejected"));
	}
	const bulk = box.createDiv({ cls: "bh-actions" });
	if (open.length > 1) bulk.createEl("button", { cls: "bh-button", text: `Accept all ${open.length} undecided changes` }).addEventListener("click", () => actions.decideEdits(proposal.id, open.map((e) => e.id), "accepted"));
	if (open.length > 0) bulk.createEl("button", { cls: "bh-button", text: `Reject all ${open.length} undecided changes` }).addEventListener("click", () => actions.decideEdits(proposal.id, open.map((e) => e.id), "rejected"));
	if (accepted.length > 0) bulk.createEl("button", { cls: "bh-button mod-cta", text: `Apply ${accepted.length} accepted change${accepted.length === 1 ? "" : "s"} to the chapter` }).addEventListener("click", () => actions.applyProposal(proposal.id));
}

function timelineRow(list: HTMLElement, r: TimelineRow, actions: BookActions, showChapter: boolean): void {
	const li = list.createEl("li", { cls: "bh-event" });
	li.createSpan({ text: r.label });
	if (showChapter && r.chapter !== null) li.createSpan({ cls: "bh-badge", text: r.chapter });
	if (r.when !== null) li.createSpan({ cls: "bh-badge", text: `${r.definite ? "" : "possibly "}${r.when}` });
	if (r.after.length > 0) li.createDiv({ cls: "bh-note", text: `Certainly after: ${r.after.join(", ")}` });
	if (r.because.length > 0) li.createDiv({ cls: "bh-note", text: `Calculated from: ${r.because.join("; ")}` });
	li.createEl("button", { cls: "bh-icon-button", text: "Remove", attr: { "aria-label": `Remove event ${r.label}` } }).addEventListener("click", () => actions.removeEvent(r.id));
}

function renderTimeline(root: HTMLElement, view: TimelineView, actions: BookActions): void {
	const box = root.createDiv({ cls: "bh-timeline" });
	box.createEl("h4", { text: `Timeline (${view.narrative.length} event${view.narrative.length === 1 ? "" : "s"})` });
	if (view.conflict) {
		const warn = box.createDiv({ cls: "bh-callout" });
		warn.createEl("strong", { text: "These statements contradict each other" });
		for (const t of view.conflict) warn.createDiv({ text: t });
		warn.createDiv({ cls: "bh-note", text: "No order is shown until one of them is removed." });
	}
	box.createEl("h5", { text: "As the book tells it" });
	box.createDiv({ cls: "bh-note", text: "Chapter order. This is the telling order, not necessarily the order things happened." });
	const told = box.createEl("ol");
	for (const r of view.narrative) timelineRow(told, r, actions, true);
	if (view.world.length > 0) {
		box.createEl("h5", { text: "What the evidence settles" });
		box.createDiv({ cls: "bh-note", text: "Events are listed in order only where your statements prove it. Where nothing links two events, their position here means nothing." });
		const happened = box.createEl("ul");
		for (const r of view.world) timelineRow(happened, r, actions, false);
	}
	if (view.unordered.length > 0) box.createDiv({ cls: "bh-note", text: `${view.unordered.length} pair${view.unordered.length === 1 ? "" : "s"} of events have no known order.` });
	if (view.statements.length > 0) {
		box.createEl("h5", { text: "Your statements about time" });
		const list = box.createEl("ul");
		for (const st of view.statements) {
			const li = list.createEl("li");
			li.createSpan({ text: st.text });
			li.createEl("button", { cls: "bh-icon-button", text: "Remove", attr: { "aria-label": `Remove statement: ${st.text}` } }).addEventListener("click", () => actions.removeStatement(st.id));
		}
	}
}

function occurrenceButtons(parent: HTMLElement, word: string, occurrences: readonly Occurrence[], total: number, actions: BookActions): void {
	const shown = occurrences.slice(0, 5);
	shown.forEach((o, i) => parent.createEl("button", { cls: "bh-icon-button", text: String(i + 1), attr: { "aria-label": `Show “${word}”, ${i + 1} of ${total}, in ${o.designation}` } }).addEventListener("click", () => actions.openOccurrence(o, word)));
}

function wordRows(box: HTMLElement, rows: readonly WordRow[], actions: BookActions): void {
	const list = box.createEl("ul");
	for (const r of rows) {
		const li = list.createEl("li");
		li.createSpan({ text: `${r.word}: ${r.count} (${r.per1000} per 1,000 words, in ${r.chapters} chapter${r.chapters === 1 ? "" : "s"}) ` });
		occurrenceButtons(li, r.word, r.occurrences, r.count, actions);
	}
}

function renderStatistics(root: HTMLElement, stats: BookStatistics, actions: BookActions): void {
	const box = root.createDiv({ cls: "bh-statistics" });
	box.createEl("h4", { text: `Statistics (${stats.totalWords.toLocaleString("en-US")} words, ${stats.uniqueWords.toLocaleString("en-US")} different)` });
	box.createDiv({ cls: "bh-note", text: "Counted from your text on this device; no AI is used. A word used often is not a fault. Names of characters, places and objects you have recorded are left out of the word lists. Sentence counts are approximate." });
	box.createEl("h5", { text: "Chapters" });
	const chapters = box.createEl("ul");
	for (const c of stats.chapters) chapters.createEl("li", { text: `${c.designation}: ${c.words.toLocaleString("en-US")} words, ${c.sentences} sentences (average ${c.averageSentence} words, longest ${c.longestSentence}), ${c.paragraphs} paragraphs` });
	if (!stats.stopwords) box.createDiv({ cls: "bh-callout", text: `There is no list of common words for “${stats.language}”, so words like “the” or “und” appear in the lists below.` });
	box.createEl("h5", { text: "Most used words" });
	if (stats.frequent.length === 0) box.createDiv({ cls: "bh-note", text: "No words to show yet." });
	wordRows(box, stats.frequent, actions);
	box.createEl("h5", { text: "Words used many times close together" });
	if (stats.clusters.length === 0) box.createDiv({ cls: "bh-note", text: "None found." });
	const clusters = box.createEl("ul");
	for (const c of stats.clusters) {
		const li = clusters.createEl("li");
		li.createSpan({ text: `${c.word}: ${c.count} times within ${c.span} words, in ${c.first.designation} ` });
		occurrenceButtons(li, c.word, c.occurrences, c.count, actions);
	}
	box.createEl("h5", { text: "Phrases that repeat" });
	if (stats.phrases.length === 0) box.createDiv({ cls: "bh-note", text: "None found." });
	const phrases = box.createEl("ul");
	for (const p of stats.phrases) {
		const li = phrases.createEl("li");
		li.createSpan({ text: `“${p.phrase}”: ${p.count} times ` });
		occurrenceButtons(li, p.phrase, p.occurrences, p.count, actions);
	}
	box.createEl("h5", { text: stats.adjectives.support.mode === "heuristic" ? "Adjectives (a guess)" : "Adjectives" });
	box.createDiv({ cls: "bh-note", text: stats.adjectives.support.note });
	if (stats.adjectives.support.mode === "heuristic") wordRows(box, stats.adjectives.rows, actions);
}

function statsLine(stats: ChapterStats): string {
	const words = stats.words === null ? "Not counted yet" : `${stats.words.toLocaleString("en-US")} words`;
	const state = { current: "", stale: " (out of date: the text changed since it was counted)", not_processed: "", failed: " (last count failed)", canceled: " (last count was canceled)" }[stats.status];
	return `${words}${state}`;
}

/**
 * Draws the overview. Never rebuilds an element that holds focus on its own: the caller redraws only when data changed.
 * State is conveyed by text and an icon-free label, never by colour alone.
 */
export function renderOverview(root: HTMLElement, ctx: PanelContext, overview: Overview | null, actions: OverviewActions, problems: readonly string[] = []): void {
	root.empty();
	root.addClass("bh-panel");
	// A failed read is not "no data": say what could not be read, whatever else the panel shows.
	if (problems.length > 0) {
		const box = root.createDiv({ cls: "bh-callout" });
		box.createEl("strong", { text: "Some Book Harness records could not be read" });
		for (const p of problems) box.createDiv({ text: p });
	}
	if (ctx.kind === "no-books") {
		root.createEl("p", { cls: "bh-empty", text: "No books yet. Register a folder as a book to begin." });
		root.createEl("button", { cls: "bh-button mod-cta", text: "Register this note's folder as a book" }).addEventListener("click", () => actions.registerFolder());
		return;
	}
	if (ctx.kind === "inactive") {
		root.createEl("p", {
			cls: "bh-empty",
			text: ctx.reason === "no-active-note" ? "Open a note to see its book." : "This note is not part of a registered book.",
		});
		root.createEl("button", { cls: "bh-button", text: "Register this note's folder as a book" }).addEventListener("click", () => actions.registerFolder());
		return;
	}
	const { book } = ctx;
	const bookActions = actions.forBook(book);
	root.createEl("h3", { cls: "bh-title", text: book.title });
	root.createDiv({ cls: "bh-meta", text: `${book.primaryLanguage}${book.targetLanguages.length ? ` → ${book.targetLanguages.join(", ")}` : ""}` });

	const bar = root.createDiv({ cls: "bh-actions" });
	if (ctx.role === "manuscript") bar.createEl("button", { cls: "bh-button mod-cta", text: "Make this note a chapter" }).addEventListener("click", () => bookActions.promoteActive(ctx.activePath));
	bar.createEl("button", { cls: "bh-button", text: "Plan a chapter" }).addEventListener("click", () => bookActions.planChapter());
	bar.createEl("button", { cls: "bh-button", text: "Add a to-do" }).addEventListener("click", () => bookActions.addTodo());
	bar.createEl("button", { cls: "bh-button", text: "Summarize chapters" }).addEventListener("click", () => bookActions.summarize());
	bar.createEl("button", { cls: "bh-button", text: "Find characters, places and objects" }).addEventListener("click", () => bookActions.extractEntities());
	bar.createEl("button", { cls: "bh-button", text: overview?.statistics ? "Hide statistics" : "Show statistics" }).addEventListener("click", () => bookActions.toggleStatistics());
	bar.createEl("button", { cls: "bh-button", text: "Export as EPUB" }).addEventListener("click", () => bookActions.exportEpub());
	bar.createEl("button", { cls: "bh-button", text: "Add an event" }).addEventListener("click", () => bookActions.addEvent());
	bar.createEl("button", { cls: "bh-button", text: "Add a time relation" }).addEventListener("click", () => bookActions.addTimeRelation());
	bar.createEl("button", { cls: "bh-button", text: "Add an entity" }).addEventListener("click", () => bookActions.addEntity());
	bar.createEl("button", { cls: "bh-button", text: "Proofread chapters" }).addEventListener("click", () => bookActions.proofread());
	bar.createEl("button", { cls: "bh-button", text: "Update word counts" }).addEventListener("click", () => bookActions.updateStats());

	if (!overview) return;
	renderSearch(root, overview, bookActions);
	renderAsk(root, overview.ask, bookActions);
	if (overview.translations.length > 0) renderTranslations(root, overview, bookActions);
	if (overview.selected) renderSelected(root, overview.selected, bookActions);
	for (const job of overview.jobs) renderJob(root, job, bookActions);
	for (const entry of overview.proposals) renderProposal(root, entry, bookActions);
	if (overview.duplicates.length > 0) {
		const box = root.createDiv({ cls: "bh-duplicates" });
		box.createEl("h4", { text: `Could these be the same? (${overview.duplicates.length})` });
		box.createDiv({ cls: "bh-note", text: "They share a word. Nothing is merged unless you say so." });
		for (const d of overview.duplicates) {
			const row = box.createDiv({ cls: "bh-entity" });
			row.createSpan({ text: `${d.a.name} and ${d.b.name} (${d.a.type}, both contain "${d.shared}") ` });
			const controls = row.createDiv({ cls: "bh-chapter-controls" });
			controls.createEl("button", { cls: "bh-icon-button", text: "Same: merge", attr: { "aria-label": `Merge ${d.b.name} into ${d.a.name}` } }).addEventListener("click", () => bookActions.mergeDuplicate(d.b.id, d.a.id));
			controls.createEl("button", { cls: "bh-icon-button", text: "Different", attr: { "aria-label": `${d.a.name} and ${d.b.name} are different` } }).addEventListener("click", () => bookActions.keepDistinct(d.a.id, d.b.id));
		}
	}
	if (overview.unsupported.length > 0) {
		const box = root.createDiv({ cls: "bh-callout" });
		box.createEl("strong", { text: "No chapter supports these any more" });
		for (const e of overview.unsupported) box.createDiv({ text: `${e.name} (${e.type}): the text it was found in has changed. Keep or remove it.` });
	}
	if (overview.entities.length > 0) renderEntities(root, overview, bookActions);
	if (overview.timeline) renderTimeline(root, overview.timeline, bookActions);
	if (overview.statistics) renderStatistics(root, overview.statistics, bookActions);
	if (overview.todos.length > 0) {
		const box = root.createDiv({ cls: "bh-todos" });
		box.createEl("h4", { text: `To do (${overview.todos.length})` });
		const items = box.createEl("ul");
		for (const t of overview.todos) {
			const li = items.createEl("li", { cls: `bh-todo bh-${t.severity}` });
			li.createSpan({ cls: "bh-badge", text: t.severity === "required" ? "Required" : "Note" });
			const notePath = t.notePath;
			if (notePath === undefined) li.createSpan({ text: ` ${t.message}` });
			else li.createEl("button", { cls: "bh-link", text: t.message }).addEventListener("click", () => bookActions.openNote(notePath));
			const manualId = t.manualId;
			if (manualId !== undefined) li.createEl("button", { cls: "bh-icon-button", text: "Done", attr: { "aria-label": `Mark done: ${t.message}` } }).addEventListener("click", () => bookActions.completeTodo(manualId));
		}
	}
	if (overview.rows.length === 0) {
		root.createEl("p", { cls: "bh-empty", text: "No chapters yet. Open a manuscript note and make it a chapter, or plan one." });
		return;
	}
	const list = root.createEl("ol", { cls: "bh-chapters" });
	for (const row of overview.rows) {
		const li = list.createEl("li", { cls: row.isActive ? "bh-chapter is-active" : "bh-chapter" });
		const head = li.createDiv({ cls: "bh-chapter-head" });
		const title = head.createEl("button", { cls: "bh-link", text: row.chapter.designation });
		title.addEventListener("click", () => {
			if (row.chapter.notePath !== null && !row.missingNote) bookActions.openNote(row.chapter.notePath);
		});
		if (row.isActive) head.createSpan({ cls: "bh-badge", text: "Open now" });
		if (row.chapter.notePath === null) head.createSpan({ cls: "bh-badge", text: "No file yet" });
		if (row.missingNote) head.createSpan({ cls: "bh-badge", text: "Note not found" });
		if (row.chapter.notePath !== null) li.createDiv({ cls: "bh-note", text: statsLine(row.stats) });
		if (row.summary.path !== null) {
			const summaryPath = row.summary.path;
			const line = li.createDiv({ cls: "bh-note" });
			line.createSpan({ text: row.summary.status === "stale" ? "Summary (out of date: the text, prompt or model changed) " : "Summary " });
			line.createEl("button", { cls: "bh-link", text: "Open" }).addEventListener("click", () => bookActions.openNote(summaryPath));
		}
		if (row.proofread !== null && row.proofread.total > 0) {
			const c = row.proofread;
			li.createDiv({ cls: "bh-note", text: `Proofreading: ${c.reviewed} of ${c.total} paragraphs reviewed${c.waiting ? `, ${c.waiting} waiting for your decision` : ""}${c.pending ? `, ${c.pending} not checked yet` : ""}.` });
		}
		const controls = li.createDiv({ cls: "bh-chapter-controls" });
		const select = controls.createEl("select", { cls: "bh-select dropdown", attr: { "aria-label": `Status of ${row.chapter.designation}` } });
		for (const s of CHAPTER_STATUSES) {
			const o = select.createEl("option", { text: STATUS_LABEL[s], value: s });
			o.selected = s === row.chapter.status;
		}
		select.addEventListener("change", () => bookActions.setStatus(row.chapter.id, select.value as ChapterStatus));
		const up = controls.createEl("button", { cls: "bh-icon-button", text: "Up", attr: { "aria-label": `Move ${row.chapter.designation} earlier` } });
		up.disabled = row.isFirst;
		up.addEventListener("click", () => bookActions.move(row.chapter.id, "up"));
		const down = controls.createEl("button", { cls: "bh-icon-button", text: "Down", attr: { "aria-label": `Move ${row.chapter.designation} later` } });
		down.disabled = row.isLast;
		down.addEventListener("click", () => bookActions.move(row.chapter.id, "down"));
		const rename = controls.createEl("button", { cls: "bh-icon-button", text: "Rename", attr: { "aria-label": `Rename ${row.chapter.designation}` } });
		rename.addEventListener("click", () => bookActions.rename(row.chapter.id, row.chapter.designation));
		if (row.chapter.notePath !== null) {
			const unbind = controls.createEl("button", { cls: "bh-icon-button", text: "Unlink", attr: { "aria-label": `Unlink the note from ${row.chapter.designation}` } });
			unbind.addEventListener("click", () => bookActions.unbind(row.chapter.id));
		}
	}
}
