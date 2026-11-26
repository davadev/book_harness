---
name: feature-done
description: Definition-of-done checklist for any feature or user-visible change in this plugin. Use before opening or merging a feature/fix PR, when adding a setting, command, UI element or behaviour change, or when asked "is this done?" or "what else needs updating?". Covers tests, docs, README, What's new entry, screenshots, issue.
---

<!-- TEMPLATE: .claude/skills/feature-done/SKILL.md. CHANGE: drop lines for things your repo does not have (docs index,
     screenshots, What's new); add your own. GUARDS: each line is a thing that was once forgotten and found by a user.
     Delete this comment after editing. -->

# Feature done checklist

Run through every line before the PR is marked ready. Skip a line only when it truly does not apply, and say so in the PR.

1. **Branch + PR**: work on `fix/<slug>` or `feat/<slug>`, never on `main`.
2. **Tests**: new/changed code has tests; `npm run test:cov` stays at the repo's threshold (100 % in this template, a house choice; no `v8 ignore`; unreachable code is deleted, see `plugin-design-rules`). **A bug fix always carries a regression test** that failed on the old code (revert the fix once to prove it) and covers the neighbouring states; see `bug-hunt`.
3. **Checks**, all with zero warnings: `npm run build` (includes tsc), `npm run lint`, `npm run check:dead-code` (new code is reachable from `src/main.ts`; nothing left half-finished), `npm run lint:css` if `styles.css` changed, `npm run lint:deps` if `package.json` changed.
4. **Settings**: a new setting goes under a section heading (never appended flat) and is covered in `src/tests/settingsCoverage.test.ts` (tab control, or `NOT_IN_SETTINGS_TAB` with a reason). Remind the user a full Obsidian restart is needed to see a new group.
5. **Docs**: update the matching `docs/<page>.md` and `docs/index.md` if a page was added; `README.md` if user-visible.
6. **What's new**: a user-visible or must-relearn change gets an entry in `RELEASE_NOTES` in `src/whatsNew/releaseNotes.ts` (newest first, plain `X.Y.Z`, short and benefit-led). **Never delete or rewrite an earlier entry of the same `X.Y` line**: users who skipped a release are shown all they missed, and `check-release` fails on a removed entry.
7. **Screenshots**: UI changed in a screen that has an annotated image -> invoke the `docs-screenshots` skill.
8. **Issue**: exists, labelled, tracked (see `triage-issue`). The PR body says `Closes #N`.
9. Next step is `release-beta` once merged. Every fix ships as a beta with BRAT assets; do not leave a fix un-released.
