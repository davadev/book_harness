// TEMPLATE: esbuild.config.mjs (repo root)
// WHAT: bundles src/main.ts into main.js (CommonJS, ES2020) with Obsidian's provided modules left external.
// CHANGE: the banner text (Book Harness). `external` lists what Obsidian provides at runtime; anything NOT listed is
//         bundled and must be version-pinned. If you import another package Obsidian provides (its parser/highlighting
//         libraries), copy its entry from the official sample plugin's esbuild config.
// GUARDS: `npm run dev` watches; `npm run build` (production) minifies and exits. esbuild is the one dependency whose
//         output reaches the shipped main.js, so it only moves on a release of its own.
import esbuild from "esbuild";
import process from "process";
import { builtinModules as builtins } from "module";

const banner = `/* Book Harness — auto-generated. Do not edit. */`;

const prod = process.argv[2] === "production";

const ctx = await esbuild.context({
  banner: { js: banner },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    ...builtins,
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
});

if (prod) {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}
