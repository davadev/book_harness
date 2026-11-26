# Development guide (how this codebase is built and checked)

Practical knowledge that is not obvious from the code. Read before adding a slice. Playbook rules are summarized only where they changed how code is written here; the playbook itself is private.

## 1. Layout and where things belong

| Place | Rule |
|---|---|
| `src/core/**` | Pure. No `obsidian`, DOM, Node, `window`/`document`/`navigator` (a test greps for them: even a *variable* named `window` fails). Talks to the vault only through `VaultPort`, to the network only through `NetworkPort`. |
| `src/platform/**` | Only place that imports `obsidian`. Views, modals, editor extensions (`platform/editor/`), adapters. |
| `src/ui/overview.ts` | Draws the panel from plain data; calls `BookActions`. No vault access. |
| `src/settings/` | Shared settings (`data.json`) vs per-device settings (device-local storage: server address, model names). Never put a device value in shared data. |
| `src/tests/` | `*.test.ts` plus `__mocks__/` (obsidian stub, `fakeVault`, `fakeApp`, `obsidianDom`). Helpers must not live elsewhere in `tests/`. |
| Managed notes | Everything the plugin stores for a book is a Markdown note under `<book>/_book-harness/` (see `docs/ARCHITECTURE.md` §3). Derived data that is safe to lose (meaning vectors) lives in the plugin folder. |

Pattern used everywhere: pure function in `core` → exercised with `FakeVault` → wired through `panel-model.ts` (data) → `ui/overview.ts` (render + actions) → `platform/panel-view.ts` (glue).

## 2. Invariants and where each is enforced

| Invariant | Enforced by |
|---|---|
| No code changes manuscript text except an accepted proposal | `GuardedVault` refuses manuscript writes; `writeManuscript` needs a capability minted only in `core/proposals.ts` (architecture test greps for `mintWriteCapability`, `.writeManuscript(`, `.writeAuthorized(`); raw `ObsidianVaultPort` only built in `platform/guarded-vault.ts` |
| All vault writes go through the port | Architecture test: no `app.vault.modify/create/...`, `adapter.write...`, `editor.replace...` outside `platform/vault-port.ts` (+ `crashGuard.ts`, `platform/index-store.ts`) |
| Network only via `platform/network.ts` | Architecture test (no `requestUrl`/`fetch`/`XMLHttpRequest`/`WebSocket` elsewhere) |
| No model call without an author action | Every model action: disclosure + confirm modal (`ConfirmModal`) → job; lifecycle test in `network.test.ts` asserts zero calls on load/save/edit/sync; **new startup/event code must keep that test green** |
| A result computed from old text is never marked current | Pattern: read text → fingerprint → work → re-read → compare → else `discarded` (summary, proofreading, extraction, word count all do this) |
| Failed ≠ empty | Readers return `problems`; the panel shows them; never swallow into "no data" |
| Canary for each structural test | When adding an architecture rule, temporarily violate it and confirm the test fails |

## 3. Gates (all must be green before a commit; the release guard checks them)

```bash
npm run build && npm run lint && npm run lint:css && npm run check:dead-code \
 && npm run test:cov && npm run lint:cloud-parity && npm run check-release -- --with-build --strict
```

- **100 % coverage on four metrics, no ignores.** Unreachable code is *deleted*: simplify instead of adding a test for a branch that cannot happen. Code reachable from hand-edited or synced data is kept and tested.
- **Dead-code gate** (`knip --production`): every export must be used by shipped code (tests do not count). A new core function needs its UI/platform consumer in the same slice. If something is written ahead of use it will fail the gate; delete it and restore it when used.
- Find the uncovered function/branch quickly: `npx vitest run --coverage --coverage.reporter=json --coverage.reportsDirectory=/tmp/c` then read `coverage-final.json` (`f`, `s`, `b` with zero counts and `fnMap`/`statementMap`/`branchMap` locations).
- `npx eslint 'src/**/*.ts' --fix` removes `no-unnecessary-type-assertion` findings (very common: without `noUncheckedIndexedAccess`, `arr[0]`/regex groups are already non-undefined, so `as T`/`!` is flagged).

