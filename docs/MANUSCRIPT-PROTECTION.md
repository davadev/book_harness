# Manuscript protection and review service

Status: **design baseline, proposed.** Implements invariants 1 and 2 and spec §10–11. This is the highest-priority safety design; Phase 5 implements it, but the **write-gate skeleton lands in Phase 2** so no earlier slice can write prose.

## 1. Threat model

What must be impossible: any code path that changes bytes of a *primary manuscript body* (the note content after frontmatter) without (a) an explicit author keystroke/gesture in Obsidian's editor, or (b) an accepted proposal that passed revision validation. Threats: bugs in extraction/chat/translation/proofreading/stats-synonym code, failed or stale jobs, prompt injection steering a tool, sync races, bulk accept mis-scoping, refactors that add a `vault.modify` call.

## 2. The write gate (architectural, not prompt-based)

1. **Single writer.** `platform/manuscript-gate` is the only module permitted to call Vault/Editor write APIs on files bound as chapters or other manuscript notes. All other modules receive a `VaultPort` whose write methods *refuse* paths classified as manuscript (registry lookup) unless the call carries a gate-minted capability.
2. **Capabilities.** `ManuscriptWriteCapability` objects are constructible only inside the gate from: `AcceptedProposal` (proposal id + exact base revision + validated edits) or `UserRegistrationMetadata` (explicit anchor-property opt-in; body must be byte-identical — verified by comparing body slice before/after inside the `process` callback and aborting on mismatch). Types are branded so the compiler prevents forging.
3. **Static enforcement.** (a) eslint `no-restricted-syntax`/`no-restricted-imports` ban `vault.modify|process|create|rename|delete`, `editor.replace*`, `adapter.write*` outside `platform/manuscript-gate` and `platform/vault-port` (allow-listed with path check). (b) An architecture test greps/ASTs `src/` and fails on any new write call site outside the allow-list. (c) A runtime test double asserts byte equality of every manuscript fixture after running every job type to completion, failure, cancel and stale-commit.
4. **Active-note edits** use the Editor API (cursor/undo preserved; playbook: prefer Editor over `modify` for the open note) in a **single transaction annotated `userEvent: "input.bh-accept"`** so Obsidian's undo works and our own change listener recognises it as an authorized change. Background notes use `vault.process` with CAS.
5. **Metadata/ordinary manual editing** are distinct: the author typing in the editor is never gated; Book Harness registration metadata lives in managed notes by default.

## 3. Proposal model

```
Proposal {
  id, book, chapter, origin{action, task, job, model profile, prompt version},
  base_revision (hash), base_snapshot_ref,
  edits[]: { id, range{from,to} (offsets in base), anchor{prefix,suffix,quote_hash}, original, replacement, rationale?, group? },
  status: open|partially_decided|applied|rejected|stale|conflict|withdrawn,
  decisions[]: { edit_id, decision: accept|reject|defer, decided_at, base_revision_at_decision },
  created, expires?
}
```
Persisted as `_book-harness/proposals/<pr_id>.md` (readable summary + fenced records). Survives restart/sync; reopened on any device.

- **Diff computation:** deterministic (Myers/patience at word level inside paragraph blocks, then char-level for display), pure in `core/diff`; unit/property tested (apply(diff(a,b),a)=b; diff stability; no edits outside intended range).
- **Apply algorithm:** for each accepted edit, validate `current_revision == base_revision`; if not, attempt **unambiguous rebase** — locate `original` by quote + prefix/suffix anchors (Obsidian change history is not available across sessions); apply only if exactly one match with matching context; otherwise mark `conflict` and present review. Never apply by raw offset on a changed document. All accepted edits of one action apply in **one transaction** (single undo step per author decision or per bulk).
- **Bulk accept** requires an explicit control that lists the scope ("Accept 14 corrections in Chapter 3"); no implicit acceptance; never default-selected; cannot span chapters unless the author chose a multi-chapter scope.
- **Reject** leaves the document untouched and records the decision with the base revision (needed for proofreading coverage).
- **Accepted changes** flow through normal revision tracking (hash changes → dependents stale), indistinguishable from manual edits except for the proposal record. The "just-reviewed result" exemption: the gate records `authorized_resulting_revision` (hash of the text it will produce); the revision tracker compares the new hash and, if equal, marks the segment reviewed/current instead of pending.

## 4. Review UI in the native editor

- A **state field** provides decorations for pending edits (additions: highlight; deletions: struck-through inline widget/mark; replacements: both), with per-edit accept/reject controls (inline widgets with ≥ 44 px touch targets on mobile, plus keyboard commands and a side-panel list for navigation). Needs state field rather than view plugin because deleted-text widgets can change vertical layout (playbook EDITOR-EXTENSIONS §5/§6). Original text stays in the document untouched until accept; deleted text is displayed *from the original range*, added text from a widget — no temporary editing of the document.
- Colours: theme variables with `@supports` fallbacks; non-colour indicators (underline/strike/icon + aria labels) — never colour alone.
- Coexists with selection, typing, IME and entity highlights (priority ordering; decorations built from `RangeSetBuilder` in order); typing inside a proposed range marks that edit `conflict` (mapped through `ChangeSet`) rather than silently rebasing.
- Fallback if S2 shows mobile limits: a dedicated diff leaf for mobile — **only** after an explicit architectural decision (invariant 12).

## 5. Proofreading slice (spec §11)

- **Segmentation:** `core/segmentation` parses Markdown into *structurally safe blocks* (paragraphs, headings, list items, blockquotes; fenced/code/HTML/comments/images/tables/embeds are *opaque pass-through* and never sent for correction). Paragraphs are the unit; each segment has `sg_id`, text hash, offsets, structural kind. Oversized paragraphs are split at sentence boundaries into subsegments **with explicit disclosure** (never truncated); the correction of a split paragraph is recomposed deterministically and validated.
- **Per-segment call** with `proofread.paragraph` prompt (grammar/spelling/punctuation only; preserve voice, names, fictional terms, formatting, links, dialogue punctuation conventions). Deterministic guards on output: length-change ratio, preserved links/URLs/markup tokens/protected terms (names and fictional vocabulary from entities and a protected-term list), no added/removed paragraph breaks, no new sentences; violation → treated as failed segment (original retained) or flagged.
- **Coverage record** per segment: `{sg_id, text_hash, status: pending|no_change|proposed|decided, edits[], decided_revision}`. Reviewed = no change needed or all proposals decided (rejection counts). Manual edits to a paragraph change its `text_hash` → that segment returns to `pending`; unchanged segments keep status (matching by hash then by position-with-anchors to survive insertions). Modes: pending/new/modified only (default), deliberate full rerun (explicit).
- **Application loop guard:** see §3 "authorized_resulting_revision" — accepting a correction must not mark the edited paragraph as needing reproofreading.
- All edits are `Proposal` edits; proofreading never writes prose itself.

## 6. Tests required (mapped in ACCEPTANCE.md)

Byte-for-byte invariance after every non-accept path; reject preserves; accept applies only intended diff; stale/conflicting proposal cannot overwrite concurrent edit; failed job leaves proposals unapplied; architecture test for write call sites; undo consistency (desktop manual); proposals reopen from synced state; proofreading paragraph isolation and coverage semantics.
