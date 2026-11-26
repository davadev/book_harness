# Repository discovery (Phase 0)

Date: 2026-11-26. Method: read-only inspection of local checkouts. Nothing in either upstream repo was modified.

## 1. Access and environment

| Item | Finding |
|---|---|
| Playbook | Private repository; accessed via a local checkout. No access blocker. |
| Timeline plugin | Public repository `davadev/obsidian_timeline` (local checkout, HEAD `7f1611d`), plugin `timeline-xml-sync` v0.13.2, MIT licence (c) davadev, `isDesktopOnly: false`, `minAppVersion 1.13.0`. No access blocker. |
| Toolchain here | Node v26.13.1, npm 11.20.0, git 2.54. Playbook requires Node ≥ 22.12 and npm ≥ 11.10: satisfied. |
| Target workspace | Contained only the master prompt at discovery time. |
| Devices | This is a remote/automated session: **no Obsidian desktop or mobile runtime is available to the agent.** All platform behaviour must be validated on the author's devices; until then it is recorded as untested (`COMPATIBILITY.md`). |

### Read depth

- Core playbook docs were read in full or by rule list; remaining docs are read before the phase that needs them.
- **Timeline plugin:** read `AGENTS.md`, `docs/architecture.md`, `docs/markdown-schema.md`, `package.json`, `manifest.json`, `src/timeline/{model,date,event-source,overlap}.ts`, `src/obsidian/vault-adapter.ts` (head), and the import graph of `src/renderer/`. Not yet read: renderer internals, `cache.ts`, `sync-policy.ts`, `inspector-view.ts`, `settings*`.
- **Not found:** the master prompt says to follow "the playbook manual" for Ollama generation/embedding integration. The playbook has **no Ollama manual**; `AI-FEATURES.md` covers LLM features generically and mentions a local Ollama-style provider only in §7. Embeddings, model discovery and mobile endpoints are not covered. Ollama's own API documentation must be consulted (verify upstream) — recorded as `DECISIONS.md` O-2.
- **Not found:** the "Jeff-style decision provider". No local document describes its serving interface. Recorded as O-1; the surface must be designed behind an interface and the real protocol investigated with the author.

## 2. Playbook conventions that bind this project

Omitted from this public copy: the playbook is a private repository, so its rule summaries are not reproduced here. The project adopts the playbook by reference (build/lint/coverage/release gates, mobile and data-safety rules, editor-extension and side-panel guidance, AI-feature rules). Session notes with the detailed summary are kept privately. Where this repository's docs cite a playbook rule, it is as a constraint name only.

## 3. Conflicts and tensions between playbook and master prompt

| # | Tension | Resolution (see `DECISIONS.md`) |
|---|---|---|
| C-1 | Playbook AI rule "confirm step with cost estimate" targets paid hosted APIs. Master prompt is local-only, no cloud fallback. | Keep the *disclosure* (what is sent, to which endpoint, scope of job) in the job-authorization UI; omit monetary cost. D-007 |
| C-2 | Playbook "one repair call" vs master "controlled retries". | Keep both: one schema-repair call per model call; separate bounded transport retries for network/timeouts. D-007 |
| C-3 | Master: "register without rewriting manuscript files"; also "minimal chapter identification properties are permissible if necessary". A frontmatter ID rewrites the note. | Registry-first identity (no write); optional explicit opt-in anchor property. **Needs author decision (O-4).** D-010 |
| C-4 | Playbook: no indexing at startup. Master: BM25 updates automatically. | BM25 maintained incrementally after `onLayoutReady`, per changed file, chunked and yielding; full rebuild is user-initiated. Never at `onload`. D-011 |
| C-5 | Playbook `tsconfig` template `lib` lists ES2020/ES2022 entries while `MOBILE-RULES` says the floor is ES2018. Internal inconsistency. | `lib` ES2018 + DOM; esbuild `target` es2020 syntax only after the Phase 1 mobile spike confirms the WebView floor. D-004 |
| C-6 | Playbook 100 % coverage vs large UI/layout surfaces (preview, PDF). | Pure-core extraction so layout/solver logic is unit-tested; UI shims tested via happy-dom; never `v8 ignore`. Coverage ratchet starts at Phase 1. |
| C-7 | Playbook: heavy dependencies discouraged ("prefer none, maintained and boring"). Publishing/NLP need libraries. | Per-library ADR with licence, size, mobile runtime check (spikes S1, S3). |
| C-8 | Playbook release flow is prerelease-first via BRAT; no mention of plugin-store constraints for network use to LAN endpoints. | Disclose network use in README/settings per official policy. |

