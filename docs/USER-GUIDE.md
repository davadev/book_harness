# Book Harness user guide

Book Harness is early software. **Nothing in it has been run in a real Obsidian yet** (desktop or phone); it is tested by simulation and against a few local models. Expect rough edges and read the "What is not done" list in `STATUS.md` before relying on it. Back up your vault.

## The promises

- **Your chapters are never changed without your yes.** Book Harness proposes; you accept or reject each change; only then is the chapter edited.
- **No model is contacted unless you press a button** that says it will, and a short confirmation tells you what text goes where.
- **Everything it stores is plain Markdown** in a `_book-harness` folder inside your book folder, so it moves with the vault. Sync is left to your sync plugin; the notes are small and written so a sync does not corrupt them.
- Everything that does not need a model works with no server at all: structure, word counts, statistics, search by keyword, timeline, publishing.

## Setting up a book

1. Put your chapters as notes in one folder.
2. Open any note in the folder and run **Register this note's folder as a book** (command palette or the panel).
3. Open the **book panel** (ribbon icon or command **Open the book panel**). Open a chapter note and press **Make this note a chapter**, or use **Plan a chapter** for one you have not written yet. You decide the order and the status of every chapter; nothing is guessed from file names.
4. In the book note (`_book-harness/book.md`) you can edit by hand: `author:` (needed for export), `target_languages:` (for example `[de, cs]`), `completion_chapter_status:` (the status every chapter must reach for the book to count as finished).

## Connecting a model (optional)

Settings → Book Harness. Give the address of your Ollama server (for example `http://192.168.1.20:11434`) and the model names. These settings stay on this device and are not synced. **Test connection** lists the models the server has. From a phone, the server must be reachable over your network; Android is not verified.

What we measured with real local models is in `docs/evals/`. Short version: summaries, "ask the book", entity finding and translation into German work as drafts; small models make factual slips and miss some typos; **translation into Czech was poor with the two models tried** (invented and ungrammatical words), so treat it as a rough starting point for a human translator, and expect Slovak to be no better.

## What you can do

| Panel button | What it does | Model? |
|---|---|---|
| Update word counts | Counts words per chapter; marks counts out of date when text changes | no |
| Show statistics | Most used words, words clustered in a short stretch, repeated phrases, sentence lengths, a labelled adjective guess (English and German only); every figure opens the place in your chapter | no |
| Search | Keyword search of the whole book; optionally also by meaning (needs a one-time **Build** of a local index on this device) | meaning only |
| Ask the book | Answers a question from passages it found; shows the quotes; quotes not in the text are removed; says "not answered" when the book does not say | yes |
| Summarize chapters | One summary note per chapter, marked out of date when the chapter changes | yes |
| Proofread chapters | Paragraph by paragraph; produces a proposal you accept or reject change by change in the editor | yes |
| Check consistency (on an entity) | Looks at passages that mention that person, place or object and points at places that may contradict each other (an eye colour, an age). Both quotes are checked against your text; you mark each as a mistake, intended or not a conflict, and it asks you to look again if a chapter it rests on changes | yes |
| Find characters, places and objects | Creates entities with a quote as evidence; highlights them in the editor; you can merge, rename, add aliases | yes |
| Find events in chapters | A model suggests events and what the text says about their timing, each with the words it comes from; you accept or reject each one; only accepted ones reach the timeline | yes |
| Add an event / Add a time relation | Build a timeline by hand: "A before B", "B three days after A", "same time", a date (year, month or day). The panel shows what the evidence settles and what it does not, and shows a contradiction with the statements behind it | no |
| Translations | For each target language: translate or update a chapter. Only changed paragraphs are sent; a paragraph whose translation you edited is never replaced without asking; decisions appear in the panel | yes |
| Command: Suggest other words for the selected word | Select a word in a chapter; it shows alternatives that fit that sentence; the one you choose becomes a proposal you accept in the chapter | yes |
| Export <language> as EPUB | In the Translations section: an EPUB made only from that language's translations. Missing or out-of-date translations block a normal export, so a draft is saved under a different name | no |
| Export as EPUB | Builds an EPUB 3 into `<book folder>/exports/`. A book that is not finished (author missing, chapters below the required status, empty chapters) can only be exported as a draft, saved under a different name with the omissions listed | no |

## Reading what the panel tells you

- **Out of date** means the text changed since the thing was made. It never means wrong.
- **Possibly** before a date means the date is a range (a year is the whole year, never 1 January).
- **Certainly after** appears only where your statements prove the order. Events not linked by your statements have no order and are not shown as if they had one.
- **To do** lists what is missing or waiting for you; items disappear by themselves when the situation is resolved.

## If something looks wrong

- A banner at the top of the panel names any Book Harness note that could not be read, with the reason. Fix or delete that note; nothing else is affected.
- Sync conflict copies of managed notes are listed as to-dos.
- If Obsidian fails to start the plugin five times in a row, it turns itself off so it cannot lock you out; re-enable it under Community plugins.
- Managed notes are plain Markdown. Deleting `_book-harness` removes everything Book Harness knows (not your chapters); caches such as the meaning index live in the plugin folder and can be deleted any time.

## Not built yet

Illustrations and PDF export, graphical timeline, merging events found in several chapters, character analysis, contradiction search across the whole book, saved chats, a visual editor for prompt overrides, a diagnostics view. See `STATUS.md`.
