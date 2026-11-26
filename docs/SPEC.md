# Requirement register

Traceability of the **confirmed requirements** in `BOOK_HARNESS_MASTER_PROMPT.md` (the authoritative spec; this register summarises and never replaces it). Design choices are in `DECISIONS.md`; deferred improvements are only those the master prompt itself marks optional/recommended. **Nothing has been removed or reduced.** Wording: *must* = required; *recommended* = spec says "recommended/optional" (still planned unless noted in DECISIONS).

Status values: `Not started` · `Designed` (docs only) · `In progress` · `Implemented` (code, unit-tested) · `Verified` (acceptance rows green and platform log entries) · `Blocked`. As of 2026-11-26 every row is `Designed` or `Not started`; `STATUS.md` is the live ledger.

Phase column refers to `IMPLEMENTATION-PLAN.md`.

## Invariants (§2) — apply to every phase

| ID | Invariant | Enforcement mechanism | Tests |
|---|---|---|---|
| INV-1 | No AI prose edit without explicit revision-safe accept/reject; central, non-bypassable | Write gate (D-005) | AC-S-* |
| INV-2 | No links/markers/annotations/publishing clutter in prose; minimal ID property only if necessary | Registry-first identity; external records | AC-K-5, AC-S-3 |
| INV-3 | Chapter membership/designation/order author-defined | Registry; never infer from names/times | AC-ST-2 |
| INV-4 | No inference on save/startup/sync/indexing/editing; user-initiated bounded workflows only | Authorization records; model-port spy | AC-C-1 |
| INV-5 | Small independent prompts; failure isolation | Task registry/jobs | AC-C-2 |
| INV-6 | Models extract; software orders/validates/calculates | Temporal engine, TODOs, stats | AC-T-* |
| INV-7 | Essential state in vault Markdown; rebuildable caches | Layout in ARCHITECTURE §3 | AC-ST-3 |
| INV-8 | Native Obsidian integration | CM6 extensions, side panel | UI tests |
| INV-9 | Grounding & provenance; no fabrication | Evidence records, grounding validation | AC-K-*, AC-AG-* |
| INV-10 | Non-AI features work offline from AI | Port design; offline test suite | AC-W-3 |
| INV-11 | Multi-book isolation | `BookScope` everywhere | AC-ST-1 |
| INV-12 | Desktop + mobile from day one | Compatibility matrix, spikes, platform log | AC-DV-1 |

## §3 Book registration and chapter structure — Phase 2 (Phase 3 for status-derived items)

| ID | Requirement |
|---|---|
| REG-1 | A book lives in an author-selected vault folder; register multiple independent books; manage book configurations. |
| REG-2 | Promote existing Markdown notes to chapters explicitly; no moving/rewriting manuscript files merely to register. |
| REG-3 | Assign designation (Prologue, Chapter 1, Chapter 15, Epilogue, …) and an unambiguous logical order. |
| REG-4 | Stable book, chapter and note identities independent of names/paths. |
| REG-5 | Safe handling of renames/moves, reassignment, demotion and conflicting assignments. |
| REG-6 | Sparse numbering; planned chapters with no file; distinguish known gaps from explicitly planned slots; author can plan missing/trailing chapters and correct the plan. |
| REG-7 | Chapters may be written out of order. |
| REG-8 | Author-controlled writing status (planned/not started, drafting, written, revising, finalized); never inferred from word count or AI. |
| REG-9 | Translations are variants of the same logical chapter, not extra chapters. |
| REG-10 | Book config: primary language, target languages, completion requirements, publication defaults. |

## §4 Native UI and interaction — Phase 2 onward (each tab with its feature phase)

