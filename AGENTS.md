# Book Harness — AGENTS.md

Obsidian plugin (desktop + mobile) to write, understand, translate and publish books. A harness for the author, not an autonomous writer. The product spec (`BOOK_HARNESS_MASTER_PROMPT.md`) is kept locally, not in this public repo; its requirements are traced in `docs/SPEC.md`. Doc map: `docs/README.md`.

## Start of every session

1. Read `docs/STATUS.md` ("Resume here"), then open items in `docs/DECISIONS.md` for your work. Work one slice of `docs/IMPLEMENTATION-PLAN.md`.
2. Before ending: update `STATUS.md`, `DECISIONS.md`, `ACCEPTANCE.md`. Docs must survive context compaction.
3. Repo is **public**: no private books, no secrets, no hostnames, no private-repo (playbook) text.

## Commands

```bash
npm run build | test | test:cov | lint | lint:css | lint:deps | lint:cloud-parity | check:dead-code
npm run check-release       # REQUIRED before tagging (-- --tag X.Y.Z | --with-build | --strict)
```

Always `npm run build` before claiming done. Tests stub `obsidian` via `src/tests/__mocks__/obsidian.ts`.

## Skills: when to use which

| Trigger | Skill |
|---|---|
| Starting, resuming or finishing any slice of the implementation plan | `build-slice` |
| Opening/merging a feature or fix PR; adding setting, command or UI; "is it done?" | `feature-done` |
| About to edit `src/`, `styles.css`, settings or anything touching user data | `plugin-design-rules` |
| Change merged to `main`; "release", "tag", "ship a beta" | `release-beta` |
| User explicitly says "promote", "go stable" | `release-stable` |

## Invariants (full list `docs/SPEC.md`)

1. No AI change to manuscript prose without explicit accept/reject; one central write gate (`docs/MANUSCRIPT-PROTECTION.md`).
2. Clean manuscript: no links, markers or annotations in prose; metadata external.
3. Chapter membership/order are author-defined. 4. No model call on save/startup/sync/indexing/edit; only user-initiated bounded workflows.
5. Models extract/suggest; software orders, validates, calculates (the model never owns timeline order).
6. Markdown-first portable state; caches rebuildable. 7. Grounded, provenance-carrying facts; never fabricate.
8. Non-AI features work offline. 9. Books isolated from each other. 10. Desktop and mobile from day one; record limits, never silently drop.

## Always-on rules

- `src/core/**` is pure: no `obsidian`, DOM or Node. Only `src/platform/**` imports `obsidian`.
- Only `src/platform/manuscript-gate` may write chapter-note bodies (architecture test enforces).
- Mocked model output is never reported as model quality. Synthetic fixtures only.
- Work on a branch, PR, CI green, merge commit. Coverage 100 %, lint 0/0, never silence a rule; delete unreachable code.
- Every release is a prerelease first (`X.Y.Z-beta.N`); stable only on explicit instruction; tag-driven (`docs/releasing.md`).
- No dependency younger than 14 days; Actions pinned to SHAs; ES2018 API floor.
- Ask the author with the **AskUserQuestion tool** (plain-text questions get missed) for trade-offs and at checkpoints; never silently reduce scope.
- Detailed how-to, invariants-to-enforcement map, test patterns and gotchas: `docs/DEVELOPMENT.md`.
- Say plainly what is untested: nothing has run in real Obsidian or against a real model yet.

## Reference

Release manual `docs/releasing.md` · Repo https://github.com/davadev/book_harness · Commit style `X.Y.Z — short description` for releases.
