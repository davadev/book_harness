# Acceptance criteria

Mandatory scenarios from master prompt §21, each with an ID, the test types that prove it, the phase, and status. Rules: mock inference in CI (`mock` ≠ model quality); real-model evals are separate, opt-in, and record model versions; fixtures are synthetic; **mobile rows need a real-device entry in the platform test log**; a row is `Passed` only with the listed evidence.

Test types: **U** unit (core, node) · **I** integration (fake vault/ports) · **UI** happy-dom behaviour · **E** end-to-end in real Obsidian (manual or scripted, recorded) · **D** real-device (desktop/mobile log) · **M** mocked model · **R** real-model eval (opt-in).

Status values: `Not started` / `In progress` / `Passed (CI)` / `Passed (CI + device)`. All rows `Not started` as of 2026-11-26.

## Structure and portability

| ID | Scenario | Types | Phase | Status |
|---|---|---|---|---|
| AC-ST-1 | Register two books in one vault; similarly named characters/chapters never leak between them (search, graph, extraction, TODOs, export). | U, I, UI | 2 (+7, 12) | In progress: registry + path isolation unit-tested (`books.test.ts`); search/graph/export parts pending |
| AC-ST-2 | Promote arbitrary-named files to Prologue, Chapter 1, 10, 15; reading/export order follows assignment; known gaps and planned slots shown; rename/move retains associations. | U, I, E | 2 | Not started |
| AC-ST-3 | Copy the complete book folder and assets to another configured installation without `.obsidian`: entity knowledge, translation mapping, timeline evidence, pending tasks, prompt overrides, chat history, unresolved proposals retained; indexes rebuild; divergent synced changes detected, not overwritten. | I, E, D | 3, 13 | In progress: copy test passes for what exists (`portability.test.ts`); conflict copies detected; other record types arrive with their features |

## AI control and manuscript safety

| ID | Scenario | Types | Phase | Status |
|---|---|---|---|---|
| AC-C-1 | Editing, saving, opening the vault, syncing and deterministic status updates produce **zero** unsolicited model calls (model-port spy across lifecycle simulations). | I, UI, E | 3 (re-run every phase) | Not started |
| AC-C-2 | Explicitly run one extraction task: unrelated tasks do not run unless authorized dependencies; simulated failure + retry produce no duplicate records and keep successful results. | I, M | 4, 6 | Not started |
| AC-C-3 | Modify a source during a running task: stale results cannot mark the latest revision current or overwrite newer content. | I, M | 3, 4 | Not started |
| AC-S-1 | Every AI edit path creates a proposal first; before acceptance the primary manuscript body is byte-for-byte unchanged (for extraction, chat, translation, failed jobs, canceled jobs, stale commits, unapproved proposals). | I, M, architecture test | 2, 5 | In progress: guard refuses all manuscript writes; capability-gated apply tested; byte-equality of the chapter asserted for create/reject/failed-check/stale/summaries/proofreading (CI, mocked model); editor path untested in real Obsidian |
| AC-S-2 | Reject a proposal and preserve text; accept one and apply only the intended diff; stale/conflicting proposals cannot overwrite concurrent edits. | U, I, E | 5 | In progress: unit/integration pass (proposals.test.ts); E pending |
| AC-S-3 | Registration/promotion never rewrites the manuscript (body bytes identical); anchor-property mode verified body-intact. | I | 2 | Not started |
| AC-P-1 | Proofread paragraph by paragraph; preserve formatting and original text on failed calls; opaque blocks (code, tables, embeds) untouched. | U, M | 5 | Passed (CI, mocked model); real-model behaviour not evaluated |
| AC-P-2 | Reopen a synced pending review on another device. | I, D | 5 | Not started |
| AC-P-3 | Reviewed unchanged paragraphs stay current; edited paragraphs become pending; accepted corrections do not trigger an immediate reproofreading loop. | U, I | 5 | Not started |

## Knowledge and editor

| ID | Scenario | Types | Phase | Status |
|---|---|---|---|---|
| AC-K-1 | Extract summaries and character/location/object descriptions and history across chapters; repeated aliases map to one confirmed entity; ambiguous identity is reviewable. | M, R | 6 | Not started |
| AC-K-2 | Manual create/rename/merge/split/correct entity and event works, with redirects and reference updates. | U, I, UI | 6 | Not started |
| AC-K-3 | Rewrite a chapter to remove an extracted fact: unsupported evidence removed; other chapters' evidence and author-confirmed canon retained; manual info never silently overwritten (conflict raised). | U, I, M | 6 | Not started |
| AC-K-4 | Highlight extracted mentions; tap/click Philip → cross-chapter history in side panel without leaving the chapter (desktop + mobile). | UI, E, D | 6 | Not started |
| AC-K-5 | Disable plugin/highlights: prose unchanged (byte equality). Edit chapter: stale ranges never highlight the wrong text. | U, I, E | 6 | Passed (CI): highlights never write and are recomputed from current text; E pending |

## Search and agent

