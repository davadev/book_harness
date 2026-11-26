# Book Harness

An Obsidian plugin for writing, understanding, maintaining, translating, reviewing and publishing books, with optional help from local AI models. It is a harness for the author, not an autonomous writer: **nothing changes your manuscript unless you accept it.**

> **Status: early development, not yet run in a real Obsidian.** Most features are built and tested by simulation and against a few local models; nothing has been used on a phone. Read the [user guide](docs/USER-GUIDE.md) and [`docs/STATUS.md`](docs/STATUS.md) before relying on it, and back up your vault.

## Principles

- Your manuscript stays clean: no injected links, markers or annotations. Book metadata lives in separate Markdown notes.
- No AI calls on save, startup or sync. AI runs only when you start an action, and you review every proposed manuscript change.
- Everything essential is plain Markdown in your vault, portable between devices.
- Works on desktop and mobile. Non-AI features work with no model connection.

## Network use

Book Harness contacts only a model server **you** configure (for example a local Ollama), and only when you press a button that says it will; a confirmation shows what text goes where. It never contacts anything on startup, save or sync. No telemetry, no cloud service, no accounts.

## Install (prerelease)

Use [BRAT](https://github.com/TfTHacker/obsidian42-brat): add beta plugin `davadev/book_harness`.

## Documentation

Design and plan: [`docs/`](docs/README.md). Licence: MIT.
