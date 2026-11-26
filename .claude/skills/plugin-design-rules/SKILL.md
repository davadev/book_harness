---
name: plugin-design-rules
description: Starter design and code rules for an Obsidian plugin that each prevent a known regression (CSS, settings tab, mobile, data safety, tests and coverage, lint). Use before editing src/, styles.css, settings or any code that reads or writes user data; append your own hard-won rules.
---

<!-- TEMPLATE: .claude/skills/plugin-design-rules/SKILL.md. These are STARTER rules that hold for any plugin. CHANGE: replace
     bh; APPEND a rule (with the incident in one line) every time a bug teaches you one, grouped under a heading.
     Delete this comment after editing. -->

# Plugin design rules

## CSS (`styles.css`)
- Every class the code adds starts with `bh-`; `check-release` then requires `styles.css` to ship (a release without it broke every iPad install).
- No `!important`; no `text-decoration-line/-style/-color/-thickness/-skip-ink` longhands (use the shorthand with `var()` parts). The review lints both.
- Use Obsidian theme variables (`--text-normal`, `--background-secondary`...) so themes and dark mode work. Dynamic colours go through a CSS custom property that code writes, never inline `background`.
- Check at phone width and desktop width; wide fixed-size elements are how WKWebView kills the app.
- Side panels: `overflow-x: hidden` + `touch-action: pan-y` on the root, `min-width: 0` on flex children, container queries (not media queries) for width. Touch targets >= 44 px on touch (Apple HIG / WCAG 2.5.5; `.is-mobile` is undocumented, `@media (pointer: coarse)` also works); taking the extra height back with a negative margin is optional. Colour: follow the theme's accent and keep green/orange/red for meaning (a house choice, adapt it); never colour alone; every colour mix has a plain fallback and the mix sits in `@supports`. Playbook `SIDE-PANEL-VIEWS.md`.
- Accessible by default: icon buttons are real buttons with `aria-label`; visible `:focus-visible`; animations respect `prefers-reduced-motion`; logical properties (RTL); contrast 4.5:1 text / 3:1 marks in light and dark. Playbook `CSS-AND-THEMING.md` section 7.2.
- No second declaration of a property in one block (the review warns); put old-engine fallbacks in `@supports`.
- No `:has()` (the review warns about broad selector invalidation; stylelint fails it). Use `:focus-within`, a class set in code, or a CodeMirror line decoration.
- Check: `npm run lint:css`.

## Dependencies and README (review findings)
- `package.json` must not list a package the es-tooling replacements list wants swapped (`js-yaml` -> `yaml`); `npm run lint:deps` fails it. Prefer a native or already-bundled alternative before adding any package.
- The README must have no template leftovers: no HTML comments, `TODO`, `[description]` or `<angle-bracket>` slots, not even inside backticks. Write "the plugin folder of your vault" instead of `<your vault>`. `check-release` fails it.

## Settings tab
- Group new settings under a heading; never flat-append. Declarative `getSettingDefinitions()` (Obsidian 1.13+) makes them findable in settings search.
- Per-device state (last seen version, one-time hints) is not a preference: list it in `NOT_IN_SETTINGS_TAB` in `settingsCoverage.test.ts` with the reason.
- A new settings group needs a full Obsidian restart to appear (iPad: swipe the app away).
- Do not rebuild the DOM per keystroke in a search/filter input (it closes the phone keyboard).

## Mobile / platform
- Regex lookbehind needs iOS 16.4+; never cast `Vault.adapter` to `FileSystemAdapter` without `instanceof` (both in Obsidian's self-critique checklist).
- Never auto-download large data at startup (a startup download once caused an iOS crash loop).
- Node-only modules (`fs`, `path`, `electron`) require `"isDesktopOnly": true`; `check-release` enforces it.
- Source stays ES2018 (`lib`): no `structuredClone`, `.at()`, `Object.hasOwn`, `replaceAll`; iOS/Android WebViews are older than Node.
- Catch and log every background promise; show the real reason when `onload` fails.
- Do not raise `minAppVersion` or use newer API without checking the iOS install path.
- Use `normalizePath()` for every vault path; use `app.vault` / `adapter` APIs, never hardcoded absolute paths.
- Keep the load path light: do risky or slow work after the layout is ready, and keep the crash-loop guard (`src/crashGuard.ts`) in front of it.

## Data safety
- Never rewrite the user's notes or files as a side effect of load or save. Writes are explicit, user-initiated actions.
- Settings migrations are additive and tolerate missing, extra and hand-edited values. Persisted data is untrusted input: shape-check it.
- Synced state (data.json shared across devices) must merge commutatively and idempotently; add property tests when touching it.
- Code reachable from persisted/synced/hand-edited data is kept and tested; legacy code that nothing can reach is deleted.

## Tests / coverage / lint
- Test files are `tests/**/*.test.ts` only; every helper, mock and fixture lives in `testUtils/` (the review scans everything else). Pin it with `reviewScope.test.ts`.
- A mapper of an outside service gets a contract test with a fixture copied from a real answer (`EXTERNAL-SERVICES.md`). Calendar logic runs in three time zones in CI.
- 100 % coverage on all four metrics. No `v8|c8|istanbul ignore`; never widen `exclude`. `coverageGate.test.ts` pins this.
- Unreachable code is **deleted**, not ignored. A deliberate test seam gets a `@public` JSDoc tag for knip.
- `npm run check:dead-code` (knip, production mode) fails on exports and files only a test reaches: delete them, do not add ignores.
- `npm run lint` mirrors Obsidian's auto-review: **zero errors and zero warnings** before a PR is ready and before any tag. Never silence a rule to get there.
- A passing test is not evidence that something is on screen: for UI work, render it with the real stylesheet and look at it.
- Verify data and behaviour claims against the real source (real dictionary, real Obsidian docs) before implementing; do not assume.
