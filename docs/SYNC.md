# Synchronisation safety

Book data is synchronised by **another plugin** (WebDAV to Nextcloud; file-level, last writer wins, no merging). Book Harness does not sync anything itself. Its job is to be safe to sync: be quiet, never depend on timestamps, never silently overwrite, and show what a sync tool broke.

## What Book Harness writes, and when

| Where | What | When |
|---|---|---|
| `<book>/_book-harness/**` (managed notes) | book, chapter, entity, task-state, job, proposal, proofreading coverage, knowledge, occurrence corrections, summaries, to-dos, prompt overrides | only on an author action or a job the author started; never on startup, navigation, typing or sync |
| The manuscript | nothing, except an accepted change applied by the author | only through the manuscript gate |
| Plugin folder `indexes/` | meaning vectors (derived, can be deleted) | when the author builds the meaning index |
| Device-local storage | server address, model names | settings changes; never synced |

## Rules the code follows

1. **No clock ordering.** Nothing uses modification times. Staleness is decided by content hashes of the text itself (properties and line endings do not count).
2. **Compare-and-swap writes.** A managed note is replaced only if it still has the text we read; otherwise the action stops with "changed on another device; try again".
3. **No write for an identical result.** Replacing a note with the same text is skipped (checked in the single vault guard), so two devices reacting to the same synced rename cannot ping-pong the file.
4. **Small, separate notes** (one per entity, chapter, job, proposal), so two devices rarely touch the same file. Bulky machine data is per chapter.
5. **Relative paths.** Records name notes relative to the book folder, so a copied or renamed folder keeps working.
6. **Conflicts are shown, not hidden.** Sync-tool conflict copies ("conflicted copy", `.sync-conflict-`) and duplicate record ids appear as required to-dos or as problems in the panel; nothing is merged or deleted for you.
7. **Reading never writes.** Drawing the panel, highlighting and search only read.
8. **Interrupted jobs.** A job record left "running" (the app closed, or another device wrote it) is shown as interrupted and is never resumed by itself.
9. **Partial arrival is harmless.** If a chapter record arrives before its note (or the reverse) the panel says "note not found"; nothing is changed in response.

## What it cannot do

- It cannot tell that a sync tool replaced a newer remote file with an older local one: file-level last-writer-wins loses that edit before Book Harness sees it. **Let the sync finish before starting work on another device**, and do not run jobs on two devices at once.
- Two devices that both change the same chapter record (order, status) at the same time keep whichever syncs last.
- Job records accumulate (one note per job). Dismissed jobs stay as notes; they are small.

## Recommendations for the sync plugin's settings

- Exclude `.obsidian/plugins/book-harness/indexes/` (large, device-specific, disposable). If it does sync, a damaged or half-synced index is treated as "not built".
- Exclude nothing under the book folder: the `_book-harness` notes are the portable knowledge of the book.
- Keep the plugin's own `data.json` (shared settings only) or exclude it; either is safe. Server address and model names are not in it.
