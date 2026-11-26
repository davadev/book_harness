# Implementation status ledger

Last updated: 2026-11-26 (Phase 0 complete; no code written). Update this file at the end of every session/slice.

## Resume here (written before a context compaction)

**State:** Phases 0–5 are built in code; Phase 6 (summaries, entities, extraction, highlights) and Phase 7 (keyword + meaning search, graph) are largely built; every slice has 100 % coverage and the full gate set is green. **Nothing has ever run in real Obsidian (desktop or iPhone) or against a real Ollama.** All behaviour is verified by simulation (fake vault, fake app, scripted model, happy-dom, a real CodeMirror `EditorView` under happy-dom). No beta has been cut: the author deferred it at every checkpoint. Android is unverifiable by agreement (build to its constraints, label as untested).

**First real-model evaluation (2026-11-26, Ollama, synthetic book; full output `docs/evals/2026-11-26-first.md`):** gemma4:12b and ornith-1.5:35b both work end to end with `think:false`; 0 failed calls, 5-6 of 30 needed the one repair. Summaries: ornith faster (17-81 s vs 39-91 s per chapter) and fuller, but both small models make factual slips (ornith: "drowned seven years ago"; gemma: wrong detail on the compass), so summaries stay labelled drafts. Proofreading: only 2-3 of 5 injected typos fixed, no unsafe edit got through; treat as a helper, not a guarantee. Entities: all 7 characters, 3 places, 2 objects found; but 40+ entities per chapter, mostly generic objects (chair, lamp), so extraction needs a stricter prompt / object cap (open). Search (bge-m3): keyword and hybrid both 6/6 on this small book; no quality claim beyond it. Chapters are ~5-7 A4, not the author's ~10: shortfall stated. Nothing about German/Czech/Slovak was evaluated.

**Biggest risks (see `docs/RISKS.md`):** the editor review/highlight extensions and panel layout on iOS (spike S2); `requestUrl` to a remote Ollama from a phone (S5); the EPUB/PDF stack on mobile (S1: direction fflate + pdfmake, nothing implemented); WebDAV sync conflict behaviour of many small notes (S8); language-quality of extraction/proofreading for English, German, Czech/Slovak (never evaluated with a real model).

**What is left, in plan order** (`docs/IMPLEMENTATION-PLAN.md`):
- Phase 7: search filters (entity, chapter) and performance measurement on a long book.
- Phase 6 gaps: per-type entity attributes (appearance, geography, ...), author-established facts and fact kinds (canon / claim / belief / reader revelation), relationships, Reading-mode highlights (no post-processor yet), model-assisted identity comparison.
- Phase 8 temporal engine: calendar, solver, event/statement store and a panel list are built (slice 1). Left: model event extraction + identity, personal chronology / time travel, graphical renderer (`docs/TEMPORAL-ENGINE.md`, reuse plan `docs/DISCOVERY.md` §4, O-5).
- Phase 9: character depth analysis, contradiction investigation, statistics (word counts exist; frequency/adjective analysis with the labelled heuristic / model-classified modes for de/cs/sk), contextual synonyms.
- Phase 10 translation; Phase 11 read-only chat agent (tools: search, graph context, entities, chapter summaries; bounded loop; citations; saved chats); Phase 12 publishing (S1 first); Phase 13 integration, accessibility, recovery tooling, user docs, example nonlinear book.
- Cross-cutting: first BRAT prerelease and a **platform test log** (`docs/COMPATIBILITY.md` §5, still empty); spikes S2, S5, S6 (device), S7, S8; real-model evaluation script (opt-in, records model versions); diagnostics view; prompt-override editor UI; snapshot store (O-10) when translation needs it.

**Open decisions needing the author** (`docs/DECISIONS.md`): O-5 timeline reuse mechanism, O-8 PDF cross-platform fidelity, O-9 calendar scope, O-10 snapshot retention, O-12 Reading-mode highlights on mobile. Resolved so far: O-1 (decision provider out of MVP), O-3, O-4, O-6 (English, German, Czech/Slovak), O-7, O-11 (WebDAV/Nextcloud sync), O-13, Android policy.

