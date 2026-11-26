# AI integration and prompt registry

Status: **design baseline, proposed.** Builds on playbook `AI-FEATURES.md` (the only playbook AI manual; see DISCOVERY §1 for the gap on Ollama/embeddings).

## 1. Providers (spec §7)

Three independent provider slots with independent configuration and per-task overrides:

| Slot | Interface (core port) | Backends in V1 | Notes |
|---|---|---|---|
| Generation | `GenerateModel.chatJson(request, signal) → {text, usage?, meta}` | Ollama (`/api/chat`, structured `format` schema) | Same code path for any future provider. Non-streaming path mandatory (mobile); streaming optional on desktop only. |
| Embedding | `EmbedModel.embed(texts[], signal) → Float32Array[] + dims + model digest` | Ollama (`/api/embed`) | Index records model id, digest, dimension, normalization; any change marks the index incompatible (stale). Endpoint capability confirmed by discovery before use (verify upstream API). |
| Decision | `DecisionModel.decide({question, context, alternatives[]}) → {probabilities{alt→p}, abstain?, meta}` | "Jeff-style" provider — **interface unknown (O-1/S4)** | Functional integration surface + test double + connection test. No mandatory V1 use case; not wired into unrelated workflows. |

Provider configuration split: *logical model profile* (portable, stored in book/plugin notes: name, role, expected capabilities, default prompt-set binding) vs *device binding* (endpoint URL, model tag actually installed, secret name) in device-local storage. Connection test: reachability, auth, model present, structured-output support, embedding dimension, latency; typed errors with remedies (see COMPATIBILITY §4). Capability discovery via `/api/tags`/`/api/show` where available (verify upstream). No cloud services, no silent fallback between endpoints/providers.

Transport: `NetworkPort` with `requestUrl` as default, `fetch` streaming only on desktop opt-in; per-request timeout; abort; bounded retry with backoff for transport failures only (distinct from schema repair; D-007); concurrency limit per provider (default conservative, e.g. 2 generation / 1 embedding batch, device-configurable).

## 2. Prompt registry (spec §7)

- **Built-in prompts** are versioned TypeScript constants in `core/ai/prompts/<task>.ts`: `{id, version, system, userTemplate, inputContract, outputSchema, limits, chunking, groundingRules}`. One task = one prompt. Initial task ids (refinable, single-purpose):
  `chapter.summary`, `entities.characters.extract`, `entities.characters.describe`, `entities.locations.extract`, `entities.locations.describe`, `entities.objects.extract`, `entities.objects.describe`, `entities.resolve.candidates`, `events.extract`, `temporal.evidence.extract`, `proofread.paragraph`, `analysis.characterDepth`, `analysis.contradiction.compare`, `analysis.contradiction.plan`, `style.synonyms.occurrence`, `translate.segment`, `translate.sync.review`, `chat.agent` (planner/answer), `glossary.derive`.
- **Overrides** are Markdown notes in `_book-harness/prompts/<task>.md`: frontmatter `{task, based_on_version, schema_version, enabled}` + sections `## Extra instructions` (appended, as in playbook `PromptCustom.extra`) and optional `## System override`. The harness validates overrides on load: only system/extra text may change; output schema, validators, authorization and write restrictions are fixed. Overrides that contradict the contract (e.g. instruct to edit the manuscript, emit tool calls outside the harness protocol, request exfiltration) fail validation with a plain-language message; overrides carry a hash recorded in the task fingerprint so changing an override marks results stale (not deleted). A new built-in version shows "override based on older version" and a diff.
- **Prompt text cannot grant authority:** authorization and write gates are code, not prompt (see MANUSCRIPT-PROTECTION).
- **Manuscript and retrieved text are data:** inserted into clearly delimited data blocks; system prompt states they are untrusted content; injection tests (a chapter containing "ignore previous instructions…") are in the fixture set.

## 3. Contracts and validation

