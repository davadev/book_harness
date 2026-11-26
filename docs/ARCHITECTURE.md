# Architecture and data model

Status: **design baseline (Phase 0), proposed.** Items marked **[confirmed]** come from the master prompt; **[design]** are choices recorded in `DECISIONS.md`. Nothing here is implemented yet.

## 1. Layering

Same three-ring discipline as the timeline plugin, with a fourth port ring for testability.

```
src/
  core/        PURE. No obsidian, DOM, Node. Unit-tested under vitest `node`.
    ids/ revision/ model/ registry/ markdown/ (parse+serialize managed notes)
    jobs/ invalidation/ proposals/ diff/ segmentation/ proofread/
    knowledge/ entities/ occurrences/ search/ (bm25, rrf, graph)
    temporal/ stats/ translation/ todos/ publishing/ (layout model, paginator, epub model)
    ai/ (prompt registry, contracts, validation, orchestration)
  platform/    Obsidian-facing adapters (the ONLY importers of `obsidian`)
    vault-port, manuscript-gate, settings, secrets, network (requestUrl/fetch), device-store
    editor/ (CM6 extensions), views/ (ItemView panel, preview leaf), commands, events
  ui/          DOM rendering (side panel tabs, modals, review controls). Container-query layouts.
  main.ts      registers only; heavy work in onLayoutReady.
  tests/       *.test.ts only (playbook: helpers live outside tests/)
testUtils/     fakes: fake vault, fake clock, fake model provider, fixtures loader
fixtures/      synthetic books (public); temporal corpus; proofreading, translation, search
```

Rules: `core` depends on nothing outside `core`; `platform` and `ui` depend on `core`; ports (`VaultPort`, `ClockPort`, `NetworkPort`, `ModelPort`, `StoragePort`, `EditorPort`) are interfaces declared in `core` and implemented in `platform` — all jobs, gates and stores are tested against fakes.

## 2. Identity model **[confirmed: stable IDs independent of names/paths]**

- IDs are opaque, prefixed, lowercase, URL-safe, collision-resistant: `bk_`, `ch_`, `nt_` (note), `en_` (entity), `ev_` (event), `oc_` (occurrence), `fc_` (fact), `ev_ref_`/`ev` evidence ids `evd_`, `pr_` (proposal), `jb_` (job), `sg_` (segment), `tr_` (translation variant), `cv_` (chat). Generator: 80-bit random (crypto when available, fallback seeded from time + counter + vault-unique salt), encoded base32. Generation is the only nondeterministic id source; everything else is derived by hash.
- **Book ID** lives in the book config note. **Chapter ID** is a logical slot ID (survives file deletion, replacement, rename, translation). A chapter slot **binds** to zero or one primary note and zero or more translation variants.
- **Note identity (`nt_`) — [design, decision pending O-4 / D-010].** Default: *registry binding* — the registry records `path`, last known content hash, and Obsidian `rename`/delete events update the path. Recovery when the binding is lost (external move, sync rename): content-hash + head-snippet match proposes a re-bind for author confirmation; never auto-bind ambiguously. Optional per-book *anchor property* mode writes one frontmatter property (e.g. `bh_id`) at registration **only with explicit opt-in**; the plugin then verifies the body bytes were not touched.
- Redirects: merged/split entities and events leave a `redirect` record (`old_id → new_id[]`, reason, decision id) so old references resolve; references are updated transactionally in the same operation, not lazily.

## 3. Markdown persistence layout **[confirmed principle; layout is design]**

All paths relative to the author-selected **book folder**. Manuscript notes stay wherever the author keeps them inside (or, by registration, outside the folder if the author chooses — see below). Managed state lives in a dedicated child folder (name configurable, default `_book-harness/`):

