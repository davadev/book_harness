# Decision log

Status values: **Accepted** (fixed by the master prompt or playbook, or agreed), **Proposed** (my recommendation; proceeds unless the author objects — each names the phase where it becomes binding), **Open** (needs the author or a spike; blocks the named work). Confirmed requirements live in `SPEC.md`; this file holds *design choices, trade-offs and unresolved questions*.

## Accepted

| ID | Decision | Basis |
|---|---|---|
| D-001 | TypeScript + esbuild + vitest 5 + eslint-plugin-obsidianmd, `isDesktopOnly: false`, `minAppVersion 1.13.0`, declarative settings, playbook pins for `obsidian` and CodeMirror. | Playbook templates; master §2.12 |
| D-002 | Markdown is the source of truth; managed state in a `_book-harness/` folder inside the book folder, one record per note where independently edited; derived indexes in plugin folder, disposable. | Master §5, invariant 7 |
| D-003 | Layering: `core` (pure) / `platform` (only importers of `obsidian`) / `ui`; ports for vault, network, model, clock, storage. | Timeline plugin architecture; testability for 100 % coverage |
| D-005 | Manuscript write gate is a single module with branded capabilities, static lint + architecture test enforcement, runtime byte-equality tests. Skeleton lands in Phase 2. | Master invariant 1, §10 |
| D-006 | No cloud services and no silent provider/endpoint fallback; device bindings (endpoint, secret name) are per-device, never in synced notes. | Master §7, §5 |
| D-008 | Docs are maintained continuously (`AGENTS.md` protocol): every slice updates STATUS/DECISIONS/ACCEPTANCE. | Master §1 |

## Proposed (binding at the named phase unless the author objects)

| ID | Decision | Rationale / alternatives | Binds at |
|---|---|---|---|
| D-004 | `tsconfig` `lib: [DOM, DOM.Iterable, ES2018]`; esbuild `target es2020` syntax only if S6 confirms WebView floor, else `es2018`. Playbook template `lib` contradicts MOBILE-RULES; follow MOBILE-RULES. | ES2018 API floor is a field lesson (iOS/Android WebViews). | Phase 1 scaffold |
| D-007 | AI error handling: one schema-repair call per model call (playbook) **plus** separately bounded transport retries with backoff; disclosure shows scope/endpoint/text categories (no cost estimate for local models). | Reconciles playbook with master "controlled retries". | Phase 4 |
| D-009 | Adopt playbook crash-loop guard (indexing/hash at startup raises the risk). | Mobile lock-out incident. | Phase 1 |
| D-010 | Chapter/note identity: registry-first binding (no manuscript write), rename tracking, hash/snippet re-bind with author confirmation; optional per-book opt-in anchor property. Pending author confirmation as O-4. | Reconciles "don't rewrite on register" with "minimal ID properties permissible". | Phase 2 |
| D-011 | BM25 maintained incrementally after `onLayoutReady` (chunked, yielding, never in `onload`), full rebuild user-initiated; in-house BM25 unless ADR shows a maintained library is smaller/safer; vectors brute-force cosine in typed arrays. | Playbook startup rule vs "BM25 updates automatically". | Phase 7 |
| D-012 | Revision hash = SHA-256 of normalized body (S6 decides `crypto.subtle` vs pure-JS fallback); stored in managed notes (`bh_rev`) for divergence detection. Never mtime. | Playbook: do not trust clocks. | Phase 3 |
| D-013 | Transport: `requestUrl` default everywhere; desktop-only streaming via `fetch` optional. | Playbook AI-FEATURES §7; mobile constraint. | Phase 4 |
| D-014 | Temporal solver = simple temporal network (difference constraints, interval bounds, negative-cycle detection with evidence) + qualitative relation layer; own precision-carrying time type; Gregorian + abstract time in V1. | Deterministic, explainable, partial orders. | Phase 8 |
| D-015 | EPUB via pure-JS ZIP + own XHTML generation from a Document IR; EPUBCheck in CI. PDF library chosen after S1. | No native binaries on mobile. | Phase 1 (S1) / 12 |
| D-016 | Timeline renderer reused as vendored copy with provenance header + divergence log, behind a new axis interface (see O-5). | Reuse without modifying upstream. | Phase 8 |
| D-017 | Every managed record carries `bh_schema`, `bh_id`, `bh_book`, `bh_rev`; forward-only idempotent migrations with old-shape fixtures; backups of plugin data per playbook DATA-SAFETY. | Master §5 | Phase 2 |
| D-018 | Per-segment proofreading coverage keyed by text hash first, then position with anchors; resulting-revision exemption after accept. | Master §11 | Phase 5 |
| D-019 | Chat/agent tools are read-only by construction (tool registry has no write verb; type-level and runtime test). | Master §17 | Phase 11 |

