# Architectural risk register

Likelihood/impact: L/M/H. Owner column is the phase where the risk is retired or accepted.

| ID | Risk | L | I | Mitigation | Retire at |
|---|---|---|---|---|---|
| R-1 | **Mobile PDF**: no `printToPDF`/Pandoc/child process; pure-JS PDF layout is large, font/shaping heavy, memory-bound on iOS. | H | H | S1 early; Document IR shared with preview; chunked page generation; decide fidelity (O-8). | S1 / Phase 12 |
| R-2 | **Editor decorations/diff widgets** on mobile (touch, IME, big chapters, interplay with Live Preview). | M | H | S2 early; state field for layout-affecting widgets; rebuild only on `docChanged/viewportChanged/effect`; regex-based hiding; fallback needs explicit decision. | S2 / Phase 5–6 |
| R-3 | **Timeline renderer coupling** to total order + Gregorian dates; unknown/partial orders need new axis semantics. | H | M | S7 axis interface; own precision-carrying time type; layout order labelled non-factual. | Phase 8 |
| R-4 | **Chapter identity** under external renames/sync vs "don't rewrite manuscripts". | M | H | Registry binding + hash/snippet recovery with confirmation; optional anchor property (O-4). | Phase 2 |
| R-5 | **Sync conflicts** across many small notes on providers without `.obsidian`; partial sync of multi-record operations. | M | H | Record-per-note sharding; `bh_rev/bh_parent` divergence detection; operation journal; conflict notes; S8 on real provider. | Phase 3 |
| R-6 | **Mobile suspension / no streaming** break long jobs. | H | M | Persisted job ledger, resumable, authorization expiry; small subtasks; catch-up on `visibilitychange`; step-based progress. | Phase 4 |
| R-7 | **POS tagging/NLP** quality, language coverage and bundle size on mobile. | M | M | S3 capability table; label heuristic vs true; lazy-load language packs on user action (not at startup). | S3 / Phase 9 |
| R-8 | **Embedding index** size/time/memory on mobile; incompatible model changes. | M | M | Typed-array brute force; chunked build with resumable authorization; manifest of built-from revisions; BM25 fallback always current. | Phase 7 |
| R-9 | **100 % coverage** vs UI-heavy modules slows delivery. | M | M | Pure-core extraction; thin shims; happy-dom behaviour tests; never `v8 ignore`; coverage ratchet from Phase 1. | Continuous |
| R-10 | **Prompt injection** from manuscript/retrieved text into the agent or extraction. | M | H | Data-block framing; schema-validated tool protocol; read-only tools; grounding validation; injection fixtures. | Phase 4/11 |
| R-11 | **Write-gate bypass** by future code. | L | H | Branded capabilities, lint rule, architecture test, byte-equality test across job types. | Phase 2/5 |
| R-12 | **Reconciliation correctness** (re-extraction retracting facts, protecting author canon). | M | H | Evidence-keyed idempotent commits; deterministic reconcile with property tests; author-confirmed protected; conflicts surfaced. | Phase 6 |
| R-13 | **Scale**: large books (150k+ words, hundreds of entities) at startup on mobile. | M | M | Lazy loading; sharded notes; incremental hashing; yielding loops; performance budgets in tests. | Phase 13 |
| R-14 | **Dependency/supply-chain** for NLP/PDF/ZIP libraries vs playbook "prefer none". | M | M | Per-library ADR (licence, size, maintenance, mobile run); pin; 14-day age. | Phase 1 / each |
| R-15 | **Unknown decision-provider protocol** (Jeff). | H | L | Port + test double; ask author (O-1). | Phase 4 |
| R-16 | **No device access for the agent**: mobile results depend on the author. | H | H | Recorded platform test log; BRAT prereleases; honest "untested" markers. | Continuous |