## 4. Timeline plugin: reuse inventory

Architecture (from `docs/architecture.md`): three rings — `src/timeline/` pure logic (vitest `node`), `src/renderer/` DOM-only (jsdom tests), `src/obsidian/` integration. CSS prefix `txs-`. Markdown schema: nested `timeline:` YAML object is source of truth with top-level mirrors; `last_synced_xml_mtime` stamps; per-path self-write TTL map; CAS-guarded writes (`replaceIfUnchanged` inside `vault.process`).

| Component | Where | Reusable? | Notes / adaptation |
|---|---|---|---|
| Windowed chart (tile ring, native scroll, pinch without DOM churn, ResizeObserver, MAX_SCROLL_PX paging) | `renderer/windowed-chart.ts`, `time-window.ts`, `zoom-math.ts` | **High** | Built for the iOS WKWebView memory kill; mobile-proven. Needs an *axis abstraction*: today it maps dates → Julian day → pixels. Book Harness also needs an ordinal axis (narrative view) and an uncertainty-band axis (world view). |
| Axis ticks (centuries → hours) | `renderer/axis-ticks.ts` | Medium | Gregorian-only; keep for absolute-anchored world axis; add abstract-relative axis ticks (no calendar). |
| Bar renderer, callouts, text-metrics, tooltip | `renderer/bar-renderer.ts`, `callouts.ts`, `text-metrics.ts`, `tooltip.ts` | **High** | Bars require definite `start`/`end`. Must add rendering of intervals with *uncertain edges* (hatched/gradient bounds), unknown-time events (parked lane), and partial-order links. |
| Lane assignment | `timeline/overlap.ts` (`assignLanes`) | Medium | Greedy by `compare(start)`; assumes total order of definite dates. Needs a variant over projected interval bounds; unrelated events must not look ordered (layout position ≠ ordering claim). |
| Filter bar, list renderer | `renderer/filter-bar.ts`, `list-renderer.ts` | Medium | Category/label/search filters reusable; adapt to entity/chapter filters. |
| `VaultAdapter` | `obsidian/vault-adapter.ts` | **High** | Vault-only IO, `process` writes, `replaceIfUnchanged` CAS, `trashFile`. Matches playbook; become the base of the Book Harness `VaultPort`. Must be wrapped so chapter-note writes route through the manuscript gate. |
| Cache patterns (mtime-keyed, metadataCache invalidation, id→path index), `app-storage`, `device-prefs`, `logger` | `obsidian/cache.ts`, `app-storage.ts`, `device-prefs.ts`, `logger.ts` | High (patterns) | Copy conventions; the logger and storage wrappers are playbook-lint compliant. |
| Sync-conflict primitives (`sync-policy`, stamp/skip, self-write TTL map) | `obsidian/sync-policy.ts`, `main.ts` | Medium | Concepts reusable for divergence detection; Book Harness needs revision-hash based detection, not mtime. |
| Test utilities (`testUtils/obsidian.ts` stub, `fake-app.ts`, DOM polyfill) | `testUtils/` | **High** | Faster than rewriting; replace with the playbook `templates/tests/__mocks__` when scaffolding, port useful fake-app pieces. |
| Frontmatter parse/write | `timeline/markdown-parser.ts`, `markdown-writer.ts`, `meta-note.ts` | Low-Med | Event-specific. Patterns (nested YAML object + mirrors, preserve unknown frontmatter) transferable. Uses `yaml` package. |
| XML parser/writer, era notes, export-to-PNG | `timeline/xml-*`, `era-md.ts`, `obsidian/export.ts` | Low | Timeline Project `.timeline` interchange is not a Book Harness requirement. Era notes could map to "story eras" later. PNG export may help timeline publishing; not required. |
| Release/CI/guards | `scripts/`, `.github/`, `docs/releasing.md` | n/a | Same templates as the playbook; take from the playbook templates, not from here. |

