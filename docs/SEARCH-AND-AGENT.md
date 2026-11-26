# Hybrid search, knowledge graph and conversational agent

Status: **design baseline, proposed.** Phase 7 (search/graph) and Phase 11 (agent).

## 1. Corpus and segmentation

- **Deterministic passage segmentation** (`core/segmentation`, shared with proofreading): structural blocks → passages of bounded size (target ~150–250 words, paragraph-aligned, never crossing chapter boundaries; dialogue-heavy runs grouped). Passage ID = `chapter_id + block ordinal + text hash prefix`; **stable reference** = `{book, chapter_id, passage_id, source_revision, start, end}`; re-resolution after edits uses quote + anchors, else marked stale (never a wrong highlight).
- **Corpus layers (book-scoped, language-scoped):** primary manuscript passages (authoritative), managed knowledge (summaries, entity descriptions/histories, events, findings) as separate document types with provenance tag (`manuscript | derived | author_canon`), translations indexed per language edition, never mixed.

## 2. Retrieval

| Stage | Choice | Notes |
|---|---|---|
| Keyword | **BM25** over a tokenised inverted index (in-house, small, pure TS; alternatives MiniSearch/FlexSearch evaluated by ADR on size/licence/mobile) | Exact names, fictional terms and phrases: boost via entity/alias dictionary and a phrase-match channel; per-language tokenisation; no stemming for fictional-term channel. Updates **incrementally** per changed passage after `onLayoutReady` (deterministic, no model). |
| Semantic | Embedding vectors per passage (and per managed record), brute-force cosine on normalised `Float32Array` (feasible for book scale; revisit ANN only if measured necessary) | Embedding **generation requires explicit authorization**; a query embedding within a user-initiated search/chat is authorized by that request; rebuilding a stale corpus index is a separate, explicit operation unless the user included it. |
| Fusion | **Reciprocal Rank Fusion** (k default 60, tunable) over rank positions — never raw score mixing; optional weights per channel; stable tie-breaks | Evaluate against a labelled fixture set; record the evaluation. |
| Result | `{ref, snippet(with highlighted match spans), source_revision, provenance, channel ranks, linked entities/events}` | Linked entities from occurrence records; events from evidence records. |

**Freshness & degradation:** index state per (book, language, layer, model): `current | partially_stale | stale | missing | incompatible_model`. Searches disclose state; stale/missing vectors → automatic fallback to *current* BM25 with a banner; vectors for unchanged passages remain usable while changed ones are excluded (never silently included with stale text). Model/dimension/digest change → incompatible → stale. Stored in plugin folder (`indexes/<bk>/<lang>/…`), disposable, with manifest of built-from revisions. S6 decides binary format and worker use.

**Isolation:** index namespaces by book and language; API requires `BookScope`.

## 3. Knowledge graph

Logical graph materialised in memory from managed notes (lazy, cached by revision); node types: Book, Chapter, Passage, Entity (typed), Event, Occurrence, Description, Fact, Evidence, Relationship, TemporalConstraint, Finding. Edges are either **observed** (from records with provenance + revision) or **inferred** (computed, flagged `inferred`, with the rule/evidence that produced it); consumers always see which. Traversal API: `neighbors(node, {types, depth, budget})`, `expandPassage(ref, budget)` → entities (with aliases), their relevant history snippets, linked events (with resolved temporal data), relationships; bounded by node/token budget with deduplication and source-aware ranking (primary evidence before derived summaries). Obsidian native links may appear in managed notes; manuscript stays link-free.

## 4. Conversational agent (spec §17)

- **Initiation = authorization** of a bounded loop: `maxModelCalls` (e.g. 8), `maxToolCalls` (e.g. 16), per-call and wall timeouts, `maxContextTokens`; visible step list, cancel button; typed error states (provider unreachable, budget exceeded, malformed tool call, canceled).
- **Read-only tools** (the *only* tools): `search(query, scope, mode)`, `read_passage(ref)`, `read_chapter(chapter, range?)`, `book_structure()`, `get_entity(id|name)`, `get_entity_history(id, chapter range?)`, `get_occurrences(id)`, `get_relationships(id)`, `get_chapter_summary(ch)`, `get_event(id)`, `get_timeline(view, filter)` (**resolved** timeline from the solver, with uncertainty), `get_processing_status()`, `expand_context(ref)`. No write tools to manuscript, knowledge, translations; chat persistence is performed by the harness, not a tool.
- **Tool protocol:** harness-defined JSON tool-call format validated by schema (not free text); tool results wrapped as untrusted data blocks with source labels; model output that tries to call unknown tools or exceed limits is rejected. Retrieved passages containing instructions are treated as data (injection fixtures).
- **Answer assembly requirements:** each claim cites actual refs (clickable → opens chapter at passage, or managed record); citations verified deterministically (ref exists, quoted span present at cited revision); prefers primary evidence on conflict with derived summaries; labels **author-only canon**, **reader revelation (first narrative mention)**, **character-specific knowledge** separately; warns on stale indexes/derived data, missing/unwritten chapters, unresolved temporal evidence; never claims exhaustiveness. Chronology answers use solver output only (the model is told the order; it does not sort).
- **Persistence:** `chats/<cv_id>.md` — transcript, citations (refs + revisions), model profile id/digest, tool-call log summary, no secrets. User can open/delete; deletion via `trashFile`.
- **Context budget:** tokens reserved for system/tools/history/evidence; evidence selected by RRF rank then graph expansion; dedupe by passage id; summaries only when primary evidence is unavailable and marked as derived.
- **Mobile:** non-streaming; progress is step-based; request timeouts conservative; suspension → job marked interrupted, resume asks the user.

## 5. Tests

BM25 finds invented terminology; semantic retrieval finds a paraphrase (real-embedding eval opt-in; CI uses fixture vectors); RRF unit tests with synthetic rankings; freshness states and fallback; cross-book isolation; agent: scripted mock model drives tool loop; cap enforcement; cancellation; write-tool absence (type-level and runtime); injection fixtures; citation verification.
