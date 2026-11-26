# Implementation status ledger

Last updated: 2026-11-26 (Phase 0 complete; no code written). Update this file at the end of every session/slice.

## 1. Where we are

| Phase | Name | Status | Notes |
|---|---|---|---|
| 0 | Discovery and documentation | **Done (this session)** | Docs written; open decisions recorded. Playbook docs partly unread — see DISCOVERY §1. |
| 1 | Scaffold, spikes S1–S8, compatibility proof | **In progress**: scaffold slice done (below); spikes not started | Unblocked (O-3 resolved). S4 needs O-1; S5/S7 need iPhone. |
| 2 | Core books/chapters/schemas/panel/write-gate skeleton | **In progress** | Done: ids, managed-note schema/parse/serialize, book registration + discovery + nesting refusal + isolation helper, `Register this note's folder as a book` command with modal. Also done: manuscript write guard skeleton (`GuardedVault` refuses every write to manuscript paths; no capability exists yet) + architecture tests (core purity, single write path, raw port only in guarded factory, no network API) with canary-verified failure. Also done (slice 4): deterministic TODO engine (unfinished chapters vs the book's own completion requirement, planned slots without files, missing notes, numbering gaps, ambiguous assignments) shown in the panel; book completion requirement property with default. Also done (slice 3): chapter records (designation, order, status, bound note or planned slot), promotion, planning, status/order/designation edits, reassignment/unlink, rename follow, conflict + gap detection, panel context resolution, side panel Overview (panel view, ribbon icon, command, debounced redraw, hidden-draws-nothing, failed reads shown not hidden), `styles.css`. **Not done:** capability-carrying proposal path (Phase 5), other panel tabs, settings/book-config split, demote-by-removing-slot, drag reordering, narrow-width/WebKit layout verification and any real-Obsidian run, manual entity shells, schema migrations framework. Desktop-only tests; not run in Obsidian. |
| 3 | Revisions, invalidation, jobs, TODO foundation | Not started | |
| 4 | AI infrastructure | Not started | O-1, O-2 open. |
| 5 | Proposal/diff/review, proofreading | Not started | |
| 6 | Summaries, entities, occurrences, highlights | Not started | |
| 7 | Search, embeddings, graph | Not started | |
| 8 | Temporal engine | Not started | O-5, O-9. |
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

Latest (Phase 2 slice 4, TODOs): 240 tests, 100 % on all four metrics; `check-release --with-build --strict` 52 passed, 0 failed. Earlier (slice 3): 231 tests, 100 % statements/branches/functions/lines; `check-release --with-build --strict` 52 passed, 0 failed. Earlier (slice 2): 173 tests, 100 % on all four metrics; build, lint, dead-code, cloud-parity, `check-release --with-build --strict` green. Earlier scaffold slice (2026-11-26, desktop toolchain only): `build`, `lint` (0/0), `lint:css`, `lint:deps`, `check:dead-code`, `test:cov` (129 tests, 100 % on 4 metrics), `lint:cloud-parity` (0 errors) and `check-release --with-build --strict` (49 passed, 0 failed, 0 warned) are green. 16 dev-toolchain advisories reported by `npm audit` (not shipped, non-blocking; review in the dependency-update pass). **Not yet run:** WebKit/Chromium layout jobs, any real Obsidian runtime (desktop or iOS).

## 8. Change log

| Date | Change |
|---|---|
| 2026-11-26 | Phase 2 slice 4: TODO engine + completion requirement + To do list in panel. |
| 2026-11-26 | Phase 2 slice 3: chapter registry core, panel model, Overview panel, rename tracking. UI is happy-dom tested only; never rendered in Obsidian. |
| 2026-11-26 | Phase 2 slice 2: GuardedVault + architecture tests (AC-S-1 partially: refusal proven at port level). |
| 2026-11-26 | Phase 2 slice 1: core ids, managed notes, book registry, register command; O-13 resolved. |
| 2026-11-26 | Spikes S1/S3/S6 desktop-side run; results in SPIKES.md; ADRs D-020..D-023, open O-13. |
| 2026-11-26 | Phase 1 scaffold: playbook templates applied (config, scripts, CI/release workflows, skills, hook, tests), minimal plugin (onload wrapper, crash guard, log level setting), README, LICENSE. O-1 (decision provider out of MVP) and Android (unverified) recorded. |
| 2026-11-26 | Author resolved O-3, O-4, O-6, O-7, O-11. |
| 2026-11-26 | Phase 0: read master prompt; inspected playbook and timeline plugin (`7f1611d`, v0.13.2); wrote AGENTS.md/CLAUDE.md and docs (SPEC, DISCOVERY, COMPATIBILITY, ARCHITECTURE, AI-AND-PROMPTS, MANUSCRIPT-PROTECTION, SEARCH-AND-AGENT, TEMPORAL-ENGINE, PUBLISHING, IMPLEMENTATION-PLAN, DECISIONS, RISKS, ACCEPTANCE, STATUS). No upstream repo modified. |
