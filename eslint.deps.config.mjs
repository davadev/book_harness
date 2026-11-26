// TEMPLATE: eslint.deps.config.mjs (repo root)
// WHAT: lints package.json for dependencies that have a modern replacement (the plugin review's "should be replaced with an
//       alternative package" warning, from the es-tooling module-replacements list). `npm run lint:deps` runs it.
// CHANGE: nothing, unless the review flags a package you cannot drop: list it in `allowed` with the reason on the line above.
// GUARDS: `js-yaml` sat in devDependencies (test mock for parseYaml) and the first stable release was flagged for it.
//         Keep it zero-warning, like `npm run lint`. check-release asserts this file keeps `depend/ban-dependencies`.
import depend from "eslint-plugin-depend";
import * as jsonc from "jsonc-eslint-parser";

export default [
  {
    files: ["package.json"],
    languageOptions: { parser: jsonc },
    plugins: { depend },
    // `moment` is what Obsidian itself exports as `moment`: the plugin uses the host's copy at run time and only the types and
    // the test stub load the package. The review did not flag it. Delete `allowed` if you do not list moment.
    rules: { "depend/ban-dependencies": ["error", { allowed: ["moment"] }] },
  },
];
