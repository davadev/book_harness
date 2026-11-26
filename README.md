# Book Harness

An Obsidian plugin for writing, understanding, maintaining, translating, reviewing and publishing books, with optional help from local AI models. It is a harness for the author, not an autonomous writer: **nothing changes your manuscript unless you accept it.**

> **Status: early development (Phase 1 scaffold).** The plugin currently loads and shows a settings tab; features arrive in phases. See [`docs/STATUS.md`](docs/STATUS.md) and the [implementation plan](docs/IMPLEMENTATION-PLAN.md).

## Principles

- Your manuscript stays clean: no injected links, markers or annotations. Book metadata lives in separate Markdown notes.
- No AI calls on save, startup or sync. AI runs only when you start an action, and you review every proposed manuscript change.
- Everything essential is plain Markdown in your vault, portable between devices.
- Works on desktop and mobile. Non-AI features work with no model connection.

## Network use

Book Harness makes no network requests yet. When AI features arrive they will contact only a model server you configure (for example a local Ollama), and only when you start an action. No telemetry, no cloud service.

## Install (prerelease)

Use [BRAT](https://github.com/TfTHacker/obsidian42-brat): add beta plugin `davadev/book_harness`.

## Documentation

Design and plan: [`docs/`](docs/README.md). Licence: MIT.
