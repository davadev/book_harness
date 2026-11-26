# Feasibility spike results

Environment for every result below: macOS, Node v26 (desktop toolchain), libraries installed with the 14-day age policy into a scratch directory outside the repo. **Nothing here ran inside Obsidian or on a phone**, so every "works" means "works in Node/esbuild browser-target bundling" and is *not* a mobile verification. Device checks are listed under "Still needed".

Date: 2026-11-26. Spike code is throwaway and not committed.

## S1 — EPUB and PDF stack (desktop-side findings)

| Library | Version / licence / last publish | Browser bundle (min / gz) | Notes |
|---|---|---|---|
| fflate | 0.8.3 · MIT · 2026-07 | 9 KB / 4 KB | Pure JS ZIP. Produced a structurally valid EPUB container with an uncompressed `mimetype` first entry. |
| JSZip | 3.10.2 · MIT or GPL-3 · 2026-09 | 96 KB / 30 KB | Works, 10× larger; dual licence needs MIT election. |
| pdf-lib + fontkit | 1.17.1 / 1.1.1 · MIT · **last published 2022** | 1339 KB / 534 KB | Low-level (no layout engine, no TOC, no outline helper); 300 pages with an embedded subsetted TrueType font in 372 ms, 286 KB; Czech/German/Slovak text extracted correctly by pdf.js. **Unmaintained**: risk. |
| pdfmake | 0.3.14 · MIT · 2026-11 | 792 KB / 293 KB (no fonts bundled) | Real layout engine (paging, tables, headers/footers, automatic TOC with working internal links). 300 chapters in 787 ms, 1.3 MB. In the browser build fonts must be passed as `Uint8Array` (no file paths). **No PDF outline/bookmarks produced** (`/Outlines` absent) — would need post-processing. |
| jsPDF | 4.2.1 · MIT · 2026-03 | 801 KB / 243 KB | Not exercised beyond bundling. |

Other findings:
- Text extraction (pdf.js) confirmed the diacritics for `ěščřžýáíéúůťďňľäöüß` round-trip with an embedded TrueType font in both pdf-lib and pdfmake output. The three required languages (English/German/Czech-Slovak) are Latin-script, so complex shaping is **not** needed; kerning/ligatures were not evaluated. No automatic hyphenation in either library.
- **EPUBCheck could not run here** (no Java). It stays a CI-only gate (GitHub runners have Java).
- `pdfinfo` is available locally for CI-style PDF inspection; pdf.js (legacy build) works for text/outline inspection.
- Markdown parsers (sizes): micromark 53 KB, marked 50 KB, markdown-it 98 KB (all MIT, maintained). Not yet compared on source-position fidelity, which block anchors need (see ADR D-021).

**Direction (not final):** EPUB = fflate + own XHTML generation. PDF = pdfmake as layout engine, plus a small outline post-processing step (pdf-lib is a heavy dependency for only that; alternatives: write the `/Outlines` objects ourselves or accept TOC-links-only and decide via O-8). Bundle cost (~300 KB gz) must be **lazy-loaded on export only**, never at plugin start.

**Still needed (device):** run the same export on iOS and desktop Obsidian to measure memory/time on a real 300-page book, confirm fonts load as `Uint8Array` from vault assets, confirm file delivery on iOS (share sheet), EPUBCheck in CI.

## S3 — Tokenization and POS tagging

| Option | Result |
|---|---|
| `compromise` 14 (English, 339 KB min / 150 KB gz) | Found most adjectives (6/6 in a test sentence) but returned tokens with trailing punctuation (`old,`) — needs our tokenizer in front. **On German and Czech/Slovak text it behaves as an English tagger and returns garbage** (e.g. a verb tagged as adjective). Unusable for those. |
| `wink-nlp` + English model (3.5 MB min / 1 MB gz) | Correct adjectives (7/7), clean tokens; too large to bundle by default; could be an optional download on user action (never at startup). |
| `Intl.Segmenter` | Works in Node for `de`, `cs`, `sk` words and sentences. **Availability in Obsidian iOS/Android WebViews unverified**; need a pure-JS fallback tokenizer (Unicode-aware regex) for mobile. |
| npm search for German / Czech / Slovak POS taggers | No maintained lightweight JS tagger found (only English-oriented `pos`, `wink-pos-tagger`). Lemmatizers found are English. |

**Direction:** statistics (counts, frequencies, repetition, sentence/paragraph length, local clustering) are language-independent and deterministic — fully in scope for all three languages. **Adjective analysis** is the language-dependent part:
- English: true POS tagging via a lazily loaded tagger (compromise as default, wink optional).
- German and Czech/Slovak: no on-device tagger available → two labelled modes: (a) **heuristic** (suffix/morphology rules; German adjectives are largely not detectable by form), explicitly labelled "heuristic guess"; (b) **model-assisted** classification by a user-initiated bounded task, aggregated deterministically and labelled "model-classified". No claim of true classification for de/cs/sk without evidence. Needs your confirmation as a scope trade-off (O-13 in DECISIONS).

## S6 — Hashing and vector storage

| Question | Result |
|---|---|
| Pure-JS SHA-256 vs `crypto.subtle` | `@noble/hashes` (MIT, 6 KB min) and `crypto.subtle` produce identical digests; 1.2 MB text hashed in 6.7 ms (noble) / 2.2 ms (subtle) in Node. |
| Brute-force cosine | 5 000 vectors × 768 dims (14.6 MB Float32) scored in ~3 ms in Node. Even at 20× slower on a phone this is far below interactivity limits; ANN index unnecessary at book scale. |

**Direction:** use the pure-JS hash everywhere (identical results on all platforms, no secure-context dependency); use `crypto.subtle` only as an optional accelerator if proven present. Store vectors as a binary Float32 file in the plugin folder.
**Still needed (device):** whether `crypto.subtle`, Web Workers and `adapter.writeBinary` of a ~15–50 MB file behave on iOS; embedding *generation* time through a remote Ollama (network-bound, not measured).

## S2, S4, S5, S7, S8 — not started

- S2 (editor decorations on iOS), S5 (iPhone → Ollama), S7 (timeline renderer with abstract axis) and S8 (WebDAV/Nextcloud sync conflicts) need a device or an Obsidian runtime and your sync plugin's name.
- S4 (decision provider) is out of MVP (O-1 resolved).
