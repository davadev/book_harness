# Phased implementation plan

All listed capabilities are V1 scope; staging is not permission to omit anything. The 13 phases of the master prompt (§20) are kept; Phase 0 (this discovery/documentation) precedes them. Every phase ends with: acceptance rows green (`ACCEPTANCE.md`), playbook gates green (lint 0/0, 100 % coverage, build, dead-code, release guard), `STATUS.md` + `DECISIONS.md` updated, a milestone report (implemented / tests run / reused / decisions / blockers / remaining), and a **BRAT prerelease** for real-device testing where the phase has UI or platform behaviour.

Slices are vertical and independently testable; no slice starts before the previous slice's tests are green. Requirement IDs refer to `SPEC.md`.

## Phase 0 — Discovery and documentation (this deliverable) ✔ in progress

Exit: repository discovery, reuse inventory, compatibility matrix, architecture, decisions/risks, acceptance map, status ledger written; open decisions listed. **No feature code.**

## Phase 1 — Scaffold, feasibility spikes, compatibility proof

Slices:
1. **Scaffold** per playbook "Adoption order" steps 0–5 (read the unread playbook docs first: RELEASE-CYCLE, REVIEW-PARITY, SUPPLY-CHAIN, TESTING, AI-AGENT-WORKFLOW, SETTINGS-AND-UPGRADE-UX, CSS-AND-THEMING, DOCS-AND-SCREENSHOTS): git repo, package/config/templates, empty plugin that loads/unloads on desktop, `onload` wrapper, crash guard (D-009), logger, device-local storage, settings skeleton, CI, prerelease workflow. Needs O-3.
2. **Spikes S1–S8** (COMPATIBILITY §3) on throwaway fixtures; results into `STATUS.md` spike log; ADRs for libraries (zip, PDF, Markdown parser, NLP, hashing, BM25).
3. **Architecture tests skeleton**: layering test (`core` imports), write-call-site allow-list test (gate not implemented yet but test infrastructure exists).
Exit: scaffold gates green; BRAT prerelease installs on author's iOS/Android/desktop and loads (platform log entries); spike decisions recorded; blockers O-1…O-12 triaged.

## Phase 2 — Core: books, chapters, schemas, identity, side panel, manual management

Slices: (a) `core/ids`, `core/markdown` managed-note parse/serialize with schema versions + validation + migrations framework; (b) `VaultPort` + **manuscript gate skeleton** (rejects all manuscript writes; only registration anchor capability stubbed) + architecture/byte-equality tests; (c) book registry (register/edit/remove multiple books, isolation), chapter slots (promote, designation, order, sparse numbering, planned slots, gaps, reassignment, demotion, conflicting assignment handling), rename/move tracking, writing status; (d) side panel shell: context resolution, inactive state + promote entry point, tabs (Overview with chapter list/gaps/planned), commands/ribbon/file menu; (e) settings (device/global) vs book config; (f) manual entity/event CRUD shells later reused.
Exit: ACCEPTANCE "Structure and portability" rows 1–2 green (two books, promotion/order/gaps/rename); write gate proven; panel works at 320/360/412 px.

## Phase 3 — Revisions, invalidation, job state, TODO foundation

Slices: revision hashing + registry of source revisions; dependency graph + fingerprints + stale propagation; job ledger + state machine + authorization records (no model yet; fake tasks); deterministic TODO derivation engine + dashboard (planned/unwritten/gaps/status); divergence/conflict detection (`bh_rev/bh_parent`), operation journal, folder-copy portability test; snapshot store with retention (O-10); manual author TODOs.
Exit: ACCEPTANCE copy-folder row (partial: structure, pending state), "zero unsolicited model calls" test (model port spy), stale-job commit rejection, dedupe tests, TODO add/remove behaviour on config.

## Phase 4 — AI infrastructure

Slices: provider ports (generation, embedding, decision) + Ollama adapter via `requestUrl`; connection test + capability discovery + typed errors; secrets and device bindings; prompt registry + override notes + validation; structured-output pipeline (`extractJsonObject`, normalise, grounding validation, one repair, transport retry); bounded orchestration (concurrency, timeouts, cancellation, resumable, interruption); diagnostics view; disclosure/authorization UI; decision-provider surface (O-1) with test double; mobile endpoint documentation; mock model + opt-in real eval harness.
Exit: scripted-failure tests (malformed, timeout, abort, stale), injection fixture for prompt validation, real Ollama contract capture (S5) on desktop and phone.