```
<book folder>/
  <author's notes ...>                 # manuscript; never moved or rewritten by registration
  _book-harness/
    book.md                            # book config (schema_version, id, languages, requirements, publication defaults)
    registry/
      chapters.md                      # ordered slots: id, designation, status, binding, plan notes (YAML list in fenced yaml block)
      notes.md                         # note bindings, content hashes, anchor mode
    chapters/<ch_id>.md                # per-chapter state: revisions, task states, summary (AI-managed block), author notes
    entities/<type>/<en_id>.md         # entity: properties + AI-managed + author-managed sections
    events/<ev_id>.md                  # event + evidence + temporal assertions
    occurrences/<ch_id>.md             # bulky machine records: ranges, anchors, rev (fenced blocks)
    constraints/<scope>.md             # temporal constraints (AI-extracted vs author-confirmed separated)
    proposals/<pr_id>.md               # manuscript proposals and findings awaiting review (persisted)
    proofread/<ch_id>.md               # per-segment proofreading coverage
    translations/<lang>/<ch_id>.md     # translated chapter variants (readable text)
    translations/<lang>/_align/<ch_id>.md  # alignment, baselines, conflicts
    jobs/<jb_id>.md                    # job ledger: scope, authorization, state, fingerprints (pruned)
    findings/<fi_id>.md                # contradiction/character-depth findings + author decisions
    chats/<cv_id>.md                   # conversation transcripts with citations and model metadata
    prompts/<task>.md                  # prompt overrides (versioned, validated)
    publishing/                        # template.md, chapters/<ch_id>.md layout instructions, assets map
    snapshots/<ch_id>/<rev>.md         # baseline snapshots needed for diff/3-way (retention policy O-10)
    todos.md                           # manual author TODOs only; derived TODOs are never persisted
    migrations.md                      # schema version history + applied migrations
```

