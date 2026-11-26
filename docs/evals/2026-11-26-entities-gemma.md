# Model evaluation, 2026-11-26

Ollama 0.40.18. Book: fixtures/long-tuesday (synthetic). Real models; results vary between runs. Not a benchmark: read the outputs.

## gemma4:12b-it-q4_K_M

Digest `4eb23ef187e2`.

### Entity extraction

| Chapter | Time | New entities | Left out (quote not in text) | Notes |
|---|---|---|---|---|
| Chapter 1 | 412.4 s | 33 | 0 | "the Fold" is already a place, so it was not also listed as a object. "cradle" is already a place, so it was not also listed as a object. 7 object(s) mentioned  |
| Chapter 2 | 428.5 s | 19 | 0 | "the Fold" is already a place, so it was not also listed as a object. "the cradle" is already a place, so it was not also listed as a object. 5 object(s) mentio |
| Chapter 3 | 357.2 s | 7 | 0 | "the terminal" is already a object, so it was not also listed as a place. "the ring" is already a object, so it was not also listed as a place. "the cradle" is  |

- Expected characters found: **5 of 5** (none missing)
- Expected places found: **2 of 2** (none missing)
- Expected objects found: **1 of 1** (none missing)
- Entities that are not on the expected list (judge by eye): 43: Lindqvist (character), the medic (character), Okafor (character), Director Pike (character), note (object), the ring (object), the key (object), slate (object), the log (object), terminal (object), pen (object), the navy coat (object), research file (object), the balloon (object), green mug (object), control module (object), crate (object), cabin thirty-one (place), this room (place), the machine shop (place), outer stairwell (place), laboratories (place), the freight door (place), the stores (place), living deck (place), cabin (place), the turbine bay (place), the gantry (place), the outer stairs (place), the empty hold (place), the mainland (place), third deck (place), the deck (place), the corridor (place), the storage hold (place), the mess (place), the cradle (place), the lab (place), North Sea (place), the lower stair (place), the capital (place), the cold stairwell (place), the lift (place)
- Total entities created: 59

Run log: 30 model calls, 7 needed a repair, 0 failed.