| ID | Requirement |
|---|---|
| UI-1 | Single context-aware side panel adapted for desktop and touch/mobile; activates for registered chapters and managed notes (entities, overview, configuration, translations, conversations, …). |
| UI-2 | Unrelated notes show an inactive state, with a minimal explicit register/promote entry point. |
| UI-3 | Discoverable ways to open the book overview and promote/register a note without circular activation dependencies. |
| UI-4 | Tabs: Overview, Entities, Timeline, Writing/Review, Translation, Search/Chat, Tasks/Progress, Publishing (grouping adaptable to playbook/mobile). |
| UI-5 | Context-specific actions, status indicators, navigation, pending work and review queues easy to find. |
| UI-6 | Obsidian plugin settings for device/global config; book-specific config lives with the book. |
| UI-7 | Main editor used for inline entity highlights, manuscript diffs and chapter publishing preview. |
| UI-8 | Preserve editing position and focus where appropriate. |
| UI-9 | Theme-aware accessible colours **and** non-colour indicators; touch interaction; narrow screens; cancellation of long jobs. |

## §5 Markdown persistence and state ownership — Phases 2–3, applies throughout

| ID | Requirement |
|---|---|
| PER-1 | Persist in vault Markdown: manuscripts, registry/config, chapter assignments/statuses, summaries, entity notes, events/constraints, relationships/occurrence mappings, translation associations and segment revisions, author facts/decisions, task revision state, unresolved proposals, publication formatting, required languages/illustrations, prompt overrides, chat histories. |
| PER-2 | Readable notes; YAML properties and native links in managed notes; bulky machine records in dedicated managed notes; no hidden markers in manuscript prose. |
| PER-3 | Stable IDs, schema versions, migrations, validation, safe writes, recovery/reconciliation. |
| PER-4 | Distinct AI-managed and author-managed sections/records; preserve user content. |
| PER-5 | Manuscript is authoritative evidence of what is written; author-established canon recorded separately; conflicts resolved explicitly. |
| PER-6 | Derived indexes/vectors/caches rebuildable from portable sources. |
| PER-7 | Device-specific endpoints/credentials/transient caches/UI prefs may be local; no secrets in synced notes; selected logical model/prompt configs portable with device-specific bindings. |
| PER-8 | Sequential cross-device work; detect divergent revisions and sync conflicts; never silently overwrite. |
| PER-9 | Reconstruct pending work on startup without inference. |
| PER-10 | Book folder copied to another configured installation (without `.obsidian`) retains essential knowledge, review state and workflow. |
| PER-11 | Document dependencies on external attachments; support portable book assets. |

## §6 Revisions, dependencies, controlled jobs — Phase 3 (+ Phase 4 for model execution)

| ID | Requirement |
|---|---|
| JOB-1 | Source snapshots/revisions and per-task input fingerprints (dependency revisions, prompt, model config). |
| JOB-2 | Automatic invalidation of outdated derived data without inference; before analysis claim only "potentially stale". |
| JOB-3 | Independent states: not processed, current, pending/stale, queued/authorized, running, failed, canceled, review required, conflict. |
| JOB-4 | Persist resumable state; deduplicate repeated saves. |
| JOB-5 | User selects individual tasks or explicit batch; display scope, progress, errors, cancellation. |
| JOB-6 | Bounded concurrency, timeouts, schema validation, controlled retries. |
| JOB-7 | Handle interruption, network loss, mobile suspension; resume only within valid authorization or request a new trigger. |
| JOB-8 | Stale job output cannot be marked current for a newer revision. |
| JOB-9 | Idempotent, revision-checked commits; independent tasks keep results when another fails. |
| JOB-10 | Reanalysis reconciles chapter-sourced evidence: remove/invalidate unsupported facts/occurrences/events; retain other chapters' evidence; protect author-confirmed facts/decisions; flag conflicts. |
| JOB-11 | Propagate invalidation through summaries, entity histories, temporal constraints, translations, proofreading coverage, embeddings, findings. Deterministic recalculation needs no model call. |

## §7 AI infrastructure — Phase 4

