---
name: build-slice
description: The loop for adding one vertical slice of Book Harness (a pure core piece, its panel/editor wiring, tests, docs). Use when starting or resuming any feature work from docs/IMPLEMENTATION-PLAN.md, before writing code, and again before committing.
---

# Build one slice

1. **Orient.** Read `docs/STATUS.md` ("Resume here"), the open items in `docs/DECISIONS.md`, and `docs/DEVELOPMENT.md` (invariants, gates, recipes). Check `git status`, `git log -5`.
2. **Scope one slice** that is testable alone and has a visible consumer (the dead-code gate rejects code nothing ships).
3. **Core first** in `src/core` (pure), against `FakeVault`/scripted `NetworkPort`. Then `panel-model` → `ui/overview` → `platform/panel-view` (or an editor extension).
4. **Safety questions before coding:** Can this write manuscript text? (only via proposals) Can it call a model without a click + disclosure? Can an old result become "current"? Can failure look like "empty"? Does it leak between books? Does it use lookbehind or an API above ES2018?
5. **Tests for every branch** including failure, cancel, stale text, hand-edited data. 100 % coverage; delete unreachable code instead of excluding it.
6. **Gates:** build, lint (0/0), lint:css, check:dead-code, test:cov, lint:cloud-parity, `check-release -- --with-build --strict`.
7. **Docs in the same commit:** `docs/STATUS.md` (what is done, what is NOT done, honest platform status), `docs/ACCEPTANCE.md` rows, `docs/DECISIONS.md` if a choice was made. Never claim real-Obsidian or device verification that did not happen.
8. **Commit and push to `main`** with a message that says why. Public repo: re-check nothing private is included.
9. **Ask the author with the AskUserQuestion tool** (not plain text) for any consequential choice or at a checkpoint; a plain-text question is missed.
