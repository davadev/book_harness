# Compatibility matrix and feasibility spikes

Targets (spec invariant 12): Obsidian **desktop** (Windows, macOS, Linux) and **mobile** (Android, iOS), from the first slice. `manifest.json`: `isDesktopOnly: false`, `minAppVersion 1.13.0` (declarative settings; `secretStorage` ≥ 1.11.4). Raising `minAppVersion` requires an iOS install check (playbook MOBILE-RULES rule 2).

**Status legend:** `C` = constraint known from playbook/official docs (still verify upstream); `H` = hypothesis, not verified; `S#` = needs spike; `✔` verified on a real device (none yet); `✘` verified failing.

**No platform has been tested.** The agent has no Obsidian runtime. Every cell below is a constraint or a hypothesis until a device test is recorded in `STATUS.md` §Platform test log.

## 1. Runtime facts that shape the design

| Topic | Constraint / hypothesis | Source / status |
|---|---|---|
| Node/Electron | Unavailable on mobile; `fs/path/os/child_process/electron` crash the plugin. No unconditional use. | C (playbook MOBILE-RULES 9) |
| JS floor | ES2018 API surface; no `structuredClone`, `Array.at`, `Object.hasOwn`, `replaceAll`; no regex lookbehind (iOS < 16.4). | C |
| Vault adapter | Mobile is `CapacitorAdapter`; never cast to `FileSystemAdapter` without `instanceof`. Some mobile adapters reject `.tmp` or lack `rename`. | C |
| Filesystem paths | Vault-relative only. No absolute paths, no OS path separators in stored data. | C |
| Network | `requestUrl` is the transport that works on mobile and avoids CORS; returns only the finished body (no streaming). `fetch` streams on desktop but is subject to CORS/mixed-content. | C (AI-FEATURES §4/§7) |
| LAN endpoints from mobile | `http://` to a private/tailnet host from the mobile WebView may be blocked by platform cleartext/ATS policy; behaviour unverified. | H → S5 |
| Background execution | Phone suspends the app; jobs cannot continue. On resume (`visibilitychange`) reconcile and request re-authorization where authorization lapsed. | C |
| Memory | iOS kills the WebView on large allocations (a 65 MB request killed one plugin; large compositing layers killed another). Chunk everything; avoid whole-book in-memory string concatenation of very large data; embeddings stored as compact typed arrays. | C |
| Web Workers / WASM / IndexedDB / `crypto.subtle` | Presumed present in WebViews; worker creation from a bundled blob in Obsidian plugins is unverified. | H → S6 |
| Status bar, `addAction`, some APIs | Absent/undefined on mobile; guard with `typeof`. | C |
| Clipboard / file save | Exporting a file to the user on mobile differs (share sheet vs download). | H → S1 |

## 2. Feature × platform matrix (plan of record)

| Capability | Win/mac/Linux | Android | iOS | Notes / blocking spike |
|---|---|---|---|---|
| Book registry, chapter structure, Markdown persistence | planned | planned | planned | Vault API only. |
| Context-aware side panel with tabs | planned | planned | planned | Container queries, 44 px targets, narrow-screen layouts; panel view is a standard `ItemView`. |
| Entity highlights in Live Preview | planned | **S2** | **S2** | CM6 view plugin/state field; touch tap handling inside the editor; Reading mode needs a Markdown post processor (see below). |
| Entity highlights in Reading mode | planned | **S2** | **S2** | Post-processor over rendered HTML needs text-offset mapping from source ranges; best-effort, documented limitation allowed only via decision. |
| Inline diff review with accept/reject | planned | **S2** | **S2** | State field with block/inline widgets; selection and keyboard must coexist. |
| Model access (Ollama generation/embedding) | `fetch`/`requestUrl` | `requestUrl` to reachable host | `requestUrl` to reachable host | **S5**: cleartext/LAN policy; document endpoint setup. Never assume `localhost` on the phone is the desktop. |
| Decision provider (Jeff-style) | planned | planned | planned | **S4** — interface unknown (O-1). |
| BM25 search | planned | planned | planned | Pure TS; incremental after `onLayoutReady`. |
| Embedding index (build/query) | planned | planned | planned | Float32 buffers in plugin folder; brute-force cosine; **S6** for storage/worker; mobile build time and memory to be measured. |
| Knowledge graph (in-memory from Markdown) | planned | planned | planned | Rebuilt on load lazily; measure on a long book. |
| Temporal solver and timeline views | planned | planned | planned | Pure TS solver; renderer reuse needs axis abstraction (S7). |
| Statistics / tokenization | planned | **S3** | **S3** | POS tagging language coverage and bundle size. |
| Translation workflows | planned | planned | planned | Model-dependent (reachable endpoint). |
| Chat agent | planned | planned | planned | Non-streaming over `requestUrl` on mobile; progress shown as steps, not tokens. |
| Publishing preview | planned | **S1** | **S1** | HTML/CSS render in a leaf; page-break preview needs a paginator. |
| EPUB assembly | pure-JS ZIP | pure-JS ZIP | pure-JS ZIP | `fflate`/JSZip class library; conformance with EPUBCheck in CI (Java, CI-only). |
| PDF export | **S1** | **S1** | **S1** | No `printToPDF`/Pandoc/child process on mobile. Candidates in §3. A cross-platform fidelity decision may be required (O-8). |
| Secrets (model API keys, if any) | `secretStorage` | same | same | Per device, not synced; name only in settings. |

