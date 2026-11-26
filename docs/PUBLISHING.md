# Publishing: preview, EPUB, PDF

Status: **design baseline, proposed.** Feasibility spike S1 runs in Phase 1; implementation is Phase 12. Export is deterministic and never calls a model.

## 1. Rendering model

Single pipeline: `Markdown chapter (edition language) + layout metadata + template + assets → Document IR → {HTML preview, EPUB XHTML, PDF pages}`. The **Document IR** (`core/publishing`) is a typed tree of blocks/inlines with resolved style tokens and resolved illustrations; renderers consume only the IR. Markdown parsing uses a pure-JS CommonMark-compatible parser (ADR pending: `markdown-it` vs `marked` vs `micromark`; criteria: licence, size, Obsidian-specific syntax handling). Obsidian-only syntax is handled deterministically: wikilinks → plain text (never leak), embeds `![[img]]` → illustrations if the author's layout includes them, comments/`%%` removed, callouts → plain blocks, frontmatter stripped, footnotes supported.

**Excluded from exports always:** managed notes, proposals, proofreading state, chats, annotations/highlights, hidden metadata, TODOs. A test builds a book with sentinel strings in every managed note and asserts none appear in EPUB/PDF bytes.

## 2. Layout metadata (external, portable, no prose injection)

- `publishing/template.md` — book-wide defaults per format: page size/margins, fonts (embedded font references with licence note), size, line spacing, paragraph spacing/indent, heading styles, chapter-break behaviour (new page, drop), TOC settings, front/back matter (title page, copyright, dedication, acknowledgements — optional), image defaults.
- `publishing/chapters/<ch_id>.md` — chapter overrides and **illustration placements**: `{image ref, anchor{block id, quote, prefix/suffix, ordinal}, placement(inline|float|full), size, align, caption, alt}` and page-break rules `{before|after block anchor}`.
- **Block anchors** reuse the shared segmentation ids. After manuscript edits, anchors re-resolve deterministically (unique quote/context match); ambiguous or lost → mapping marked **stale/ambiguous**, shown in preview and TODOs, correctable by the author; never silently guessed.

## 3. Preview (spec §19)

- **Chapter publishing preview** opens in the main workspace (a dedicated view leaf rendering HTML/CSS from the IR); formatting controls in the side panel; works at phone width. Responsive **EPUB-style** preview (reflowable) and **paginated PDF-style** preview (paginator over the IR; page-break and widow/orphan rules). Illustrations adjustable by drag/touch handles and numeric controls; changes write layout notes (debounced, CAS) only.
- Preview cannot claim identical pagination across EPUB and PDF; the UI labels what is reflowable vs paginated and lists unsupported EPUB rules (e.g. exact page breaks are hints, reader may ignore).

## 4. Export

- **Scope:** whole book in registry order for a chosen edition (primary or one translation), or a chapter range for proofing. Never mixes languages; never translates missing chapters; behaviour for missing/unwritten/stale/unreviewed material is governed by **validation report + explicit draft mode**: errors block normal export; "Export as draft" is a deliberate choice that embeds a visible draft notice only in the export UI/report (not in prose unless the author's template says so) and lists exactly what was omitted/included. Never silently omit.
- **Validation checklist** (also feeds TODOs): missing/unwritten chapters, gaps vs planned slots, stale/missing required translations, unresolved proposals, missing/broken images, illustration minimums, completion requirements, missing metadata (title, author, language), font embedding permissions.
- **EPUB:** EPUB 3, OCF zip via a pure-JS zip library (S1: `fflate` vs JSZip), `nav` + NCX for compatibility, spine from registry order, metadata (title, author, language, identifier, date, optional cover/rights), CSS from template with fallback subsets, images resized/validated, fonts embedded when licence permits. CI validates with **EPUBCheck** (Java, CI-only). Fixed-layout not in V1.
- **PDF:** no `printToPDF`, no Pandoc, no child processes. S1 evaluates (i) `pdf-lib` + `fontkit` + our paginator (full control, we own layout), (ii) `pdfmake` browser build (document-definition API, TOC/links; outline limits), (iii) `jsPDF`. Requirements: embedded fonts with Unicode coverage, text shaping adequate for the book's languages (O-6 languages decide whether complex scripts are in scope), internal links + outline/bookmarks, images, headers/footers/page numbers, hyphenation optionally. Mobile memory/time measured on a long fixture. **If identical desktop/mobile output is infeasible, a documented cross-platform behaviour decision (O-8) is required before Phase 12.**
- **TOC:** generated from registry/designation, navigable (EPUB nav, PDF links + outline where supported by chosen renderer).
- **Output delivery:** `adapter.writeBinary` into a vault `exports/` folder (portable; excluded from index) plus platform share/open affordance where available; mobile delivery verified in S1.
- **Licence/embedding:** bundled or user-supplied fonts carry a licence record; embedding flags (fsType) checked; non-embeddable fonts are blocked from export with a message. Dependency licences recorded in ADRs.

## 5. Testing

Golden IR fixtures; EPUB structural assertions + EPUBCheck in CI; PDF inspection (text extraction, outline, fonts embedded, page count) via a CI-only tool (e.g. pdf.js text layer or `qpdf`/`pdfinfo` where available); sentinel-leak test; export with zero network (assert no model port calls); draft-export warnings; language-edition selection; image handling; real-device runs recorded in `STATUS.md` platform log. Visual preview checked by rendering to screenshots in real Chromium and WebKit (playbook TESTING layout jobs).