### Assumptions in the timeline plugin that must **not** be inherited

1. **Every event has absolute dates.** `TimelineEvent.start/end: TimelineDate` are mandatory; `isPoint` derived from equality.
2. **Precision is flattened by comparison.** `date.ts#compare` completes missing month/day to 1 and time to 0, so a year-only date sorts as 1 January. Book Harness requires "a year is not a known exact day". The solver must use its own precision-carrying time type; `TimelineDate` is acceptable only as a *display projection* of a resolved bound.
3. **Proleptic Gregorian calendar only** (Julian-day layout via `toJulian`). Fictional/unsupported calendars need explicit "unresolvable" representation (spec §16).
4. **Total order drives layout.** Lanes and axis assume a total order; Book Harness must expose partial orders and unknowns without inventing order.
5. **Source of truth is an XML file** with an MD mirror. Book Harness has no external XML; Markdown is the only truth.
6. **Sync model is import/regenerate from XML.** Irrelevant here.

### Reuse mechanism (open)

The timeline repo is a plugin, not a library; its renderer cannot be imported as a package. Options: (a) vendored copy with provenance header and a divergence log; (b) extract `@davadev/timeline-render` into a shared package (modifies upstream — **requires authorization**); (c) rewrite. Recommendation (a) for V1 with the axis abstraction added in our copy and an upstream-contribution note. Licence is MIT with the same owner, so reuse is permitted; keep the notice. **Decision O-5.**

## 5. Reuse from other local repositories (not named by the spec)

Noted only; not inspected deeply and not assumed reusable: `query_tool` (Beroea: semantic search with API/MCP servers, Python), `timeline_MCP` (embedding search over timeline events, Python), `obsidian_cat_discovery`, `obsidian_chinese_comprehensible_input` (playbook source; has an own CodeMirror editor and tokenizer-based decorations — a useful worked example for editor decorations and tokenization on mobile), `obsidian_liteparse`. `ollama-tailscale-setup.md` documents how the author exposes Ollama to other devices over a private tailnet (bind on all interfaces; Ollama returns 403 for a non-local `Host` header when bound to loopback) — directly relevant to mobile model access (`COMPATIBILITY.md` §4). No hostnames or addresses from it are to be committed.

## 6. Architectural risks surfaced by discovery

Full register in `RISKS.md`. Highest:

1. **Mobile PDF rendering** (no `printToPDF`, no Pandoc, no child processes): needs a pure-JS PDF path or a decision to limit PDF fidelity on mobile. (R-1)
2. **Editor decoration performance and correctness** on large chapters on mobile; diff widgets that alter vertical layout need a state field. (R-2)
3. **Timeline renderer coupling to total order / Gregorian dates.** (R-3)
4. **Stable chapter identity vs "don't rewrite manuscripts".** (R-4)
5. **Sync conflicts on many small managed notes** across cloud-sync providers without `.obsidian`. (R-5)
6. **Mobile suspension during long jobs; `requestUrl` cannot stream.** (R-6)
7. **Language-aware POS tagging/tokenization on mobile** within bundle-size limits. (R-7)
8. **Embedding index size/time on mobile**; indexes must be disposable. (R-8)
9. **Coverage bar (100 %) against UI-heavy code.** (R-9)