## Phase 5 — Proposal/diff/review gate, segmentation, proofreading

Slices: `core/diff`; proposal store + gate capabilities + rebase; CM6 review state field (desktop first, then S2-validated mobile) with accept/reject/bulk-with-disclosure; undo integration; segmentation engine; proofread task + coverage ledger + modes; resulting-revision exemption; cross-device reopen.
Exit: ACCEPTANCE "AI control and manuscript safety" rows all green; manual desktop undo check and mobile touch check recorded.

## Phase 6 — Summaries, entities, reconciliation, occurrences, annotations

Slices: chapter summary task + overview note; extraction tasks (characters, places, objects/tech/spacecraft, extensible categories) with grounding; entity notes + manual CRUD + merge/split + redirects; identity resolution (aliases, hybrid candidates later wired to Phase 7, review tasks, persisted decisions); reanalysis reconciliation incl. author-canon protection; author-established facts and kinds (stated/claimed/…); occurrence mapping + anchors + range remap; CM6 highlights (+ Reading mode per S2/O-12), tap → side panel, filters, pin, manual link/unlink; disable-plugin invariance test.
Exit: ACCEPTANCE "Knowledge and editor" rows green.

## Phase 7 — Search, embeddings, graph

Slices: passage segmentation; BM25 incremental; embedding generation job + index store + freshness states; RRF; hybrid API with refs/provenance; graph materialisation + traversal + expansion; search UI tab; BM25-only fallback; evaluation fixtures.
Exit: ACCEPTANCE "Search" rows (BM25, semantic, stale disclosure) green; mobile build/query timings recorded.

## Phase 8 — Temporal engine (iterative; independent track)

Stages per TEMPORAL-ENGINE §7: narrative view → extraction/evidence store → constraint model + solver → cross-chapter identity/reconciliation → non-linear/personal chronology → correction UI; timeline renderer reuse (S7, O-5); fixtures corpus; extraction evaluation suite separated from solver tests.
Exit: ACCEPTANCE "Temporal engine" rows green; agent-facing resolved-chronology API.

## Phase 9 — Literary analysis, contradictions, statistics, synonyms

Slices: character depth task + findings store + optional proposals; contradiction investigation (plan → retrieve → compare → findings; author decisions with evidence revisions; reopen on relevant new evidence); statistics (word frequency, adjective analysis per S3 capability table, local clustering, normalisation, stopwords/ignored terms, extra metrics) + navigable UI; contextual synonym task with per-occurrence choice via proposal gate.
Exit: ACCEPTANCE "Writing assistance" rows green.

## Phase 10 — Translation

Slices: variants + language config + status; segment alignment with persistent mapping and baselines; stale marking; incremental sync (add/remove/modify/move/split/merge); three-way manual-edit conflicts + review UI; glossary; translation TODOs; export hooks.
Exit: ACCEPTANCE "Translation" rows green.

## Phase 11 — Conversational agent

Slices: read-only tool registry; bounded loop with limits/cancel; citation verification; graph + temporal enrichment; Markdown chat persistence; chat tab.
Exit: ACCEPTANCE agent rows green; write-tool absence tests; injection tests.

## Phase 12 — Publishing

Slices: Document IR + Markdown→IR; layout metadata store + anchors; preview (EPUB-like reflow, PDF-like paginated); illustrations editing; validation report + draft export; EPUB assembly + EPUBCheck CI; PDF assembly per S1/O-8; TOC; export UI; sentinel-leak and no-model-call tests.
Exit: ACCEPTANCE "Workflow and publishing" rows green, including real-device export.

## Phase 13 — Integration, portability, performance, accessibility, recovery, packaging, docs

Cross-device portability scenario; performance budgets on a long synthetic book; accessibility pass (keyboard, screen-reader labels, non-colour indicators, contrast); recovery tooling (inspect/repair managed state, backups/restore); example book with nonlinear events; user documentation (setup, mobile model connectivity, prompts, sync, recovery, limitations); release `0.x.0-beta` → stable only on explicit instruction; final platform test log.

## Cross-cutting tracks

- **Docs track:** every slice updates STATUS/DECISIONS/ACCEPTANCE.
- **Quality track:** coverage ratchet, BUG-HUNT skill before stable releases, WebKit+Chromium layout jobs for panel/preview.
- **Fixtures track:** synthetic fixture books maintained in `fixtures/` (example nonlinear book, two-book vault, proofreading, translation, temporal, search relevance).
