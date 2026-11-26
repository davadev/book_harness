# Model evaluation, 2026-11-26

Ollama 0.40.18. Book: fixtures/long-tuesday (synthetic). Real models; results vary between runs. Not a benchmark: read the outputs.

## gemma4:12b-it-q4_K_M

Digest `4eb23ef187e2`.

### Consistency check (up to 40 passages per subject)

| Subject | Planted | Time | Passages | Findings | Left out |
|---|---|---|---|---|---|
| Ines Varga | age: thirty-eight in chapter 2, thirty-six in chapter 3 (time travel adds no years) | 208.1 s | 40 passages, 28 facts, 6 pairs | 4 | 0 |
| Jonas Reiter | scar on the left palm (chapters 1, 2, 3), on the right palm (chapter 3) | 291.3 s | 40 passages, 35 facts, 20 pairs | 0 | 0 |
| Fold | limit seventy-two hours (chapters 1, 2), ninety-six hours (chapter 3); first test 3 March, eight days before 11 March (ch2) vs three weeks (ch3) | 300.6 s | 40 passages, 30 facts, 20 pairs | 6 | 0 |
| Halloran Pike | none planted | 94.0 s | 27 passages, 12 facts, 0 pairs | 0 | 0 |

- **Ines Varga: Age** — Chapter 3 “a woman of thirty-six who had lived three days twice” vs Chapter 3 “The woman was thirty-eight years old.”. The two statements provide different specific ages (thirty-six and thirty-eight) for the same character in the same chapter.
- **Ines Varga: Age** — Chapter 3 “a woman of thirty-six who had lived three days twice” vs Chapter 2 “She was thirty-eight years old”. The character's age is stated as thirty-six in one chapter and thirty-eight in another.
- **Ines Varga: Clothing** — Chapter 3 “in a grey jacket” vs Chapter 2 “You wore the blue jersey.”. The character is described as wearing a grey jacket in one chapter and a blue jersey in another, which are different types of garments.
- **Ines Varga: Clothing** — Chapter 3 “in a grey jacket” vs Chapter 2 “the one in the blue jersey”. The character is described as wearing a grey jacket in one chapter and a blue jersey in another, which are different types of garments.
- **Fold: Time limit** — Chapter 3 “a limit of ninety-six hours” vs Chapter 2 “The limit was seventy-two hours”. The two statements provide different specific numerical values (ninety-six hours versus seventy-two hours) for the same time limit.
- **Fold: Time limit** — Chapter 3 “a limit of ninety-six hours” vs Chapter 3 “The Fold had a limit of seventy-two hours”. The two statements provide different specific numerical values (ninety-six hours versus seventy-two hours) for the same time limit.
- **Fold: Time limit** — Chapter 3 “a limit of ninety-six hours” vs Chapter 1 “The Fold's limit was seventy-two hours.”. The two statements provide different specific numerical values (ninety-six hours versus seventy-two hours) for the same time limit.
- **Fold: Time limit** — Chapter 3 “a limit of ninety-six hours” vs Chapter 1 “Tuesday at ten was seventy-two hours before Friday at ten. It was exac”. Statement 1 defines the limit as ninety-six hours, while Statement 2 defines the machine's maximum range as seventy-two hours.
- **Fold: Recent run duration** — Chapter 1 “carried a sealed weather balloon back six hours” vs Chapter 3 “Duration 0.”. Statement 1 claims the balloon was carried for six hours, while Statement 2 states the duration was zero.
- **Fold: Power level** — Chapter 3 “Power 40.” vs Chapter 1 “When the turbines gave it forty megawatts”. The first statement identifies the power as '40', while the second specifies 'forty megawatts', which are different units of measurement (a raw number versus a specific physical quantity).

Run log: 83 model calls, 2 needed a repair, 0 failed.

## ornith-1.5:35b

Digest `9f3b89b25219`.

### Consistency check (up to 40 passages per subject)

| Subject | Planted | Time | Passages | Findings | Left out |
|---|---|---|---|---|---|
| Ines Varga | age: thirty-eight in chapter 2, thirty-six in chapter 3 (time travel adds no years) | 196.8 s | 40 passages, 80 facts, 20 pairs | 1 | 1 |
| Jonas Reiter | scar on the left palm (chapters 1, 2, 3), on the right palm (chapter 3) | 161.0 s | 40 passages, 61 facts, 20 pairs | 2 | 0 |
| Fold | limit seventy-two hours (chapters 1, 2), ninety-six hours (chapter 3); first test 3 March, eight days before 11 March (ch2) vs three weeks (ch3) | 159.5 s | 40 passages, 56 facts, 20 pairs | 0 | 1 |
| Halloran Pike | none planted | 82.7 s | 27 passages, 26 facts, 13 pairs | 0 | 0 |

- **Ines Varga: Age** — Chapter 3 “a woman of thirty-six” vs Chapter 3 “The woman was thirty-eight years old.”. Both statements describe Ines Varga's age in the same chapter, but one says she is thirty-six and the other says she is thirty-eight. These two specific ages cannot both be true of the same person at the same time.
- **Jonas Reiter: Age** — Chapter 1 “Jonas was forty-one years old” vs Chapter 1 “He was a heavy, stooped man of sixty-two”. The two statements give different ages for Jonas Reiter (forty-one vs. sixty-two) in the same chapter, and there is no indication that one is an estimate or that they refer to different moments.
- **Jonas Reiter: Current location** — Chapter 2 “She is in the lab right now” vs Chapter 3 “His left hand lay open. The scar on the palm shone in the light”. The two statements refer to different genders ("she" vs. "his"), so they cannot both be true of the same subject, Jonas Reiter.

Run log: 100 model calls, 3 needed a repair, 0 failed.

