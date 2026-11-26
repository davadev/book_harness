# Book Harness — AGENTS.md

> The master prompt (`BOOK_HARNESS_MASTER_PROMPT.md`) is kept locally and is not part of this public repository.

Obsidian plugin (desktop + mobile) for writing, understanding, maintaining, translating, reviewing and publishing books. A harness for the author, not an autonomous writer. **Authoritative product spec: [`BOOK_HARNESS_MASTER_PROMPT.md`](./BOOK_HARNESS_MASTER_PROMPT.md) (never edit it).** This file is the always-loaded index; detail lives in `docs/`.

## Start of every session (do this first)

1. Read `docs/STATUS.md` (what is done, what is blocked, what is next).
2. Read `docs/DECISIONS.md` open items relevant to the work you are about to do.
3. Re-read the invariants below. Then work on exactly one slice from `docs/IMPLEMENTATION-PLAN.md`.
4. Before ending: update `STATUS.md`, `DECISIONS.md`, `ACCEPTANCE.md` rows you touched. Docs must survive context compaction.

## Non-negotiable invariants (spec §2; full text in the master prompt)

1. **Author ownership.** No AI-originated change to manuscript prose without explicit, revision-safe accept/reject. One central write gate; no bypass.
2. **Clean manuscript.** No wiki links, markers, annotations or publishing clutter in prose. Metadata is external.
3. **Explicit structure.** Chapter membership/designation/order are author-defined, never inferred from names or times.
4. **Controlled inference.** Zero model calls on save, startup, sync, indexing, editing. Only user-initiated, bounded workflows call models.
5. **Modular intelligence.** Small single-purpose prompts; one failure never invalidates unrelated work.
6. **Deterministic orchestration.** Models extract/suggest; software validates, orders, calculates, applies. The model never owns timeline ordering.
7. **Markdown-first portability.** Essential state is human-inspectable vault Markdown; caches are rebuildable.
8. **Native integration.** Obsidian APIs/editor extensions; do not replace the editor.
9. **Grounding.** Separate manuscript evidence / author canon / inference / calculation. Never fabricate facts, dates, sources.
10. **Independent operation.** Non-AI features work without AI.
11. **Multi-book isolation** of queries, indexes, IDs, jobs, content.
12. **Desktop and mobile from day one.** No unconditional Node/Electron/native binaries/paths. Record and decide any mobile limitation; never silently drop.

## Always-on rules

- **Playbook wins** over generic advice (private repo; see `docs/DISCOVERY.md`) except where it would violate an invariant; log any conflict in `docs/DECISIONS.md`.
- **Do not modify** the playbook or `obsidian_timeline` repos. Reuse = copy with provenance (`docs/DISCOVERY.md` §4) or an approved shared package.
- **Never claim done because UI exists.** A feature is done only when its acceptance rows in `docs/ACCEPTANCE.md` pass and `STATUS.md` says so. Untested platforms are written down as untested.
- **Never label mocked-model results as model quality.** Mock inference in CI; real-model evals are opt-in and record model versions.
- **Manuscript write gate:** only `src/platform/manuscript-gate` may write chapter-note bodies. An architectural test enforces this. See `docs/MANUSCRIPT-PROTECTION.md`.
- **Pure core:** `src/core/**` never imports `obsidian`, DOM, Node. Platform code in `src/platform/`, UI in `src/ui/`.
- **Playbook gates apply** once scaffolded: lint 0/0, 100 % coverage, `knip`, `check-release`, ES2018 lib floor, no `console.log` (use logger), no raw `localStorage`, `trashFile` not `delete`, sentence-case UI, 14-day dependency age, merge-commit PRs, prerelease-first releases.
- Synthetic fixtures only; no private books in the repo.
- Ask the user for consequential product trade-offs (open items in `docs/DECISIONS.md`); do not silently reduce scope.

## Documentation map

| Doc | Purpose |
|---|---|
| `docs/SPEC.md` | Requirement register: every master-prompt requirement with ID, phase, status |
| `docs/DISCOVERY.md` | Repository discovery, reuse inventory, conventions, conflicts |
| `docs/COMPATIBILITY.md` | Desktop/mobile matrix, runtime constraints, feasibility spikes |
| `docs/ARCHITECTURE.md` | Layering, data model, Markdown persistence layout, identities, revisions, jobs |
| `docs/AI-AND-PROMPTS.md` | Providers, prompt registry, output contracts, diagnostics |
| `docs/MANUSCRIPT-PROTECTION.md` | Write gate, proposals, diff/review, proofreading |
| `docs/SEARCH-AND-AGENT.md` | BM25 + embeddings + RRF, knowledge graph, chat agent |
| `docs/TEMPORAL-ENGINE.md` | Event identity, constraint solver, timeline views, fixtures |
| `docs/PUBLISHING.md` | Layout model, preview, EPUB/PDF, validation |
| `docs/IMPLEMENTATION-PLAN.md` | Phases 0–13, slices, exit criteria |
| `docs/DECISIONS.md` | ADR log: accepted, proposed, open |
| `docs/RISKS.md` | Architectural risks and mitigations |
| `docs/ACCEPTANCE.md` | Acceptance scenarios → tests |
| `docs/STATUS.md` | Implementation ledger, blockers, change log |

## Commands

Not scaffolded yet (Phase 1). Planned per playbook: `npm run build | test | test:cov | lint | lint:css | lint:deps | lint:cloud-parity | check:dead-code | check-release`.