For each task: `input` (TypeScript type + serializer with a context budget), `output` (JSON schema + `normalise()` + validators returning plain-language defects). Pipeline: build → call → `extractJsonObject` (tolerant) → `normalise` → schema validate → **grounding validation** (every cited passage must exist in the supplied input with matching span/quote; model-supplied ids must exist; numeric fields clamped; enums coerced to known values) → one repair call with defects named → keep repair only if no worse → surface remaining `issues` to the author. Malformed output never mutates data (commit step only accepts validated objects). Output size bounded (max tokens + max items). Failed tasks record `failed` with reason; successful siblings unaffected.

Grounding fields: every extracted assertion contains `evidence: [{chapter_id, source_revision, quote, start, end}]` — `quote` must be a substring of the supplied text at that revision (deterministically verified); uncertainty field (`certain|likely|possible|unknown`) and `kind` (`stated|inferred|claimed|belief|rumor|dream|author_canon_candidate`).

Chunking and context limits: chapters are split on structural blocks with overlap into chunks sized from the model profile's context budget; per-task chunk merge rules are deterministic (e.g. entity mention sets union, summary chunk-of-chunks); context budget accounting is shared with the agent.

## 4. Diagnostics

Inspectable run log (`device-local`, ring buffer, optional export): task, prompt id+version+override hash, model profile + binding digest, start/end, attempts, validation defects, token usage (if reported), error class. **Input/output inspection is off by default**; enabling stores payloads only in memory/device-local and is clearly labelled (manuscript text is private). Copy-diagnostics button shows shapes, never values (playbook EXTERNAL-SERVICES rule 7). No telemetry.

## 5. Disclosure and authorization UX

Before a user-initiated job: scope (chapters, tasks, number of subcalls, bounded maximum), endpoint host, what text categories leave the device (manuscript passages, notes), dependency tasks included, cancellation hint. Replaces the playbook's monetary estimate (local models). A standing "authorize this action type for this book for N minutes" is **not** offered in V1 — each user action authorizes exactly its documented bounded workflow.

## 6. Testing strategy

- Mock model port with scripted responses (valid, malformed, truncated, injection, slow, aborted) for deterministic CI; **mocked outcomes are never reported as model quality.**
- Opt-in real-model eval harness (`scripts/model-eval.mjs`, env-gated, never in release gate) records model id/digest/date and results in `docs/evals/`.
- Contract tests from real Ollama responses (values synthetic) per playbook EXTERNAL-SERVICES rule 1 once S5 captures real answers.

## 7. Ollama API facts used (checked 2026-11-26 against Ollama's published REST reference)

- `POST /api/chat`: `model`, `messages[{role,content}]`, `stream` (false → one response object), `format` ("json" or a JSON schema), `options` (e.g. `temperature`; `num_ctx` appears in the generate examples), `keep_alive`. Response: `message.content`, `done`, `done_reason`, `prompt_eval_count`, `eval_count`, `total_duration` (nanoseconds).
- `POST /api/embed`: `model`, `input` (string or list), `truncate`, `options`, `keep_alive`, `dimensions`. Response: `embeddings` (array of arrays), `model`, `total_duration`, `prompt_eval_count`.
- `GET /api/tags`: `models[]` with `name`, `model`, `digest`, `size`, `details.parameter_size`. `POST /api/show`: includes `capabilities` (example `["completion","vision"]`; the full set is not documented) and `model_info`. `GET /api/version` → `{"version": ...}`.
- **Not documented:** error response bodies and status codes for chat/embed/tags/show/version. The client therefore never relies on an error body: it maps 403 (host rejected), 404 with a model name (model missing), other non-2xx, unreachable, timeout and malformed JSON to typed errors with remedies.
- Implemented in `src/core/ai/` (client, connection test) and `src/platform/network.ts` (`requestUrl` transport with enforced timeout/cancel). The server address and model names are device-local settings (never in synced data). Nothing is sent until the author starts an action or presses Test connection (verified by a lifecycle test, AC-C-1).