| ID | Requirement |
|---|---|
| AI-1 | Independently configurable generation, embedding and decision providers. |
| AI-2 | Generation and embedding via Ollama (per playbook manual — see O-2); connection tests, capability discovery where practical, clear errors, default models, per-task overrides. |
| AI-3 | Jeff-style decision provider returning probabilities over supplied alternatives (incl. abstention/unknown); investigate the actual serving interface (O-1); no mandatory use case; functional surface + tests. |
| AI-4 | Mobile: model on a reachable author-controlled machine; no assumption of Ollama on phone or that localhost is the desktop; document endpoint setup, permissions, transport/security, disconnected behaviour; no cloud requirement or silent fallback. |
| AI-5 | Registry of focused built-in prompt defaults with editable Markdown overrides; validated, versioned, provenance; prompt text cannot override authorization/write restrictions. |
| AI-6 | Structured input/output contracts, schema validation, source grounding, chunking and context limits per task. |
| AI-7 | Inspectable diagnostics (task, prompt version, model, timing, errors; optional input/output inspection with privacy controls). |
| AI-8 | No single huge prompt; manuscript/retrieved text is data, not instructions; bounded output; malformed responses cannot damage data. |

## §8 Story knowledge and entity extraction — Phase 6

| ID | Requirement |
|---|---|
| KNW-1 | Specialised single-purpose tasks: chapter summary; character extraction; character descriptions/history; location extraction/descriptions; object/technology/spacecraft extraction/descriptions; event extraction; temporal evidence extraction. |
| KNW-2 | Managed book overview note with summaries in logical order, missing/planned chapters shown. |
| KNW-3 | Entity notes for characters, places, objects, technology, spacecraft, extensible categories; stable ID, canonical name, aliases, descriptive properties, sourced history across chapters, relationships, temporal evidence. Type-specific property sets (locations: appearance/geography/layout/atmosphere; objects: appearance/properties/capabilities/limitations/ownership/usage/changes; characters: appearance/background/actions/motivations/development). Events are first-class identities. |
| KNW-4 | Resolve existing identities before creating duplicates (exact names/aliases, context, hybrid retrieval, optional model-assisted candidate comparison); names alone never equate identity; repeated mentions vs repeated distinct events; uncertain matches become author review tasks. |
| KNW-5 | Full manual entity/event management: create, rename, edit, link, merge, split, correct, delete/detach safely, resolve ambiguous references; stable redirects/transactional reference updates on merge/split; preserve author-confirmed identity decisions; no repeated prompts absent new conflicting evidence. |
| KNW-6 | Author-established facts not yet in manuscript; distinguish author canon, stated facts, character claims/beliefs, reader revelation position, character knowledge where available; rumours/dreams/lies/unreliable narration not objective fact without evidence; temporal changes in properties; no invented knowledge. |

## §9 Entity occurrence annotations — Phase 6

| ID | Requirement |
|---|---|
| OCC-1 | Track extracted occurrences: stable entity ID, source revision, text range, contextual anchors. |
| OCC-2 | Type-coloured clickable highlights in the native Markdown editor without changing text; investigate editor decoration APIs and Reading-mode integration on desktop and mobile. |
| OCC-3 | Click/tap opens entity content/history/timeline in side panel while chapter stays open; entity note can also be opened normally. |
| OCC-4 | Highlighting is evidence of recognised occurrences, not completeness. |
| OCC-5 | External portable occurrence metadata; deterministic range remap after edits where reliable; ambiguous range invalidated, never mis-highlighted; extraction marked pending, never auto-run. |
| OCC-6 | Correct wrong associations; manually link missed occurrences without wiki links in prose. |
| OCC-7 | Controls: toggle highlights, filter by category, pin an entity, navigate source references (recommended). |
| OCC-8 | Coexist with diff review, selections, typing, mobile touch. |

## §10 Manuscript protection and review — Phase 5 (skeleton Phase 2)

| ID | Requirement |
|---|---|
| PRO-1 | All AI-originated manuscript edits through a single proposal/review/apply mechanism recording source snapshot, proposed text, exact ranges, source revision, originating action, rationale. |
| PRO-2 | Deterministic diffs; additions/deletions/replacements rendered in the native editor with clear colour and individual accept/reject; original untouched until accept; rejection preserves. |
| PRO-3 | Bulk acceptance optional, explicit, scope disclosed; no implicit acceptance. |
| PRO-4 | Validate current revision and affected text before applying; rebase only when unambiguous, else conflict review; never apply stale proposals by raw offset. |
| PRO-5 | Persist unresolved proposals across restart/device sync. |
| PRO-6 | Accepted changes use the same revision/dependency tracking as manual edits; undo/recovery consistent with Obsidian. |
| PRO-7 | Architectural (not prompt) write gate; tests prove extraction, chat, translation, failed jobs and unapproved proposals cannot mutate prose; registration metadata and manual editing are distinct. |

