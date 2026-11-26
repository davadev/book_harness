// Opt-in: evaluates the real pipeline against local Ollama models. Needs a running server and takes minutes to hours.
//   EVAL_MODELS="gemma4:12b-it-q4_K_M,ornith-1.5:35b" EVAL_STEPS=summary,proofread,entities,search node scripts/model-eval.cjs
// Not run by CI or check-release. Writes docs/evals/<date>-<tag>.md.
import esbuild from "esbuild";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "bh-eval-"));
const out = join(dir, "eval.cjs");
await esbuild.build({ entryPoints: ["scripts/eval/entry.ts"], bundle: true, platform: "node", format: "cjs", outfile: out, external: ["obsidian"], logLevel: "error" });
await import(pathToFileURL(out).href);