## Open — need the author or a spike

| ID | Question | Why it matters | Needed by | Recommended answer |
|---|---|---|---|---|
| ~~O-1~~ | **Jeff-style decision provider:** what is the serving interface (HTTP shape, auth, how alternatives are passed, probability format, abstention)? Not found in any local document. | Spec §7 requires a functional integration surface and tests; cannot be built from assumption. | Phase 4 | Author supplies endpoint docs or a sample request/response (synthetic); meanwhile implement `DecisionModel` port + test double. |
| O-2 | Ollama integration reference: the playbook has no Ollama/embedding manual (only `AI-FEATURES.md`). Use Ollama's official API docs (verify upstream: `/api/chat` structured `format`, `/api/embed`, `/api/tags`, `/api/show`)? Is there an additional private manual? | Spec says "using the playbook manual". | Phase 4 | Treat Ollama's official docs as the reference; record versions tested. |
| ~~O-3~~ | Project housekeeping: plugin `id`/display name (playbook: no "obsidian" in id; name not ending in "Plugin"), GitHub repo location, licence, `git init` of `~/Documents/book_harness`, whether CI/release templates are wanted from day one. | Needed to scaffold and cut prereleases. | Phase 1 | id `book-harness`, name "Book Harness", private repo `davadev/book-harness`, MIT unless told otherwise. |
| ~~O-4~~ | **Chapter identity vs "do not rewrite manuscripts":** registry-only binding (rename-tracked, hash re-bind recovery) with *optional* opt-in anchor property `bh_id`? Or require the property for robustness? | Spec both forbids rewriting on register and permits minimal ID properties. Registry-only breaks if files are renamed outside Obsidian while sync is offline. | Phase 2 | Registry-first, optional opt-in anchor property per book, recovery by hash/snippet with author confirmation. (D-010) |
| O-5 | **Timeline reuse mechanism:** vendored copy (my recommendation) vs extracting a shared package from `obsidian_timeline` (modifies upstream; needs authorization) vs rewrite. | Affects maintenance and licence notice handling. | Phase 8 (S7 earlier) | Vendored copy with provenance + upstream contribution later if desired. |
| ~~O-6~~ | **Languages in scope** for primary and target languages in V1 (which ones concretely?). Affects tokenisation/POS (S3), PDF text shaping/fonts (S1), RTL/CJK support, stopwords. | Capability table honesty; bundle size. | Phase 1 (S1/S3) | Author names the languages; V1 guarantees those and labels others "heuristic/untested". |
| ~~O-7~~ | **Real-device testing:** which iOS/Android devices and Obsidian versions will the author provide for validation, and how are builds delivered (BRAT prereleases)? The agent has no device access. | Invariant 12 and acceptance require real mobile tests. | Phase 1 | Author tests prerelease builds via BRAT and reports into the Platform test log. |
| O-8 | **PDF cross-platform fidelity:** if the chosen pure-JS PDF path differs between desktop and mobile (fonts, shaping, memory) or cannot reach desktop-quality on mobile, what is acceptable? | Spec requires an explicit decision, not silent reduction. | After S1 | Decide with S1 data; prefer one pure-JS renderer on all platforms for identical output. |
| O-9 | **Calendar scope:** are fictional calendars required in V1 beyond "unresolvable expression" representation? Real non-Gregorian (Julian) calendars? | Affects solver conversion layer. | Phase 8 | Gregorian + abstract time + explicit unresolvable; calendar-definition extension point later. |
| O-10 | **Snapshot retention** for diff/3-way baselines (proofreading, translation): keep only referenced baselines (my recommendation) vs full history in vault? | Vault size, sync traffic, privacy of old text. | Phase 3 | Referenced baselines + short undo window. |
| ~~O-11~~ | **Sync environment:** which sync mechanism(s) does the author use across devices (Obsidian Sync, iCloud, Syncthing, git)? | Conflict taxonomy (S8) and shard-size guidance. | Phase 3 | Test against the author's actual provider(s); design for the worst case (file-level last-writer-wins). |
| O-12 | **Reading mode highlights on mobile:** is Live Preview-only highlighting acceptable on a platform where S2 shows Reading-mode limits? Requires an explicit decision if it applies. | Spec §9 asks for Reading mode investigation. | After S2 | Decide with S2 data. |

