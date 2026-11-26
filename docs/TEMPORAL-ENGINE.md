# Temporal engine

Status: **design baseline, proposed; expected to iterate** (spec §16). Phase 8, developed in the order the spec prescribes. The solver is pure TypeScript with no model dependency and is tested independently of extraction.

## 1. Principles

LLM: extracts events, participants, explicit times, durations, relative evidence (with quotes). Software: identity, validation, constraint solving, ordering, rendering. **The model never produces the authoritative sorted timeline.** A partial order is a valid result; layout position is not an ordering claim.

## 2. Event identity and evidence

- `Event { id, canonical_label, aliases[], participants[entity ids + instance qualifier], kind, status: confirmed|candidate|unresolved, redirects }`. Description text is non-identifying.
- `Reference { id, event_id | unresolved, chapter, passage ref, source_revision, narrative_ordinal, quote, kind: narration|flashback|flashforward|dream|belief|rumor|plan }` — distinguishes *references to* an event from the event itself.
- `Assertion { id, event_id(s), dimension: world|narrative|character:<instance>, form, evidence[], uncertainty, provenance: extracted|author_confirmed|calculated, source_revision }`. **Calculated** results are never stored as assertions; they are solver output, recomputed.
- Candidate matching (propose only): shared entity IDs, lexical/semantic retrieval, temporal compatibility; similar descriptions are never identity proof; recurring and time-travel duplicates stay distinct unless author-confirmed. Manual create/correct/merge/split with redirect records and transactional reference updates. Author decisions persist (`decision` records) and are not re-asked absent new conflicting evidence.
- Unresolved references stay explicit `unresolved` nodes.

## 3. Time representation

- **Quantity model:** all solver values are integer ticks on a chosen base unit per timeline (default seconds), with a **precision tag** (`year|month|day|hour|minute|second|era|unknown|abstract`) and, for each time point, an **interval of possible values** `[lo, hi]` (± ∞ allowed). A year-only date is the interval covering that year, *not* 1 January. Display projection rounds to precision.
- **Calendars:** V1 supports (a) abstract/relative time (no calendar), (b) proleptic Gregorian with BCE, via conversion functions in `core/temporal/calendar`. Julian/other real calendars and fictional calendars: expressions that cannot be converted are stored as `unresolvable_calendar_expression` with raw text, shown, and excluded from numeric solving; a calendar-definition extension point (units, epoch, month lengths) is specified but its V1 scope is decision O-9. Never fabricate conversions.
- Constraint forms (all with evidence ids and provenance): `at(point, interval)`, `within(range)`, `before(a,b, gap?)`, `after`, `meets/overlaps/during` (Allen subset via endpoint constraints), `simultaneous`, `offset(a, b, [min,max])` ("three days after"), `duration(e, [min,max])`, `approx(point, center, tolerance)`.

## 4. Solver (deterministic)

Models each event as start/end time points (+ optional personal-chronology points). Constraints compile to **difference constraints** `t_j − t_i ≤ w` (simple temporal network with interval bounds). Algorithm: Bellman–Ford/Floyd–Warshall style propagation to tighten bounds (book-scale graphs; incremental optional later), **negative-cycle detection** ⇒ inconsistency, returning the cycle's constraints and their evidence for the author. Strict "before" without a gap uses ≥1 tick separation. Absolute anchors enter as constraints against a distinguished origin point `Z` (so adding/removing an anchor changes only constraints; nothing is cached as truth). Derived bounds record their **support path** (predecessor chain) so each calculated value cites its evidence. Retraction = recompute from the current asserted set (pure function), so removing evidence automatically retracts consequences.

Outputs: `Resolved { events: {id → {start:[lo,hi], end:[lo,hi], definite:boolean, support}}, order: partial order (transitive reduction of certain relations), unordered pairs, conflicts[], unresolved[] }`. Topological ordering is produced **only** for relations the constraints entail; unrelated events have no order. Optional "display order" for a renderer is a separate function that is explicitly not factual and is labelled.

## 5. Three chronologies over one event set

1. **Narrative:** order of references by (chapter order, passage position) — fully deterministic from the registry and occurrence/reference records; no solver needed. Reference order ≠ event order.
2. **World:** in-universe constraints solved as above; time travel is not a contradiction here: a traveller's *two instances* appear at different world times.
3. **Character experienced:** per **character instance** (e.g. `en_x#young`, `en_x#old`): each instance has a personal chronology (ordering of experiences/ages), constrained separately; links between instances at world time (older meets younger) are explicit relations. Constraints are scoped `(dimension, instance)`. Knowledge/aging/causality reasoning uses the instance chronology; never reading order.

## 6. Rendering

Reuse the timeline plugin's windowed chart behind an **axis interface** (S7): `OrdinalAxis` (narrative), `CalendarAxis` (anchored world), `AbstractAxis` (relative-only: positions come from solver's tightest bounds but are drawn with an explicit "relative, not to scale" flag). Visual encoding of uncertainty: interval whiskers/hatched edges for ranges, outline vs solid for calculated vs asserted, dashed link for partial-order edges, a parked "unknown time" lane, conflict badge with evidence popover. Layout-only ordering is visibly distinguished. Filters by chapter, entity, instance, dimension. Entity/chapter views embed projections. Correction UI: edit assertion, confirm/reject extracted evidence, merge/split events, resolve conflicts.

## 7. Development order (spec §16)

1. Narrative view (no solver). 2. Event extraction + evidence store (no relative reasoning). 3. Constraint model + solver with unit tests. 4. Cross-chapter reconciliation and identity. 5. Non-linear/personal chronology. 6. Correction UI. Each stage is released behind its own acceptance rows; extraction quality is evaluated separately from solver correctness.

## 8. Fixture corpus (synthetic; `fixtures/temporal/`)

Each fixture: source text (when extraction is evaluated), `expected.assertions.json` (extraction target), `expected.resolved.json` (solver result), notes. Cases: A<B, B+3d<C no dates → relative order preserved; add anchor → derived dates; remove anchor → retraction; unknown times; approximate ranges; simultaneous; unrelated events (no order); offsets; flashbacks; repeated description of one event; **distinct recurring events** (not merged); contradictory evidence (negative cycle with evidence); time travel; younger/older selves; rewritten chapter (evidence removal); removed anchors; unresolvable calendar expression. Solver tests run with no model; extraction evaluation is an opt-in separate suite with recorded model versions.
