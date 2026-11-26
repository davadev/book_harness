// TEMPLATE: src/tests/releaseGuards.test.ts
// WHAT: pins the pure release rules the hook and the store-listing CI job rely on: which shell commands the PreToolUse hook
//       blocks or checks, and what makes a default-branch version "published" (checkStoreListing).
// CHANGE: nothing. It imports ../../scripts/lib/releaseChecks.mjs (copy that file too). If your tests live elsewhere, fix the path.
// GUARDS: someone "simplifying" the hook regex so `git tag -m msg 1.2.3` or `git push --follow-tags` slips past, or the
//         store-listing rule silently accepting a prerelease or a release without styles.css.
import { describe, expect, it } from "vitest";
import { classifyReleaseCommand, checkStoreListing } from "../../scripts/lib/releaseChecks.mjs";

describe("classifyReleaseCommand", () => {
  it.each([
    ["git tag 1.2.3", "needs-check"],
    ["git tag 1.2.3-beta.4", "needs-check"],
    ["git tag -a -m 'x' 1.2.3", "needs-check"],
    ["git push origin 1.2.3", "needs-check"],
    ["git push origin HEAD:refs/tags/1.2.3", "needs-check"],
    ["git tag -d 1.2.3", "allow"],
    ["git status", "allow"],
    ["git push origin my-branch", "allow"],
    ["git push --tags", "block-push-tags"],
    ["git push --follow-tags origin main", "block-push-tags"],
    ["gh release create 1.2.3", "block-release-cmd"],
    ["gh release view 1.2.3", "allow"],
  ])("%s -> %s", (command, verdict) => expect(classifyReleaseCommand(command)).toBe(verdict));
});

describe("checkStoreListing", () => {
  const release = { isDraft: false, isPrerelease: false, assets: ["main.js", "manifest.json", "styles.css"].map((name) => ({ name })) };
  const ok = (r: unknown) => (r as { level: string }[]).every((x) => x.level === "pass");
  it("passes for a published stable release listed in versions.json", () =>
    expect(ok(checkStoreListing({ version: "1.2.3", release, versions: { "1.2.3": "1.13.0" } }))).toBe(true));
  it.each([
    ["a prerelease version", { version: "1.2.3-beta.1", release, versions: {} }],
    ["no release", { version: "1.2.3", release: null, versions: { "1.2.3": "1" } }],
    ["a draft", { version: "1.2.3", release: { ...release, isDraft: true }, versions: { "1.2.3": "1" } }],
    ["a prerelease flag", { version: "1.2.3", release: { ...release, isPrerelease: true }, versions: { "1.2.3": "1" } }],
    ["a missing styles.css", { version: "1.2.3", release: { ...release, assets: [{ name: "main.js" }, { name: "manifest.json" }] }, versions: { "1.2.3": "1" } }],
    ["a version missing from versions.json", { version: "1.2.3", release, versions: {} }],
  ])("fails for %s", (_name, input) => expect(ok(checkStoreListing(input))).toBe(false));
});