| ID | Scenario | Types | Phase | Status |
|---|---|---|---|---|
| AC-SR-1 | BM25 finds unique invented terminology; semantic retrieval finds a paraphrased passage; hybrid results carry valid references and linked entities/events. | U, I, R | 7 | Passed (CI, scripted embeddings): invented term found by keyword, paraphrase found by meaning only; real-embedding evaluation (R) not run |
| AC-SR-2 | Stale or missing embedding index disclosed; current keyword fallback works. | U, UI | 7 | Passed (CI) |
| AC-AG-1 | Agent answers a cross-chapter question with real supporting passage links and correct entity context; missing/unresolved evidence acknowledged. | M, R, UI | 11 | Not started |
| AC-AG-2 | Agent cannot edit manuscript or knowledge; tool-call limits and cancellation enforced; conversation persisted in book Markdown. | U, I, M | 11 | Not started |

## Temporal engine

| ID | Scenario | Types | Phase | Status |
|---|---|---|---|---|
| AC-T-1 | A before B, B three days before C, no absolute dates: relative order preserved; add an anchor → dependent dates calculated without inference; remove anchor → derived dates retracted. | U | 8 | **Met by simulation** (solver, store and panel tests: relative order kept, anchor derives dates, removal retracts) |
| AC-T-2 | Narrative order distinguished from world order in a time-travel/flashback fixture; personal chronology separate; no invented ordering between unrelated events. | U | 8 | Partial: narrative vs world lists and no invented order are tested; personal chronology and a time-travel fixture are not built |
| AC-T-3 | Contradictory constraints detected with evidence for manual resolution; duplicate event descriptions merged only when resolved; distinct repeated events preserved; references updated safely; visualization supports unresolved/approximate data. | U, I, UI | 8 | Partial: contradictions with evidence and approximate ranges are tested; event merge/identity and a graphical view are not built |
| AC-T-4 | Solver tests run independently of LLM extraction evaluations; agent receives computed chronology and uncertainty. | U, M | 8, 11 | Partial: solver tests need no model; the agent (Phase 11) does not exist |

## Writing assistance

| ID | Scenario | Types | Phase | Status |
|---|---|---|---|---|
| AC-W-1 | Character depth analysis yields specific evidence-linked findings and optional localized proposals; Find Contradictions retrieves conflicting passages and permits dismissal/intentional classification or reviewed correction. | M, R | 9 | Not started |
| AC-W-2 | Word counts and distributions match known fixtures; repeated adjectives identified language-aware (capability table honest); synonyms occurrence-specific, never replacing text without approval. | U, M | 9 | Not started |
| AC-W-3 | With no model endpoint reachable, all non-AI features (structure, statistics where feasible, timeline calculation, TODOs, publishing) work. | I, E | 2–12 | Not started |

## Translation

| ID | Scenario | Types | Phase | Status |
|---|---|---|---|---|
| AC-TR-1 | Create two target-language variants of one chapter without changing chapter identity/order; modify one source paragraph → variants pending without inference; user-triggered sync updates only affected content; handles insert/delete/move/split/merge and ambiguous mapping. | U, I, M | 10 | Not started |
| AC-TR-2 | Manually revise a translation, then edit its source: manual edit preserved, conflict flagged, primary untouched; missing/outdated required variants appear as TODOs. | U, I | 10 | Not started |

## Workflow and publishing

| ID | Scenario | Types | Phase | Status |
|---|---|---|---|---|
| AC-WF-1 | Configure two illustrations per chapter and required English translation: missing assets, planned/unfinished chapters, missing/stale translation, incomplete proofreading appear as actionable TODOs; completing conditions removes them; chapters without illustration requirement show no false warning. | U, I, UI | 3, 10, 12 | Not started |
| AC-PB-1 | Preview a chapter, adjust image size/position, formatting and page-break rules, reopen on another device and retain settings. | I, E, D | 12 | Not started |
| AC-PB-2 | EPUB and PDF exports use assigned order, selected language, assets, navigable TOC; internal knowledge/annotations do not leak; warn about incomplete content; deliberate draft export; no model calls during export; EPUB passes EPUBCheck; PDF inspected. | U, I, CI tools, D | 12 | Partial: EPUB order, TOC, no leak of properties/comments/wikilinks/embeds, warnings, draft export and no model call are tested by simulation; EPUBCheck, PDF and a real reader are not done |
| AC-DV-1 | Test the actual plugin on desktop **and** mobile: side panel navigation, editor highlights/diffs, Markdown persistence, remote local-model connectivity, search, preview, export. Each platform actually tested, failures and blockers documented; desktop browser emulation never substitutes. | D | 13 (incremental from 1) | Not started |

## Cross-cutting gates (every phase)

- Playbook gates: lint 0 errors/0 warnings; `build`; `test:cov` 100 %; `check:dead-code`; `lint:css`; `lint:deps`; `lint:cloud-parity`; `check-release --strict` before any tag.
- Layering test (`core` imports no `obsidian`/DOM/Node); write-call-site allow-list test; no-model-call spy in the lifecycle suite; secrets-not-in-notes test.
- Panel layout checked at 320/360/412 px at 1.3× text in Chromium and WebKit once UI exists.
