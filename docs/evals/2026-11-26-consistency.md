# Model evaluation, 2026-11-26

Ollama 0.40.18. Book: fixtures/salt-ledger (synthetic). Real models; results vary between runs. Not a benchmark: read the outputs.

## ornith-1.5:35b

Digest `9f3b89b25219`.

### Consistency check (retrieval of up to 10 passages per subject)

| Subject | Planted | Time | Passages | Findings | Left out |
|---|---|---|---|---|---|
| Nora Voss | eye colour: grey in chapter 1, green in chapter 3 | 25.3 s | 10 | 2 | 0 |
| Tomas Voss | younger brother in chapter 2, elder brother in chapter 3 | 14.9 s | 10 | 0 | 1 |
| compass | brass in chapter 1, silver in chapter 2 | 11.0 s | 10 | 1 | 0 |
| Ilse Kovar | none planted | 10.9 s | 10 | 1 | 0 |

- **Nora Voss: Nora's age** — Chapter 3 “And Nora Voss, who was twenty-six, and had green eyes” vs Chapter 3 “"You were sixteen. You were two years older than me." "You were fourte”. P1 states Nora is twenty-six, but P2 has Tomas say he is thirty and was fourteen when Nora was six, making her four years younger (twenty-six), yet Nora also says Tomas 'was sixteen' and 'you were two years older than me', which contradicts both the ages and who is older.
- **Nora Voss: Nora's eye colour** — Chapter 3 “And Nora Voss, who was twenty-six, and had green eyes” vs Chapter 2 “He remembers the green light on her face, and her eyes in it, wide and”. P1 states Nora has green eyes, but P4 describes her eyes as 'wide and very pale', incompatible with the specific green eye colour given in P1.
- **compass: When the compass was deposited** — Chapter 3 “Your father deposited the Key with them in the spring, ten years ago, ” vs Chapter 1 “When he vanished off the North Skerry three years ago, it had vanished”. The compass/Meridian Key is described as having been deposited with the firm in the capital ten years ago, yet it was on the father's belt three years ago when he sailed and only then lost.
- **Ilse Kovar: Ilse Kovar's hair** — Chapter 1 “a tall, raw-boned woman with grey hair cut short” vs Chapter 2 “her short hair plastered to her skull”. Ilse is described as having short grey hair in Chapter 1, but in Chapter 2 she is described as having short hair that is wet and plastered to her skull, which is inconsistent with the earlier description.

Run log: 4 model calls, 2 needed a repair, 0 failed.

## gemma4:12b-it-q4_K_M

Digest `4eb23ef187e2`.

### Consistency check (retrieval of up to 10 passages per subject)

| Subject | Planted | Time | Passages | Findings | Left out |
|---|---|---|---|---|---|
| Nora Voss | eye colour: grey in chapter 1, green in chapter 3 | 38.8 s | 10 | 0 | 0 |
| Tomas Voss | younger brother in chapter 2, elder brother in chapter 3 | 34.2 s | 10 | 0 | 0 |
| compass | brass in chapter 1, silver in chapter 2 | 30.6 s | 10 | 1 | 0 |
| Ilse Kovar | none planted | 23.3 s | 10 | 0 | 0 |

- **compass: The identity of the object** — Chapter 1 “He told me," the Captain whispered, "that it was not a compass at all.” vs Chapter 1 “She knew the compass at once. Everybody in Halvern knew the compass. I”. P1 states the object is not a compass at all, while P2 identifies the object as both a compass and the Meridian Key.

Run log: 4 model calls, 2 needed a repair, 0 failed.
