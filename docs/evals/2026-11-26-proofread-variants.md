# Model evaluation, 2026-11-26

Ollama 0.40.18. Book: fixtures/salt-ledger (synthetic). Real models; results vary between runs. Not a benchmark: read the outputs.

## gemma4:12b-it-q4_K_M

Digest `4eb23ef187e2`.

### Proofreading (typos injected into the first paragraphs of Chapter 1)

- Paragraphs checked: 8 of 8; time 61.2 s
- Injected typos fixed: **3 of 5**
- Other suggested changes (not injected, to judge by eye): 1
- Paragraphs rejected by the safety checks (left as written): 0

  - “stair” → “stairs”

### Proofreading, three ways (typos injected into the first paragraphs of the first chapter)

| Variant | Typos fixed | Other changes (judge by eye) | Time |
|---|---|---|---|
| fix list | **5 of 5** | 0:  | 23.5 s |
| fix list + code hints (20 words hinted) | **5 of 5** | 1: “stair” → “stairs” | 25.9 s |

Run log: 24 model calls, 0 needed a repair, 0 failed.

## ornith-1.5:35b

Digest `9f3b89b25219`.

### Proofreading (typos injected into the first paragraphs of Chapter 1)

- Paragraphs checked: 8 of 8; time 32.3 s
- Injected typos fixed: **2 of 5**
- Other suggested changes (not injected, to judge by eye): 2
- Paragraphs rejected by the safety checks (left as written): 0

  - “"” → “”
  - “"” → “”

### Proofreading, three ways (typos injected into the first paragraphs of the first chapter)

| Variant | Typos fixed | Other changes (judge by eye) | Time |
|---|---|---|---|
| fix list | **4 of 5** | 0:  | 6.8 s |
| fix list + code hints (20 words hinted) | **3 of 5** | 0:  | 7.6 s |

Run log: 24 model calls, 0 needed a repair, 0 failed.