Principles:
- **One record per note where records are independently edited/synced** (entities, events, proposals, jobs, chats, findings) so cloud-sync conflicts are record-local. Bulky machine data (occurrences, alignment, solver caches) is sharded **per chapter** in fenced blocks inside a dedicated note.
- **Managed note shape:** YAML frontmatter (`bh_schema`, `bh_type`, `bh_id`, `bh_book`, `bh_rev` content revision) + human-readable body with explicit **AI-managed** and **author-managed** regions, delimited by stable Markdown headings (`## Description (AI-managed)`, `## Author notes`). Machine blocks are fenced (` ```bh-records `) JSON/YAML with a schema tag. Never HTML-comment markers in manuscript notes; comment-delimited regions are allowed in *managed* notes only if headings prove insufficient.
- **Atomicity:** write via `vault.process` CAS (compare inside callback); creation with `vault.create`; deletion via `fileManager.trashFile`. Multi-record operations (merge/split) are journaled: a `jobs/` operation note records intent first so a crash can be reconciled on next load without inference.
- **No secrets, endpoints or device paths** in managed notes. Device bindings in plugin-folder `device.json` (not synced via vault; not in `.obsidian` dependency for portability of knowledge).
- **Derived data** (BM25 index, vectors, graph cache, solver cache, layout cache, token stats) lives in the plugin folder (`indexes/<bk_id>/…`) and is disposable; each artifact stores the revisions/fingerprint it was built from.
- **Portability test:** copying `<book folder>` alone to a fresh vault + plugin install reproduces structure, knowledge, review state, prompts, chats, proposals and layout; indexes rebuild.
- **Book location constraint:** manuscript notes outside the book folder would break the copy test; the registry supports external bindings with a loud "not portable" warning.

## 4. Revisions, fingerprints, invalidation **[confirmed]**

- **Revision** of a source = SHA-256 (or the S6-chosen hash) over the normalized body text (frontmatter excluded; line endings normalized; no other normalization so byte-level edits are detectable). Stored in registry and per-chapter state; cheap to recompute on `modify`/`metadataCache` events (debounced). Hash computing is deterministic and inference-free.
- **Task input fingerprint** = hash of `{task id, task schema version, prompt version + override hash, model logical id + binding fingerprint, source revisions (primary), dependency revisions (e.g. summaries, entity set), segmentation version, options}`.
- **Dependency graph** is declarative (`core/invalidation`): task → inputs. Changing an input revision marks dependents **stale** (never "wrong"); UI wording: "may be out of date". Propagation covers summaries, entity histories, temporal constraints, translations, proofreading coverage, embeddings, findings. Recalculation of deterministic derived data (solver output, TODOs, statistics) is automatic and does not call models.
- **Snapshots:** baselines needed for diff and three-way comparison (proofreading original/proposed, translation last-synced source/target) are stored as snapshot notes with hash; retention = only those referenced by an open proposal, a current baseline, or an undo window (O-10). Large history is not kept.

## 5. Task / job model **[confirmed states; machine is design]**

Per (task × scope) state, independent: `not_processed → current`, `stale`, `queued` (authorized), `running`, `failed`, `canceled`, `review_required`, `conflict`.

```
Authorization (user action, scope, tasks, dependency set, expiry)
   -> Job (id, tasks[], scope, fingerprint inputs, attempts, state, progress)
   -> Subtasks (bounded concurrency, per-call timeout, schema validation, controlled retry)
   -> Commit (idempotent, revision-checked): output keyed by (task, scope, input fingerprint)
```

- **Idempotent commit:** records are keyed by deterministic `(task, scope, evidence id)`; replays overwrite rather than duplicate. Commit requires `source_revision_at_commit == fingerprint.source_revision`; otherwise the output is stored as `stale_result` (discarded or offered), never as current.
- **Authorization lapse:** persisted jobs resume only if the authorization record is valid (not expired, same fingerprint inputs, device present); on mobile resume a banner asks to continue. Startup *reconstructs* the ledger but runs nothing.
- **Deduplication:** repeated saves update a single pending marker per (task, scope); no queue growth.
- **Independence:** each subtask commits independently; failures leave other results intact; partial batch results are reported.
- **Cancellation:** `AbortController` through the model port; in-flight results after cancel are dropped.
- **Reanalysis reconciliation (chapter-sourced evidence):** every extracted fact/occurrence/event/assertion carries `source_chapter + source_revision + source_passage`. Re-extraction for a chapter produces a *candidate set*; reconciliation (deterministic, in `core/knowledge`) diffs against stored chapter-sourced evidence: matching evidence is refreshed, unsupported evidence is **retracted** (marked, not hard-deleted until author sees an impact summary where author-confirmed items depend on it), other chapters' evidence is untouched, **author-confirmed facts/decisions are protected** and turned into explicit `conflict` records when evidence disappears.

## 6. Startup, lifecycle, safety

- `onload`: wrap whole body (sticky `Notice` on failure), register commands/views/settings/events only. `onLayoutReady`: reconstruct registries from managed notes (read-only), schedule *deterministic* work only (hash changed files, mark stale, derive TODOs, incremental BM25) with yielding (`setTimeout 0` chunks) and `try/catch` per piece. **No inference and no embedding on startup. No large reads in `onload`.**
- Crash-loop guard: adopt the playbook template; here optional — recommended because indexing/hash work runs at startup (D-009, decide at Phase 1).
- Never write on load/navigation/sync. Managed-note writes happen from user actions or from deterministic maintenance explicitly allowed (revision stamps, stale markers) — these maintenance writes are limited to *managed* notes, batched, and skipped when unchanged.
- Divergence detection: each managed note carries `bh_rev` (content hash) and `bh_parent` (hash it was derived from). A write that finds `current hash ≠ expected` is a conflict, preserved in a `conflicts` list (`.conflict` sibling note) and surfaced as a review item; never overwritten. Detection of sync-provider conflict files (`name (conflict ...).md`, `.sync-conflict-`) is best-effort and reported.

## 7. Multi-book isolation **[confirmed]**

Every record carries `bh_book`; every query API requires a `BookScope` object (type-level: functions accept `BookScope`, not raw ids); indexes, caches and job queues are namespaced by book; prompt overrides are per book; entity-name resolution is within the book. Test: two books with identical character and chapter names yield disjoint search, graph, extraction, TODO and export results.

## 8. UI architecture (summary; detail in Phase 2)

One `ItemView` side panel, context-aware by active file → resolves (book, chapter/entity/etc.) through the registry. Tabs: Overview, Entities, Timeline, Writing/Review, Translation, Search/Chat, Tasks/Progress, Publishing (mobile: tab strip scrolls; each tab lazy-draws only when visible). Inactive state for unrelated notes with a minimal "Register/Promote this note" entry. Commands + ribbon + file-menu entries for open overview and promote (no circular activation). Editor surface: decorations (entities, diff) via CM6; publishing preview in a workspace leaf.