## Resolved by the author (2026-11-26)

| ID | Answer | Consequence |
|---|---|---|
| ~~O-3~~ | Accepted: plugin id `book-harness`, name "Book Harness", repo `davadev/book_harness`, MIT. | Phase 1 scaffold unblocked. |
| ~~O-4~~ | Registry-first identity with optional per-book opt-in anchor property (D-010 confirmed). | Phase 2 unblocked. |
| ~~O-6~~ | V1 languages: **English, German, Czech/Slovak** (CJK/RTL out of V1 guarantees; any other language labelled heuristic/untested). | S1 fonts need Latin Extended coverage; S3 evaluates POS for en/de/cs-sk (Czech/Slovak likely heuristic, labelled so); German compound tokenization needed. |
| ~~O-7~~ | Real-device testing: **iPhone/iPad**. Android not available: Android stays unverified and must be recorded as such (invariant 12 decision needed before claiming Android support). | Platform log is iOS + desktop only. |
| ~~O-11~~ | Sync: **WebDAV to Nextcloud via a community sync plugin** (file-level, likely mtime/size based, last-writer-wins). | S8 runs against this setup; divergence detection must rely on content hashes, not mtimes; conflict taxonomy assumes whole-file overwrite. Plugin name to be recorded. |

| O-1 | Author: the decision provider is **not part of the MVP** (no feature is tied to it). Later, use one of the decision-style models available in the Ollama catalog (the author wrote "jev"; exact model name unconfirmed, must be identified before Phase 4 work). | Spec §7 asks for a functional integration surface: build only the `DecisionModel` port + test double + Ollama-backed adapter when the model is identified; no UI/workflow dependency. Recorded as an explicit author scope decision, not a silent reduction. |
| Android | Support, **mark unverified**: build to Android constraints, label all Android behaviour untested. | Platform log iOS + desktop only. |

## Conflicts between sources

See `DISCOVERY.md` §3 (C-1 … C-8). None currently requires violating an explicit product requirement; C-3 (identity) and C-5 (ES2018 vs template) need confirmation as O-4 / D-004.

## Deferred improvements (not scope reductions)

Items the master prompt marks as "may evolve after the required core": additional literary actions, sophisticated character knowledge inference, fixed-layout EPUB, extensive typography, ANN vector index, incremental solver, manual author TODOs (recommended extension — planned in Phase 3). None of the required V1 features is deferred.

## Spike-derived proposals (2026-11-26; see `SPIKES.md`)

| ID | Proposal | Status |
|---|---|---|
| D-020 | EPUB packaging with `fflate` (MIT, 4 KB gz) + own XHTML generation; heavy export libraries lazy-loaded on export only. | Proposed; verify on iOS |
| D-021 | PDF layout via `pdfmake` (maintained, TOC + links) with outline post-processing TBD; `pdf-lib` rejected as primary because it is unmaintained (2022) and has no layout. Markdown parser still undecided (micromark vs marked vs markdown-it; criterion: source offsets for block anchors). | Proposed; O-8 still open |
| D-022 | Hashing: `@noble/hashes` SHA-256 everywhere (identical across platforms); `crypto.subtle` optional accelerator. Supersedes the open part of D-012. | Proposed |
| D-023 | Vectors: Float32 binary file in plugin folder, brute-force cosine; no ANN. | Proposed |
| D-024 | Markdown for export is parsed by a small in-house subset parser (no dependency) because the supported syntax is tiny, ES2018-safe and fully deterministic; unsupported constructs are reported, not dropped. EPUB uses `fflate` 0.8.2 (pure JS, MIT, over 14 days old). Revisit if lists/tables are needed. | Keeps the bundle small and avoids an unvetted parser's Obsidian-syntax behaviour. | Phase 12 |
| ~~O-13~~ | **Adjective analysis for German and Czech/Slovak** has no on-device POS tagger. Accept two labelled modes (heuristic, or user-initiated model-assisted classification) with English getting true POS tagging? Or require a bundled lexicon/model (size/mobile cost)? | Resolved 2026-11-26: two labelled modes (heuristic / user-initiated model-assisted; English true tagging) |