## §11 Proofreading — Phase 5

| ID | Requirement |
|---|---|
| PRF-1 | Proofread action in Writing tab; capture source revision; segment into paragraphs or structurally safe blocks. |
| PRF-2 | Paragraph-by-paragraph processing with dedicated grammar prompt; preserve formatting, links, dialogue, fictional terms, names, meaning, content, voice; no whole-chapter rewrites; no silent omission. |
| PRF-3 | Failed paragraph retains original; bounded handling of long paragraphs, no silent truncation. |
| PRF-4 | Original and proposed snapshots; shared review service. |
| PRF-5 | Paragraph-level coverage tracking incl. no-change results, unresolved proposals, decisions, source revisions; reviewed = all proposals decided or none needed (rejection counts). |
| PRF-6 | Manual edits invalidate affected segments only; unchanged reviewed segments stay reviewed; applying approved corrections does not immediately invalidate the just-reviewed result. |
| PRF-7 | Proofread only pending/new/modified segments; deliberate reruns. |

## §12 Literary analysis and contradictions — Phase 9

| ID | Requirement |
|---|---|
| LIT-1 | User-triggered Character Depth Analysis: current chapter, selected character across chapters, or chapter enriched with character notes/history/relationships/passages/temporal context. |
| LIT-2 | Source-linked findings distinguishing subjective judgement from fact; optional small localized edit proposals via the gate; proposed motivations not canon before acceptance. |
| LIT-3 | Find Contradictions: chapter and whole-book scopes; hybrid search, entity graph, passages, resolved timeline; decomposed focused tasks; flags both passages with uncertainty; distinguishes conflict vs intentional change/unreliable narration/time travel; optional reviewed resolution proposals. |
| LIT-4 | Author can dismiss, defer, confirm, mark intentional; decisions preserved with evidence revisions; reopen only on relevant new evidence; never claim exhaustive detection. |
| LIT-5 | Extensible analytical actions with own prompt, retrieval, output contract. |

## §13 Statistics and vocabulary — Phase 9

| ID | Requirement |
|---|---|
| STA-1 | Deterministic word distribution/frequency at book, chapter, local passage scope. |
| STA-2 | Frequently used/locally clustered adjectives; language-aware tokenisation, POS tagging, optional lemmatisation; evaluate mobile-compatible NLP; distinguish true classification from heuristic guesses. |
| STA-3 | Length normalisation; stopwords and ignored fictional terms; frequency not treated as a defect. |
| STA-4 | Additional metrics recommended (unique words, adverbs, repeated phrases, sentence/paragraph lengths). |
| STA-5 | Present statistics with navigable occurrences. |
| STA-6 | Explicit-request contextual synonym generation per occurrence (sentence/paragraph, language, inflection, tone, meaning); author keeps original or selects per occurrence; no blind global replacement; AI replacements via the review gate. |

## §14 Translation — Phase 10

| ID | Requirement |
|---|---|
| TRN-1 | One primary language and multiple target languages per book; separate managed Markdown variants linked to the same chapter ID; explicit language selection and status indicators. |
| TRN-2 | Analyze knowledge from primary chapters only. |
| TRN-3 | Dedicated translation prompts; paragraph/block segmentation; persistent source-target mappings and last-synchronised snapshots/revisions; preserve Markdown, images/references, names, terminology, voice, meaning; neighbouring context and terminology read-only; per-language glossary recommended. |
| TRN-4 | Primary changes mark translations stale without inference. |
| TRN-5 | Explicit synchronisation identifies added/removed/modified/moved/split/merged segments; updates affected target segments only; not index-based; ambiguous mapping becomes a review conflict. |
| TRN-6 | Preserve manual translation edits via source/target baselines or three-way comparison; conflicts presented, not overwritten; automatic application only for safe non-conflicting updates after explicit authorization. |
| TRN-7 | Primary manuscript never overwritten by translation. |
| TRN-8 | Persist alignment and conflict state; missing/stale variants appear as TODOs; export/preview select a language edition without mixing or auto-translating. |