## 4. Lint and runtime gotchas learned the hard way

- **No regex lookbehind** (older iPhones); lookahead is fine. **ES2018 API floor**: no `structuredClone`, `.at()`, `Object.hasOwn`, `replaceAll` in `src/` (tests may).
- Sentence case for all UI text (`Re-enable it under community plugins.`); use `createDiv/createSpan/createEl` helpers (`prefer-create-el`); no static `el.style`; no `console.log` (use `logger`); no raw `localStorage` (`app.loadLocalStorage` for per-device); `fileManager.trashFile`, never `vault.delete`.
- Use `text-decoration` shorthand, never longhands; no `!important`; theme variables only; 44 px touch targets; meaning never by colour alone.
- Do not rebuild a focused input on keystroke: search runs on Enter/button only. Panel draws nothing while hidden and is debounced.
- `requestUrl` cannot be aborted or timed out: `platform/network.ts` races it. **A request canceled before it starts must reject immediately** (bug found by a test).
- Obsidian does not type the CodeMirror view: `editorViewOf()` in `platform/editor-review.ts` is the one place that reaches for `editor.cm`.
- Widgets/decorations must never change the document; drop a decoration whose text changed rather than show it against different text.

## 5. Test patterns

- Core: `FakeVault` (in-memory, records `writes`), `GuardedVault(raw)` to prove the guard, `counterRandom()` for ids (**share one instance within a test**: a fresh one repeats ids).
- Models: scripted `NetworkPort` returning canned `/api/chat` or `/api/embed` JSON. **Mocked results never describe model quality.** Real-model evaluation is separate and opt-in (not written yet).
- Panel flows: `makeFakeApp()` + `BookHarnessView` under `// @vitest-environment happy-dom` with `installObsidianDom()` and `document.body.replaceChildren()` in `beforeEach` (stale modals otherwise leak between tests). Patch `empty/addClass/setText` on `HTMLElement.prototype` as the existing tests do. Wait with `vi.waitFor`; for the retry/backoff path allow `{ timeout: 3000 }` (one real 1 s sleep).
- Editor extensions: test the `StateField` with `EditorState` and `state.facet(EditorView.decorations)`, widgets by calling `toDOM`, and one real `EditorView` mount under happy-dom.
- Make a test deterministic by gating the *job's own* effect (e.g. hold the first write to `/state/`), not a read that the panel's redraw also performs.
- Do not write tautological assertions; a reviewer reads these as behaviour specifications.

## 6. Recipes

**New model action:** `core/<x>.ts` (prompt via `effectivePrompt`, `runStructured`, grounding check by code, fingerprint with source revision + prompt id + model, discard-if-text-changed) → add a `JobKind` (`core/jobs.ts`, `JOB_KINDS`, `KIND_LABEL` in `ui/overview.ts`) → `readyToSend()` + `ConfirmModal` in `platform/panel-view.ts` (disclose: what text, to which address, which model; "your chapters are not changed") → button in `ui/overview.ts` → tests for each path (missing setup, running job, confirm, stale, retry, failure).
**New managed note type:** frontmatter `bh_schema/bh_type/bh_id/bh_book`; parse that reports problems; write with `replaceIfUnchanged`; fenced ```bh-records JSON for machine data; test the whole matrix of invalid inputs (type, newer schema, no block, broken JSON, malformed).
**New setting:** `settings/defaults.ts` (+ `normalizeSettings`), declarative control in `SettingsTab.ts`, read somewhere in `src/`, saved in `main.ts#saveSettings` (shared) or device storage; `settingsCoverage.test.ts` enforces control ↔ setting ↔ reader.

## 7. Commit and release conventions

Small vertical slices; commit message explains why; co-author trailer per session reminder. Repository is **public**: no private books, no secrets, no hostnames, no private-repo text. `BOOK_HARNESS_MASTER_PROMPT.md` is git-ignored on purpose. Releases are tag-driven prereleases (`X.Y.Z-beta.N`) via BRAT; **no beta has been cut yet** (the author deferred it repeatedly): see `docs/STATUS.md`.