**Working agreements with the author:** ask with the AskUserQuestion tool; public repo, nothing private; master prompt stays local (git-ignored); never present mocked output as model quality; be explicit about what is untested.

## 1. Where we are

| Phase | Name | Status | Notes |
|---|---|---|---|
| 0 | Discovery and documentation | **Done (this session)** | Docs written; open decisions recorded. Playbook docs partly unread — see DISCOVERY §1. |
| 1 | Scaffold, spikes S1–S8, compatibility proof | **In progress**: scaffold slice done (below); spikes not started | Unblocked (O-3 resolved). S4 needs O-1; S5/S7 need iPhone. |
| 2 | Core books/chapters/schemas/panel/write-gate skeleton | **In progress** | Done: ids, managed-note schema/parse/serialize, book registration + discovery + nesting refusal + isolation helper, `Register this note's folder as a book` command with modal. Also done: manuscript write guard skeleton (`GuardedVault` refuses every write to manuscript paths; no capability exists yet) + architecture tests (core purity, single write path, raw port only in guarded factory, no network API) with canary-verified failure. Also done (slice 4): deterministic TODO engine (unfinished chapters vs the book's own completion requirement, planned slots without files, missing notes, numbering gaps, ambiguous assignments) shown in the panel; book completion requirement property with default. Also done (slice 3): chapter records (designation, order, status, bound note or planned slot), promotion, planning, status/order/designation edits, reassignment/unlink, rename follow, conflict + gap detection, panel context resolution, side panel Overview (panel view, ribbon icon, command, debounced redraw, hidden-draws-nothing, failed reads shown not hidden), `styles.css`. **Not done:** capability-carrying proposal path (Phase 5), other panel tabs, settings/book-config split, demote-by-removing-slot, drag reordering, narrow-width/WebKit layout verification and any real-Obsidian run, manual entity shells, schema migrations framework. Desktop-only tests; not run in Obsidian. |
| 3 | Revisions, invalidation, jobs, TODO foundation | **Mostly done** | Done: content revisions (SHA-256 of normalized body; properties and CRLF ignored), task fingerprints, first deterministic task `stats.words` with persisted per-chapter task state (`_book-harness/state/<ch_id>.md`), statuses not_processed/current/stale/failed/canceled, user-initiated batch update with independent failures, stale-result discard (AC-C-3 for this task), word counts in the panel. TODO foundation done in Phase 2 slice 4. Slice 3 done: chapter records store note paths relative to the book folder (found while writing the copy test: absolute paths would have broken a copied or renamed book folder); folder-copy portability integration test (AC-ST-3 structure part: chapters, order, status, task results, jobs, to-dos survive a copy under a different folder name); sync-conflict-copy detection (naming heuristics, best effort) and duplicate chapter id detection shown as required to-dos/problems; the author's own to-dos (`todos.md`, hand-editable task list) with add/done in the panel. Slice 2 done: job ledger (`_book-harness/jobs/<jb_id>.md`) with a recorded user authorization, per-chapter independent outcomes, cancellation between chapters, periodic persistence, live progress in the panel, jobs left `running` by a closed app shown as interrupted (nothing written, nothing restarted), dismiss. **Not done:** queued/authorized-but-not-started states, bounded concurrency >1, model-task jobs, dependency-graph invalidation across tasks (needs a second task), real divergence detection beyond conflict copies (`bh_rev`/`bh_parent`; true detection of silent last-writer-wins overwrite by WebDAV sync is not possible from one device and is documented as a limit), operation journal for multi-record operations, snapshots (O-10; no consumer until proofreading/translation), model-call spy test for AC-C-1 (needs the model port, Phase 4). |
| 4 | AI infrastructure | **In progress** | Slice 1 done: network port + `requestUrl` adapter (timeout/cancel enforced), Ollama client (chat with schema/options, embed, tags, version) with typed, actionable errors, connection test (explicit author action), device-local server settings (address, models) kept out of synced data, lifecycle test proving no network calls on load/save/edit/sync (AC-C-1 so far). Not verified against a real server or from a phone (S5). Slice 2 done: structured-output pipeline (tolerant JSON read, plain-language validation, exactly one repair kept only if no worse, bounded transport retry with backoff), prompt registry with Markdown overrides (`_book-harness/prompts/<task>.md`, validated against attempts to override rules/edit text/use tools, override hash part of every fingerprint), in-memory diagnostics log (no text), first model task `chapter.summary` (chunked map-reduce for long chapters, text delivered as marked data, summary saved as a separate AI-managed note that preserves the author's notes section, stale when text/prompt/model change, discarded when the text changes mid-run), job runner generalized to chapter jobs with in-flight cancel, disclosure + confirmation dialog before any text leaves the device. A real bug found: a request canceled before it started would hang (fixed in the network adapter). **Not done:** bounded concurrency >1, embedding job, diagnostics view/export UI, prompt override editor UI (the author creates the note by hand), real-model evaluation harness, decision-model port (out of MVP). Never run against a real Ollama server. O-1 resolved (out of MVP); O-2 answered by the published Ollama reference (docs/AI-AND-PROMPTS.md §7). |
| 5 | Proposal/diff/review, proofreading | Not started | |
| 6 | Summaries, entities, occurrences, highlights | **In progress** | Done: chapter summaries (Phase 4 slice 2); entity records (characters, places, objects, technology, spacecraft, any lowercase kind) as managed notes with name, aliases and a free body the plugin never rewrites; full manual management: create (refusing any name or alias another entity already uses), rename (old name kept as alias), add/remove alias, merge (survivor gains names, merged one stays as a redirect, survivor written first), split (move names to a new entity), remove (archived, note kept), shown in the panel with per-entity actions. Slice 2 done: extraction of characters, places and objects (three single-purpose prompts, chunked for long chapters), grounding checked by code (an entity is only kept if its quote occurs in the text word for word; ungrounded ones are counted and dropped), exact-name identity resolution (existing names are matched, never duplicated; a new name that the model says is also another entity's name is not added and is reported; different kind is reported), aliases added only if they occur in the text and belong to nobody else, entities created by the model are marked as such and never overwrite what the author wrote, per-chapter evidence record replaced wholesale on re-extraction (facts a rewrite removed disappear, other chapters keep theirs), AI-managed History section on each entity built deterministically in reading order, entities nothing supports any more are flagged not deleted, deterministic possible-duplicate hints (shared whole word, same kind) with Merge or Different (remembered), a job with disclosure/confirmation and per-chapter independence. Slice 3 done: entity highlights in the editor (CodeMirror 6 mark decorations on mentions of the entities a chapter's text supports, found by exact name or alias, whole words, longest first; drawn from the current text so a highlight can never sit on changed words, dropped if the author edits inside one; kind carried by line style, not colour alone), tap or click shows the entity (aliases, AI-managed history, the author's notes) in the side panel while the chapter stays open, per-kind and global switches in settings plus a command, author corrections stored as managed notes (remove a wrong highlight, link selected words to an entity) found again by their surroundings after edits, nothing ever written into the chapter. **Not done:** verification in real Obsidian desktop and iOS (touch taps, IME, Reading mode: not implemented, no post-processor yet; long chapters), decomposed-accent names, highlights for entities only seen by name search in chapters never read. **Earlier Not done list:** descriptions and attributes per entity type (appearance, geography, ...), author-established facts and fact kinds (canon, claims, beliefs, reader revelation), relationships, other model-assisted candidate comparison, alias suggestions for author-made entities, event extraction (Phase 8), occurrence mapping and clickable highlights, entity detail view in the panel, model-quality evaluation. Never run against a real model. |
| 7 | Search, embeddings, graph | **In progress** | Slice 1 done: deterministic passages (about 200 words, prose only, nothing dropped, no lookbehind regex), in-house BM25 (exact whole words, no stemming so invented names are found as written, exact-phrase bonus, deterministic ties), one index per book (cannot see another book), brought up to date with the notes at each search by comparing revisions (no model, no startup work), results with stable passage references (book, chapter, passage id, revision, offsets), snippets, provenance, and the entities named in the passage (including ones linked by hand); the panel shows how much was searched, names chapters without notes, never searches per keystroke, and a hit opens the chapter and selects the passage (warns if the chapter changed since). Slice 2 done: meaning index (embeddings per passage, normalized vectors, stored in the plugin folder on this device only as a small binary file, never in the book; disposable), built only by an explicit, disclosed author action in small batches per chapter, as a cancelable job that saves per chapter; freshness states missing / current / partial / incompatible-model shown in the panel (a changed passage or a different model is never silently reused); hybrid search: the query is embedded only as part of a search the author turned meaning on for, results fused with reciprocal rank fusion (positions only), each hit labelled keyword / meaning / both, keyword results stay current and are the fallback with the reason shown (offline, not built, other model, partly stale). Slice 3 done: knowledge graph built in memory from the book's records (chapters in the author's order, passages, entities, evidence): observed edges (contains, mentions by exact name or by the author's link, evidenced-in with the quote, precedes) and inferred ones (co-occurs: named in the same passage, flagged inferred with its stated rule and "does not say how they are related"); bounded context expansion from a passage (entities named, what each chapter's text supports in reading order, who else is named) with a budget on entities, history lines and characters, deduplicated, truncation announced; "Show context" under each search hit. Events, relationships and temporal constraints are not graph nodes yet (Phase 8). **Not done:** search scope/filters (entity, chapter), measuring build time/memory/size on a long book and on a phone, ANN (not needed at book scale), real-embedding relevance evaluation. |
| 8 | Temporal engine | **In progress** | Slice 1 done: precision-preserving calendar (proleptic Gregorian, astronomical years; a year-only date is the whole year, never 1 January; months/years refused as durations), difference-constraint solver (Floyd–Warshall closure, negative-cycle conflict with the constraint chain as evidence, derived bounds with support, partial order as a transitive reduction, unordered pairs, recomputed from scratch so removing a statement retracts what followed), event and statement records as small separate managed notes under `_book-harness/timeline/` (retire instead of delete, duplicate-id and bad-record reporting), the author adds events (optionally tied to a chapter), `before` / `N days after` / `same time` / date statements through the panel; panel Timeline shows the telling order (chapter order, labelled as not time order), what the evidence settles (calculated values labelled "possibly" unless exact, with the statements behind them), unordered pairs, and a contradiction callout with the offending statements. Verified by simulation only. **Not done:** model event extraction and identity reconciliation (needs real-model evaluation), personal (per-character-instance) chronology and time-travel fixtures, fixture corpus files, calendar extension point (O-9), graphical timeline renderer (O-5/S7), event merge/split, references with quotes, rewrite invalidation. |
| 9 | Analysis, contradictions, statistics, synonyms | Not started | O-6. |
| 10 | Translation | Not started | |
| 11 | Chat agent | Not started | |
| 12 | Publishing | Not started | O-8 after S1. |
| 13 | Integration, portability, packaging, docs | Not started | |

## 2. Requirement ledger (from `SPEC.md`)

| Area | Rows | Designed | Implemented | Verified |
|---|---|---|---|---|
| Invariants | 12 | 12 | 0 | 0 |
| Registration (REG) | 10 | 10 | 0 | 0 |
| UI | 9 | 9 | 0 | 0 |
| Persistence (PER) | 11 | 11 | 0 | 0 |
| Jobs (JOB) | 11 | 11 | 0 | 0 |
| AI | 8 | 8 | 0 | 0 |
| Knowledge (KNW) | 6 | 6 | 0 | 0 |
| Occurrences (OCC) | 8 | 8 | 0 | 0 |
| Protection (PRO) | 7 | 7 | 0 | 0 |
| Proofreading (PRF) | 7 | 7 | 0 | 0 |
| Literary (LIT) | 5 | 5 | 0 | 0 |
| Statistics (STA) | 6 | 6 | 0 | 0 |
| Translation (TRN) | 8 | 8 | 0 | 0 |
| Search/graph (SRC) | 3 | 3 | 0 | 0 |
| Temporal (TMP) | 8 | 8 | 0 | 0 |
| Agent (AGT) | 4 | 4 | 0 | 0 |
| TODOs (TDO) | 5 | 5 | 0 | 0 |
| Publishing (PUB) | 7 | 7 | 0 | 0 |
| Definition of done (DOD) | 7 | 7 | 0 | 0 |

"Designed" = covered by a design doc; it is **not** a claim that the design is validated. Acceptance rows: 0 of 34 passed (see `ACCEPTANCE.md`).

## 3. Blockers and unresolved decisions

None blocks Phase 0. Blocking later work:

- **O-1** decision-provider interface not found — blocks the real decision-model adapter (Phase 4); port + test double can proceed.
- **R-16** agent has no device access: mobile results depend on the author (iOS only; **Android unverifiable**, needs an explicit decision).
- Resolved 2026-11-26: O-3, O-4, O-6, O-7, O-11 (see DECISIONS).
- Still open: O-1, O-2, O-5, O-8, O-9, O-10, O-12.
- Full list with recommendations: `DECISIONS.md` Open table (O-1 … O-12).

## 4. Reuse ledger

| Source | Component | Status |
|---|---|---|
| Playbook | templates (config, scripts, workflows, tests, skills, hooks) | Planned for Phase 1; not yet copied |
| Timeline plugin | VaultAdapter, cache patterns, logger/app-storage/device-prefs, test utils | Planned (Phase 1–2) |
| Timeline plugin | Windowed chart / axis ticks / callouts / tooltip / bar renderer | Planned (Phase 8, after S7); vendored copy with provenance (O-5) |

## 5. Spike log

| ID | Status | Result |
|---|---|---|
| S1 EPUB/PDF | Desktop-side done | See SPIKES.md: fflate + pdfmake direction; device/EPUBCheck pending |
| S2 Editor decorations on mobile | Not started | — |
| S3 NLP/POS | Desktop-side done | English tagging feasible; de/cs/sk no on-device tagger (O-13) |
| S4 Decision provider | Out of MVP | O-1 resolved |
| S5 Mobile → Ollama connectivity | Not started | Needs device + author network |
| S6 Hash/vector storage | Desktop-side done | noble SHA-256; Float32 brute force; device checks pending |
| S7 Timeline renderer abstract axis | Not started | — |
| S8 Sync conflict behaviour | Not started | Needs O-11 |

## 6. Platform test log

Empty. No platform has been tested (desktop or mobile). See `COMPATIBILITY.md` §5 for the format.

## 7. Test and gate results

Latest (Phase 6 slice 2, extraction): 503 tests, 100 % on four metrics, check-release strict green. Earlier (Phase 6 slice 1): 472 tests, 100 % on four metrics, check-release strict green. Earlier (Phase 5 slice 2): 449 tests, 100 % on four metrics, check-release strict green. Earlier (Phase 5 slice 1): 426 tests, 100 % on four metrics, check-release strict green. Earlier (Phase 4 slice 2): 363 tests, 100 % on four metrics, check-release strict green. Earlier (Phase 4 slice 1): 329 tests, 100 % on four metrics, check-release strict green. Earlier (Phase 3 slice 3): 304 tests, 100 % on four metrics, check-release strict green. Earlier (Phase 3 slice 2): 285 tests, 100 % on four metrics, check-release strict green. Earlier (Phase 3 slice 1): 267 tests, 100 % on four metrics, check-release strict green. Earlier (Phase 2 slice 4): 240 tests, 100 % on all four metrics; `check-release --with-build --strict` 52 passed, 0 failed. Earlier (slice 3): 231 tests, 100 % statements/branches/functions/lines; `check-release --with-build --strict` 52 passed, 0 failed. Earlier (slice 2): 173 tests, 100 % on all four metrics; build, lint, dead-code, cloud-parity, `check-release --with-build --strict` green. Earlier scaffold slice (2026-11-26, desktop toolchain only): `build`, `lint` (0/0), `lint:css`, `lint:deps`, `check:dead-code`, `test:cov` (129 tests, 100 % on 4 metrics), `lint:cloud-parity` (0 errors) and `check-release --with-build --strict` (49 passed, 0 failed, 0 warned) are green. 16 dev-toolchain advisories reported by `npm audit` (not shipped, non-blocking; review in the dependency-update pass). **Not yet run:** WebKit/Chromium layout jobs, any real Obsidian runtime (desktop or iOS).

## 8. Change log

| Date | Change |
|---|---|
| 2026-11-26 | Phase 7 slice 3: knowledge graph and passage context. |
| 2026-11-26 | Phase 7 slice 2: meaning index, freshness states, RRF hybrid search. |
| 2026-11-26 | Phase 7 slice 1: passages, BM25, per-book keyword search in the panel. |
| 2026-11-26 | Phase 6 slice 3: occurrences, editor highlights, entity detail in the panel, corrections. |
| 2026-11-26 | Phase 6 slice 2: entity extraction, evidence, histories, duplicate hints. |
| 2026-11-26 | Phase 6 slice 1: entity model and manual management in the panel. |
| 2026-11-26 | Phase 5 slice 2: in-editor suggestion review (CM6), shared review module. |
| 2026-11-26 | Phase 5 slice 1: diff, proposals, write gate capability, segmentation, proofreading, panel review. |
| 2026-11-26 | Phase 4 slice 2: structured pipeline, prompt overrides, diagnostics, chapter summaries, generic chapter jobs. |
| 2026-11-26 | Phase 4 slice 1: network port, Ollama client, connection test, device-local settings. |
| 2026-11-26 | Phase 3 slice 3: relative note paths, folder-copy test, conflict-copy detection, manual to-dos. |
| 2026-11-26 | Phase 3 slice 2: job ledger, runner with cancel, interrupted-job presentation, panel progress. |
| 2026-11-26 | Phase 3 slice 1: revisions, fingerprints, task state, word-count task + panel counts. |
| 2026-11-26 | Phase 2 slice 4: TODO engine + completion requirement + To do list in panel. |
| 2026-11-26 | Phase 2 slice 3: chapter registry core, panel model, Overview panel, rename tracking. UI is happy-dom tested only; never rendered in Obsidian. |
| 2026-11-26 | Phase 2 slice 2: GuardedVault + architecture tests (AC-S-1 partially: refusal proven at port level). |
| 2026-11-26 | Phase 2 slice 1: core ids, managed notes, book registry, register command; O-13 resolved. |
| 2026-11-26 | Spikes S1/S3/S6 desktop-side run; results in SPIKES.md; ADRs D-020..D-023, open O-13. |
| 2026-11-26 | Phase 1 scaffold: playbook templates applied (config, scripts, CI/release workflows, skills, hook, tests), minimal plugin (onload wrapper, crash guard, log level setting), README, LICENSE. O-1 (decision provider out of MVP) and Android (unverified) recorded. |
| 2026-11-26 | Author resolved O-3, O-4, O-6, O-7, O-11. |
| 2026-11-26 | Phase 0: read master prompt; inspected playbook and timeline plugin (`7f1611d`, v0.13.2); wrote AGENTS.md/CLAUDE.md and docs (SPEC, DISCOVERY, COMPATIBILITY, ARCHITECTURE, AI-AND-PROMPTS, MANUSCRIPT-PROTECTION, SEARCH-AND-AGENT, TEMPORAL-ENGINE, PUBLISHING, IMPLEMENTATION-PLAN, DECISIONS, RISKS, ACCEPTANCE, STATUS). No upstream repo modified. |
