# Model evaluation, 2026-11-26

Ollama 0.40.18. Book: fixtures/long-tuesday (synthetic). Real models; results vary between runs. Not a benchmark: read the outputs.

## gemma4:12b-it-q4_K_M

Digest `4eb23ef187e2`.

### Consistency check (retrieval of up to 10 passages per subject)

| Subject | Planted | Time | Passages | Findings | Left out |
|---|---|---|---|---|---|
| Ines Varga | age: thirty-eight in chapter 2, thirty-six in chapter 3 (time travel adds no years) | 67.1 s | 10 passages, 13 facts, 1 pairs | 1 | 0 |
| Jonas Reiter | scar on the left palm (chapters 1, 2, 3), on the right palm (chapter 3) | 84.5 s | 10 passages, 14 facts, 4 pairs | 0 | 0 |
| Fold | limit seventy-two hours (chapters 1, 2), ninety-six hours (chapter 3); first test 3 March, eight days before 11 March (ch2) vs three weeks (ch3) | 151.8 s | 10 passages, 21 facts, 4 pairs | 3 | 0 |
| Halloran Pike | none planted | 35.7 s | 10 passages, 4 facts, 0 pairs | 0 | 0 |

- **Ines Varga: Clothing** — Chapter 3 “in a grey jacket” vs Chapter 2 “the one in the blue jersey”. The character is described as wearing a grey jacket in one chapter and a blue jersey in another. Unless she changed clothes between chapters, these two descriptions of her attire are contradictory.
- **Fold: Limit** — Chapter 3 “a limit of ninety-six hours” vs Chapter 2 “The limit was seventy-two hours”. The two statements provide different specific numerical values for the same limit.
- **Fold: Limit** — Chapter 3 “a limit of ninety-six hours” vs Chapter 3 “The Fold had a limit of seventy-two hours”. The two statements provide different specific numerical limits (ninety-six hours versus seventy-two hours) for the same subject.
- **Fold: Limit** — Chapter 3 “a limit of ninety-six hours” vs Chapter 1 “It could not send anything further back than seventy-two hours.”. The two statements provide different maximum time limits (96 hours vs. 72 hours) for the same function of the Fold.

Run log: 21 model calls, 1 needed a repair, 0 failed.

## ornith-1.5:35b

Digest `9f3b89b25219`.

### Consistency check (retrieval of up to 10 passages per subject)

| Subject | Planted | Time | Passages | Findings | Left out |
|---|---|---|---|---|---|
| Ines Varga | age: thirty-eight in chapter 2, thirty-six in chapter 3 (time travel adds no years) | 41.2 s | 10 passages, 11 facts, 1 pairs | 0 | 1 |
| Jonas Reiter | scar on the left palm (chapters 1, 2, 3), on the right palm (chapter 3) | 67.3 s | 10 passages, 22 facts, 7 pairs | 0 | 0 |
| Fold | limit seventy-two hours (chapters 1, 2), ninety-six hours (chapter 3); first test 3 March, eight days before 11 March (ch2) vs three weeks (ch3) | 53.3 s | 10 passages, 19 facts, 5 pairs | 0 | 1 |
| Halloran Pike | none planted | 22.7 s | 10 passages, 6 facts, 1 pairs | 0 | 0 |


Run log: 26 model calls, 4 needed a repair, 0 failed.

