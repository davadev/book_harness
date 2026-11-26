<!-- TEMPLATE: docs/releasing.md. WHAT: the operating manual for releases, standalone (no link to any playbook).
     CHANGE: replace <PLUGIN_NAME>, <PLUGIN_ID>, <GITHUB_OWNER>, <REPO>, <STABLE_VERSION> (the version currently on `main`),
             <MIN_APP_VERSION>; list your repo-specific pre-tag chores in section 4. Delete this comment block.
     GUARDS: a new session that does not know releases are tag-driven reaches for `gh release create` by hand or bumps
             main's manifest first. Acceptance test: open a NEW session with only the repo and ask it to cut a beta; if it
             reaches a published prerelease with correct assets and an untouched default branch unaided, this doc is
             enough. If you had to intervene, fix this doc, not the session. Any change to release.yml, check-release or
             the scripts updates this file in the SAME commit. -->
# Releasing <PLUGIN_NAME>

## The invariant

**`main`'s `manifest.json` must never advertise a version that has no published GitHub release.** Obsidian reads the
default-branch `manifest.json` to decide which version to offer Community Plugin users, then downloads the assets from the
release tagged *identically*. A `main` that says `1.2.0` while only `1.2.0-beta.1` exists breaks every install and update.
The GitHub "prerelease" flag is NOT protection: Obsidian matches the tag against the manifest version and does not use that flag. BRAT, by contrast, reads `manifest.json` from the
release *assets* and installs the highest semver including prereleases, so betas reach testers without touching `main`.

Consequences (all follow from the invariant): do not commit an `X.Y.Z-beta.N` version to `main`; do not bump `main` to the
next stable until that stable release is published; do not run `gh release create` by hand (pushing a tag is the only way
anything is published, so the gates always run).

Which rules below are Obsidian's and which are this repo's own choices: the invariant, the three assets and the tag equal to
the manifest version are Obsidian's. Everything marked *(repo choice)* can be changed by the owner, but change this document
and `release.yml` together.

## Facts about this repo

| | |
|---|---|
| Plugin id / name | `<PLUGIN_ID>` / <PLUGIN_NAME> |
| Current stable (on `main`) | `<STABLE_VERSION>` |
| Tags | *(repo choice)* bare SemVer, **no `v` prefix** (Obsidian only needs the tag to equal `manifest.json` `version`): `1.2.0` (stable), `1.2.0-beta.1` / `1.2.0-rc.1` (prerelease). `release.yml` triggers on exactly these shapes. Ignore any legacy tag that does not match. |
| Minimum app version | `<MIN_APP_VERSION>` (`manifest.json` `minAppVersion`). Do not raise it or use newer API without checking the mobile install path. |
| Release assets | exactly `main.js`, `manifest.json`, `styles.css` |
| Workflow | `.github/workflows/release.yml` (lint -> build -> test -> `check-release --strict` -> artifact validation -> attest -> publish) |

## Gate commands (all must be clean: zero errors AND zero warnings, a repo choice stricter than Obsidian's review)

```bash
npm ci                       # first, from the committed lockfile
npm run lint                 # eslint, --max-warnings=0, mirrors Obsidian's auto-review
npm run lint:css             # stylelint on styles.css
npm run build                # tsc --noEmit + production esbuild
npm test                     # vitest
npm run test:cov             # 100 % statements/branches/functions/lines (repo choice)
npm run check:dead-code      # knip --production
npm run lint:cloud-parity    # review's blind view: 0 errors
npm run check-release -- --with-build    # the release guard; must say "0 failed, 0 warned"
```

A project hook (`.claude/hooks/pre-tag-check.mjs`) runs `check-release --with-lint` before any `git tag <semver>` or tag
push and blocks the command on failure. It does not replace the full `--with-build` run above.

## 1. Cut a prerelease (default for every release)

Nothing in `manifest.json` / `package.json` / `versions.json` changes: CI stamps the beta version into its working tree.

1. The change is merged to `main` through a PR with CI green. `git checkout main && git pull`.
2. Run the gate commands above.
3. Pick the next number: `git tag --list '1.2.0-beta.*' --sort=-v:refname | head -1`. The `-beta.N` suffix is mandatory:
   a bare `X.Y.Z` tag publishes as the latest stable.
4. `git tag 1.2.0-beta.1 && git push origin 1.2.0-beta.1`
   (*Repo choice*: merge first, then tag. A beta could be tagged from a feature branch head while the work is in review, but
   `release.yml` refuses a prerelease that is not on `main` unless you loosen that step on purpose.)
5. Verify instead of assuming:
   ```bash
   gh run list --workflow release.yml --limit 1
   gh release view 1.2.0-beta.1 --json tagName,isPrerelease,assets    # assets are exactly the three files, isPrerelease true
   git show origin/main:manifest.json | grep '"version"'               # still <STABLE_VERSION>
   ```
6. Tell the tester how to install: BRAT -> Add Beta Plugin -> `<GITHUB_OWNER>/<REPO>`.

Iterate with `-beta.2`, `-beta.3`... Each round: PR -> CI -> merge -> new tag.

## 2. Promote to stable (only on the owner's explicit go-ahead)

The stable release is published **before** `main` advertises it.

```bash
git checkout -b release/1.2.0 main
# bump manifest.json, package.json, versions.json to 1.2.0 (versions.json: "1.2.0": "<MIN_APP_VERSION>")
npm install --package-lock-only        # else CI's version-skew check fails
npm run check-release -- --tag 1.2.0 --with-build --strict
git commit -am "1.2.0 — short description" && git push -u origin release/1.2.0   # open a PR, wait for CI
git tag 1.2.0 && git push origin 1.2.0                                            # tag the RELEASE BRANCH head
gh release view 1.2.0 --json tagName,isLatest,assets                              # latest, three assets
gh pr merge --merge --delete-branch                                               # --merge, not --squash (repo choice): keeps the tagged commit reachable from main
```

## 3. Undo a failed release

If the workflow fails, no release exists and `main` was never touched:

```bash
git push origin :1.2.0-beta.1 && git tag -d 1.2.0-beta.1
```

Fix on a branch, merge, retag. If a release was created and is wrong, delete it with `gh release delete <tag> --cleanup-tag`
and retag with the next number rather than reusing a published one (repo choice: testers and caches may hold the old bytes).

## 4. Repo-specific chores before the tag

<!-- List anything the build leaves behind that must be regenerated and committed first: generated data, demo vaults,
     annotated screenshots (show them to the owner before tagging), a What's new entry for a minor release. -->
- Minor release: `src/whatsNew/releaseNotes.ts` has an entry for `X.Y.0` (`check-release` warns, and `--strict` blocks).
- (add yours)

## 5. Constraints that will bite later

- Dependencies: *(repo choice)* no version younger than 14 days (`.npmrc` + Dependabot `cooldown:`); Actions pinned to commit SHAs;
  `@codemirror/state` and `@codemirror/view` pinned exact to `obsidian`'s peer versions. See the `dependency-update` skill.
- Node-only imports (`fs`, `path`, `electron`...) require `"isDesktopOnly": true`; `check-release` enforces it.
- `styles.css` must not use `!important` or the `text-decoration-*` longhands (the review lints them).
- A lint Error can fail Obsidian's automated review, and the plugin is not installable until errors are fixed: do not tag past
  a red gate. Fix review feedback by publishing a new, higher version, not by editing a published release.