## §15 Hybrid search and graph — Phase 7

| ID | Requirement |
|---|---|
| SRC-1 | Book-scoped reusable search over primary passages and managed knowledge; BM25 + embeddings; exact names/fictional terms discoverable; rank fusion (RRF evaluated), normalised scores; stable passage refs, snippets, revisions, provenance, linked entities/events. |
| SRC-2 | Deterministic segmentation; revision-aware indexing; BM25 auto-updates; embeddings require explicit authorization; query embedding within a user-initiated query is authorized; stale-corpus rebuild is separate unless included; display freshness; degrade to current keyword retrieval; mark incompatible embeddings stale on model change; disposable, rebuildable, isolated by book and language; no separate DB server unless justified. |
| SRC-3 | Logical knowledge graph from Markdown records (books, chapters, passages, entities, events, occurrences, descriptions, facts, evidence, relationships, temporal constraints); native links may enrich managed notes; manuscript annotations external; traversal and bounded context expansion; observed vs inferred edges with provenance/freshness; in-memory/local representation acceptable. |

## §16 Temporal intelligence — Phase 8

| ID | Requirement |
|---|---|
| TMP-1 | LLM extracts; harness identifies, validates, resolves, orders, renders; never an LLM-produced authoritative global order. Do not require absolute timestamps. |
| TMP-2 | Narrative timeline (reader's order, deterministic without world dates; references to an event ≠ the event) and world timeline (in-universe chronology incl. time travel/flashbacks/approximate/unknown dates; not from chapter numbers). |
| TMP-3 | Character-specific experienced order in the data model; constraints scoped to the right chronology and participant/instance; projections in entity/timeline views; not conflated with reading order. |
| TMP-4 | Stable event IDs; aliases, references, evidence across chapters; candidates may match/new/clarify; similarity ≠ identity; recurring events not merged inadvertently; manual create/correct/merge/split/confirm; reviewed decisions preserved; references/constraints updated safely. |
| TMP-5 | Assertions with source passage, revision, dimension, uncertainty, provenance; author-confirmed and calculated separated; reanalysis removes unsupported chapter-sourced assertions only; unresolved references explicit. |
| TMP-6 | Deterministic constraint engine: absolute dates/times, ranges, approximate periods, before/after, simultaneity, relative offsets, durations, overlaps, unknowns; precision/units preserved (year ≠ day); abstract/relative time; documented calendar representation; unresolvable calendar expressions explicit. |
| TMP-7 | Graph/constraint algorithms; partial orders valid; no invented ordering; uncertainty visualised; anchor addition recalculates derivables; evidence removal retracts consequences; conflicts/cycles/ambiguous anchors detected with source evidence for author resolution; no silent discard; time travel not a contradiction in experienced ordering. |
| TMP-8 | Development order: narrative first, then extraction, relative constraints, reconciliation, non-linear/personal chronology, correction UI. Fixture corpus and separate extraction vs solver evaluation. Expose resolved timeline + uncertainty to the agent. Reuse timeline plugin visualisation where compatible. |

## §17 Conversational agent — Phase 11

| ID | Requirement |
|---|---|
| AGT-1 | Dedicated Chat tab; conversations saved as managed Markdown notes tied to the right book; separate from controlled single-purpose actions. |
| AGT-2 | User initiation authorises a bounded read-only tool loop with visible progress, cancellation, call limits, clear errors; no background actions; no write tools for manuscript/knowledge/translations; retrieved text untrusted. |
| AGT-3 | Tools: hybrid search, read passage/chapter, structure, entity/description/history/occurrences/relationships, chapter summary, event/timeline, processing status; iterative retrieval and graph context expansion; context budgets, dedupe, source-aware selection. |
| AGT-4 | Answers across whole book or selected scope; clickable citations to passages and records; prefer primary evidence; label canon vs reader revelation vs character knowledge; warn on stale/missing/unresolved; no claim of exhaustiveness; computed chronology only; persist conversations with source refs and model metadata, no secrets. |

## §18 TODOs and completion — Phase 3 foundation, extended by features

| ID | Requirement |
|---|---|
| TDO-1 | Book-wide outstanding-work view, distinct from but integrated with the AI job system. |
| TDO-2 | Author-configurable requirements: planned/written chapters, proofreading/review, min illustrations per chapter (book default + per-chapter override), required target languages and sync; optional summaries, extraction, timeline, publication layout; not forced on books that do not need them. |
| TDO-3 | Author-controlled chapter status independent of task completion; planned chapters without files, unfinished chapters, gaps visible. |
| TDO-4 | Paragraph-level proofreading coverage and unresolved proposals; illustration counting from actual layout (broken/missing refs don't count); missing/outdated translation variants; unresolved identity/temporal decisions and findings; stylistic suggestions distinguished from mandatory. |
| TDO-5 | TODOs derived deterministically, deduplicated, removed on resolution; author tasks, processing tasks, review tasks with correct navigation/actions; progress dashboard and chapter completion matrix (recommended), usable on small screens; manual author TODOs (recommended); no inference; state reconstructible after restart/sync. |

## §19 Publishing — Phase 12 (spikes Phase 1)

| ID | Requirement |
|---|---|
| PUB-1 | Chapter publishing preview in the main view/workspace; formatting controls in side panel; desktop and mobile. |
| PUB-2 | Illustration arrangement (placement, size, alignment, captions), formatting, typography, paragraph spacing, page breaks; layout instructions external in portable managed Markdown; stable block anchors; stale/ambiguous mapping detection and author correction; preserve Markdown and assets. |
| PUB-3 | Book-wide templates with chapter overrides (recommended); format-specific page size/margins, headings, chapter breaks, fonts, line spacing, indentation, image layout; optional front/back matter. |
| PUB-4 | Shared rendering model for preview and export; no claim of identical EPUB/PDF pagination; responsive EPUB preview and paginated PDF preview; communicate unsupported EPUB rules and page-break limits; fixed-layout EPUB not required. |
| PUB-5 | Whole-book export in assigned order, selected edition, formatting, assets; generated navigable TOC (EPUB nav; PDF links/bookmarks as supported); metadata (title/author/language…); optional cover/copyright/dedication/acknowledgements (recommended); no internal notes/overlays/proposals/chats/hidden metadata in output. |
| PUB-6 | Deterministic, no-AI export; validation of missing/unwritten chapters, stale/missing translations, unresolved proposals, missing images, completion requirements; deliberate draft export with explicit warnings; no silent omission/language mixing/AI jobs; documented handling of gaps; images/fonts packaged/rendered correctly; licensing/embedding respected. |
| PUB-7 | Investigate mobile-compatible EPUB packaging and PDF rendering before choosing libraries (no Electron `printToPDF`, child processes, Pandoc); validate with EPUB conformance checks and PDF inspection plus real runtime tests; if desktop/mobile parity infeasible, document and obtain a decision. |

## §20–22 Plan, acceptance, definition of done

| ID | Requirement | Where |
|---|---|---|
| DOD-1 | Buildable, installable plugin following the playbook | Phases 1, 13 |
| DOD-2 | Tests and fixtures (synthetic; mocks never labelled as model quality; opt-in real-model evals recorded) | Continuous |
| DOD-3 | Setup/user docs; known limitations; migration/recovery guidance; maintained implementation status | Phase 13 + continuous |
| DOD-4 | Documentation of model connectivity (desktop/mobile), prompt/model override configuration, sync of book data, inspection/recovery of managed Markdown | Phase 13 |
| DOD-5 | Compact example book with nonlinear events for end-to-end testing | Phase 13 (fixtures from Phase 2) |
| DOD-6 | Milestone reports: implemented / tests run / reused / decisions / blockers / remaining | Every phase |
| DOD-7 | Out of scope (not required, not to be built): autonomous chapter generation, autonomous background inference, cloud services, real-time collaboration, external graph/vector DB, illustration generation, perfect AI extraction. These boundaries never justify removing confirmed V1 features. | — |