## 3. Feasibility spikes (Phase 1 exit criteria)

Each spike produces: a throwaway branch/fixture, a written result in `STATUS.md` §Spike log, and an ADR in `DECISIONS.md`. A spike result is only "verified" for platforms where it ran on a real device; emulation (`app.emulateMobile(true)`) is recorded separately and never counts as mobile validation.

| ID | Question | Method | Exit criterion |
|---|---|---|---|
| S1 | Which EPUB packaging and PDF rendering approach works on desktop **and** mobile? | Build minimal fixtures: (EPUB) assemble OCF zip with `fflate` or JSZip, validate with EPUBCheck in CI, open in a reader; (PDF) evaluate `pdf-lib` + font embedding + own paginator, `pdfmake` browser build, `jsPDF`; test Unicode shaping (Latin extended, Cyrillic, CJK, RTL as scope decides), bookmarks/outline, links, image embedding, 300-page memory/time on a phone. | Chosen stack with measured size, memory, time, licence, and a documented fidelity delta between platforms; or an escalated decision (O-8). |
| S2 | Do CM6 decorations/widgets and tap handling work on Obsidian iOS/Android with large chapters? | Plugin spike: mark decorations from external ranges with `ChangeSet` mapping; block widget for deleted text; tap handler → side panel; 50k-word chapter; typing/selection/IME coexistence; Reading-mode post processor. | Frame/latency numbers; list of unsupported behaviours; fallback design (e.g. diff in a dedicated view on mobile) only with an explicit decision. |
| S3 | Language-aware tokenization and POS tagging on mobile? | Evaluate `compromise` (English), `wink-nlp`/`wink-pos-tagger`, `Intl.Segmenter` availability on iOS/Android WebViews, rule-based fallbacks; measure bundle and cold-start; define "true classification" vs "heuristic guess" labelling. | Per-language capability table (O-6) with honest labels; bundle budget. |
| S4 | What is the Jeff-style decision provider's serving interface? | Ask author; inspect the serving endpoint; capture sample request/response (synthetic). | Provider interface contract + test double; or a recorded blocker. |
| S5 | Can the mobile app call a reachable author-controlled Ollama endpoint, and with what constraints? | Real-device `requestUrl` to `/api/tags`, `/api/chat` (non-stream), `/api/embed` over (a) LAN http, (b) tailnet http, (c) https reverse proxy; record Host-header/403 behaviour, timeouts, large payload limits, suspension mid-request. | Documented setup matrix and error taxonomy. |
| S6 | Hashing, workers, WASM, binary persistence on mobile? | Test `crypto.subtle.digest`, pure-JS SHA-256 fallback, Web Worker from inline blob, `adapter.writeBinary` of 50 MB Float32 index, IndexedDB availability. | Decision on hash function, whether a worker is used, and index storage format. |
| S7 | Can the timeline windowed chart be driven by an abstract axis with uncertain bounds? | Vendor the renderer in a scratch plugin; replace date→pixel mapping with an axis interface; render ordinal and uncertain-interval fixtures; run on iOS. | Axis interface and fixture screenshots; list of upstream renderer changes. |
| S8 | Cross-device sync conflict behaviour of many small Markdown records. | Using the author's actual sync provider(s) (ask which): two devices edit different records; same record; rename; offline reconnect; detect divergence by content revision hash. | Conflict taxonomy and detection algorithm validated; shard-size guidelines. |

## 4. Mobile model access (author-controlled host)

Facts from the author's own setup record (kept privately): exposing Ollama on all interfaces makes it reachable via a private-network hostname; Ollama bound to loopback returns 403 for requests with a non-local `Host` header, so a reverse proxy that preserves `Host` fails — prefer binding Ollama to the network interface of the private network or rewriting `Host`. Book Harness must:

- Never default to `localhost` on mobile; show a clear first-run explanation and a connection test with typed errors (unreachable, 403 host rejected, TLS/cleartext blocked, model missing, timeout, malformed JSON).
- Document: network permissions, private-network (VPN/tailnet) setup, security (cleartext http on a private overlay vs https), disconnected behaviour (all non-AI features keep working; AI actions show a disconnected state; queued jobs do not auto-run).
- Offer no cloud fallback; no silent endpoint switching. Device-specific bindings (endpoint URL, secret name) are per device and never in synced notes.

## 5. Platform test log

Empty. Format when filled: `date · device/OS/Obsidian version · build id · scenario · result · notes`. A feature's `STATUS.md` row may say "verified on X" only with a matching log line.
