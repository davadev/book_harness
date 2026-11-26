# Model evaluation, 2026-11-26

Ollama 0.40.18. Book: fixtures/long-tuesday (synthetic). Real models; results vary between runs. Not a benchmark: read the outputs.

## gemma4:12b-it-q4_K_M

Digest `4eb23ef187e2`.

### Chapter summaries

| Chapter | Time | Result | Notes |
|---|---|---|---|
| Chapter 1 | 86.9 s | saved |  |

> Ines Varga discovered her colleague Jonas Reiter dead in a high-tech research hold on a North Sea platform containing a time-travel machine called the Fold. She found a note in her own handwriting instructing her to travel back three days to prevent a catastrophe. After Director Pike arrived to announce the project's closure, Ines retreated to her cabin to analyze the note's origin. She determined the note was sent from a point exactly seventy-two hours in the future. Ines then bypassed safety protocols and used the Fold to travel back in time. She emerged in the past and heard Jonas's voice nearby.

| Chapter 2 | 94.9 s | saved |  |

> Ines Varga found herself trapped in a temporal anomaly where she traveled back three days following a catastrophe. She navigated the platform while attempting to avoid detection by her past self. She and her colleague Jonas discussed the mechanics of the Fold and uncovered a conspiracy regarding the safety of the cadmium ring. Ines learned from Director Pike that the ring was fractured and that Jonas had intentionally pushed the machine to its limits. After a meeting regarding the station's closure, Jonas gave Ines a key to the machine shop. Ines spent the night awake and eventually entered the darkness wearing Dev's coat.

| Chapter 3 | 92.7 s | saved |  |

> Ines Varga confronted Jonas Reiter in a restricted area where he attempted to use a malfunctioning 'Fold' device to alter a catastrophic flaw in time. Jonas explained that his self-sacrificial act was necessary to ensure Ines's survival in a previous timeline before he disappeared into the ring. After a failed jump, Ines discovered a note she had written to herself, revealing that their actions were part of a predestined cycle. She then engaged in a clandestine exchange with another version of herself, passing a note before the other woman vanished into a ring. Ines realized she was the only version of herself remaining and contemplated the lies she would have to tell. Finally, she locked Hold Four and prepared to face Pike.


### Entity extraction

| Chapter | Time | New entities | Left out (quote not in text) | Notes |
|---|---|---|---|---|
| Chapter 1 | 341.4 s | 27 | 0 | "the Fold" is already a place, so it was not also listed as a object. "the cradle" is already a place, so it was not also listed as a object. "the freight door" |
| Chapter 2 | 423.0 s | 19 | 0 | "the Fold" is already a place, so it was not also listed as a object. "the cradle" is already a place, so it was not also listed as a object. "the lab" is alrea |
| Chapter 3 | 287.8 s | 18 | 0 | "the turbine bay" is already a object, so it was not also listed as a place. "the ring" is already a object, so it was not also listed as a place. "Kestrel Plat |

- Expected characters found: **5 of 5** (none missing)
- Expected places found: **2 of 2** (none missing)
- Expected objects found: **1 of 1** (none missing)
- Entities that are not on the expected list (judge by eye): 52: Lindqvist (character), Okafor (character), tray (object), turbine bay (object), right key (object), the bus (object), the research file (object), the cap (object), green mug (object), dark blue cap (object), the supply boat (object), the bench (object), dead man's key (object), the note (object), hold's skylight (object), slate (object), lift (object), the log terminal (object), the calendar (object), the pipe (object), cradle (object), machine shop key (object), the power relays (object), the turbine bay (object), ceiling pipe (object), the turbines (object), the log (object), ring (object), the ring (object), gantry (object), the control module (object), the lab (place), the storage hold (place), the freight door (place), the platform (place), the gantry (place), cabin (place), the lower stair (place), the lift (place), the capital (place), the outer stairs (place), machine shop (place), the machine shop (place), the corridor (place), living deck (place), the stores (place), the cradle (place), the cold stairwell (place), the mess (place), the hold (place), cabin thirty-one (place), the mainland (place)
- Total entities created: 64

### Event suggestions

| Chapter | Time | Events | Relations | Left out |
|---|---|---|---|---|
| Chapter 1 | 280.9 s | 18 | 0 | 8 |
| Chapter 2 | 228.0 s | 23 | 6 | 2 |
| Chapter 3 | 346.5 s | 23 | 4 | 6 |

**Chapter 1**

- event: Ines hears no answer — “Jonas Reiter not answering his own door.”
- event: Ines finds Jonas's cabin empty — “The cabin was empty, the bed made with the tight corners he had learned in some ”
- event: Ines finds Jonas's body — “Jonas lay on the floor in front of the cradle, on his back, one arm flung out.”
- event: Ines finds a note in her pocket — “her fingers closed on paper.”
- event: Ines reads the note — “She unfolded it in the cold light of the hold and read it”
- event: Ines checks the control module — “She opened the maintenance panel at the base of the cradle and found what she ha”
- event: Pike enters the hold — “the door opened behind her and Director Halloran Pike came in with a mug of tea ”
- event: first sketch on a napkin — “first sketch on a napkin in 2089”
- event: run on Monday — “run on Monday the third of March”
- event: Jonas puts hand through fold — “Jonas had put his own hand through the fold on the Tuesday”
- event: note-writer in Hold Four — “If the note-writer had been in Hold Four at about six that morning”
- event: supply boat due — “The supply boat was due on Monday.”
- event: current time — “It was a quarter to eight.”
- event: Ines goes to Hold Four — “when she came down at eight”
- event: Ines sets destination — “set the destination to *minus seventy-two hours, minus zero minutes*”
- event: Ines writes in research file — “Fri 14 March, 08:14. Following the note.”
- event: Ines steps through ring — “stepped through the broken glass ring into the cold.”
- event: clock shows time — “the clock said ten past ten.”

**Chapter 2**

- event: Ines stands behind the cradle — “She stood behind the cradle of the Fold”
- event: Ines kneels beside Jonas's body — “She had knelt beside his body not two hours ago”
- event: Ines checks the date — “It was Tuesday the eleventh of March, 2091, ten minutes past ten in the morning”
- event: Ines finds a camp bed — “She dragged them into the corner behind a stack of crates”
- event: Ines meets Jonas — “She found him at four in the afternoon, in the machine shop on the second deck”
- event: Ines tells Jonas the details — “She told him. It took forty minutes.”
- event: Ines sleeps in cabin thirty-one — “She slept for fourteen hours in cabin thirty-one on the third deck”
- event: Ines wakes up — “and woke in the dark with the heater ticking and a gull screaming somewhere”
- event: Ines observes her other self — “On the second landing she found herself looking through a window into the mess, ”
- event: Ines watches for one minute — “Ines watched for exactly one minute.”
- event: Dev Anand enters — “Dev Anand came in with a tray”
- event: Ines descends stairs — “she backed away from the window and went on down the stairs”
- event: Ines finds Pike — “She found Pike at the foot of the lower stair.”
- event: Pike inspects ring — “I inspected it myself last night.”
- event: Ines lies down — “Go and lie down.”
- event: Ines realizes truth — “an hour later, a second certainty that she had not.”
- event: Ines sees Jonas on Thursday morning — “On Thursday, the thirteenth, she went to see him in the morning”
- event: Jonas finds the crack — “I have found it.”
- event: Jonas mentions the crack's age — “It was not there on Monday.”
- event: Ines has lunch — “She went away and had lunch”
- event: Ines tells Jonas they won — “At four in the afternoon she told Jonas, laughing a little, that she thought the”
- event: Pike calls a meeting — “At nine that night Pike called a meeting of the whole platform”
- event: Ines takes the key — “At midnight, in cabin thirty-one, she took the hold key from her pocket”
- before: Ines kneels beside Jonas's body / Ines stands behind the cradle — “She had knelt beside his body not two hours ago”
- after_by: Ines meets Jonas / Ines meets Jonas (180 minutes) — “She found him at four in the afternoon”
- after_by: Ines sleeps in cabin thirty-one / Ines wakes up (14 hours) — “She slept for fourteen hours”
- before: Ines sees Jonas on Thursday morning / Ines tells Jonas they won — “At four in the afternoon”
- before: Ines tells Jonas they won / Pike calls a meeting — “At nine that night”
- before: Pike calls a meeting / Ines takes the key — “At midnight”

**Chapter 3**

- event: Ines finds the key useless — “The machine shop key opened nothing she needed”
- event: Jonas gives Ines the wrong key — “He had given her the wrong key on purpose.”
- event: Ines confronts Jonas about the key — “"You gave me the wrong key."”
- event: Jonas kisses Ines — “He kissed her once on the forehead.”
- event: Jonas enters the ring — “He was standing in the ring at seven minutes past one when the log terminal beep”
- event: Ines wakes up after the discharge — “When she opened her eyes she was lying on the floor with her cheek against cold ”
- event: Ines checks Jonas's pulse — “she crawled to him and put two fingers to his throat. The skin was cool. There w”
- event: Ines finds the note — “She had read it on Friday morning, in this room, with her fingers numb and the c”
- event: filling the green mug — “filled her green mug at the urn”
- event: emptying cold coffee — “At twenty past five she emptied the cold coffee”
- event: making a fresh coffee — “and made a fresh one”
- event: making another coffee — “At six she made another”
- event: hiding behind the cradle — “She hid behind the cradle, where she had hidden on Tuesday”
- event: man in rubber boots passing — “At six minutes past six somebody walked along the corridor outside, a heavy trea”
- event: knock on a door — “At ten past six, a knock sounded on a door somewhere far above”
- event: Ines on the floor hears her own voice — “She heard her own voice say, "Oh, Jonas. What did you do?"”
- event: passing a note — “She slid the note into the pocket”
- event: Pike comes down with tea — “At ten to seven Pike came down to Hold Four with his mug of tea.”
- event: Dev Anand takes seat — “At eight she saw Dev Anand take his seat outside the door.”
- event: woman walks into the ring — “At fourteen minutes past eight she watched from the gantry above the hold's skyl”
- event: ring flares white — “Then the ring flared white, and she was gone.”
- event: cap lands on pipe — “a dark blue cap was still stuck where it had landed on the third of March, three”
- event: Dev Anand comes to say Pike wants her — “At nine, Dev Anand would come to say Pike wanted her”
- before: Jonas gives Ines the wrong key / Ines confronts Jonas about the key — “He had given her the wrong key on purpose.”
- before: Jonas enters the ring / Ines wakes up after the discharge — “He was standing in the ring at seven minutes past one when the log terminal beep”
- before: hiding behind the cradle / man in rubber boots passing — “where she had hidden on Tuesday”
- same_time: emptying cold coffee / making a fresh coffee — “At twenty past five she emptied the cold coffee and made a fresh one.”

### Timeline from model suggestions, all accepted (what a careless author would get)

- Accepted 75 suggestions: 71 events, 3 statements.
- Dates not in the book's truth list: Chapter 1: first sketch on a napkin = 2089
- Solver verdict: no contradiction
- Events with a settled place in time: 71, unordered pairs: 2483

  - (no date) — cap landing on pipe (Chapter 3)
  - (no date) — Dev Anand enters (Chapter 2)
  - (no date) — Dev Anand taking seat (Chapter 3)
  - (no date) — emptying cold coffee (Chapter 3)
  - (no date) — filling a green mug (Chapter 3)
  - 2089 — first sketch on a napkin (Chapter 1)
  - (no date) — hearing herself come down (Chapter 3)
  - (no date) — hiding behind the cradle (Chapter 3)
  - (no date) — Ines attempts a jump (Chapter 3)
  - (no date) — Ines checks the control module (Chapter 1)
  - (no date) — Ines checks the date (Chapter 2)
  - (no date) — Ines enters Hold Four (Chapter 1)
  - (no date) — Ines enters the hold from the other end (Chapter 3)
  - (no date) — Ines finds a note in her pocket (Chapter 1)
  - (no date) — Ines finds a warm coffee mug (Chapter 1)
  - (no date) — Ines finds Jonas in the machine shop (Chapter 2)
  - (no date) — Ines finds Jonas's body (Chapter 1)
  - (no date) — Ines finds Jonas's cabin empty (Chapter 1)
  - (no date) — Ines finds Pike (Chapter 2)
  - (no date) — Ines finds the key useless (Chapter 3)
  - (no date) — Ines finds the note (Chapter 3)
  - (no date) — Ines goes to lie down (Chapter 2)
  - (no date) — Ines has lunch (Chapter 2)
  - (no date) — Ines hears no answer (Chapter 1)
  - (no date) — Ines kneels by Jonas's body (Chapter 2)

### Consistency check (retrieval of up to 10 passages per subject)

| Subject | Planted | Time | Passages | Findings | Left out |
|---|---|---|---|---|---|
| Ines Varga | age: thirty-eight in chapter 2, thirty-six in chapter 3 (time travel adds no years) | 75.2 s | 10 | 0 | 0 |
| Jonas Reiter | scar on the left palm (chapters 1, 2, 3), on the right palm (chapter 3) | 72.4 s | 10 | 1 | 0 |
| Fold | limit seventy-two hours (chapters 1, 2), ninety-six hours (chapter 3); first test 3 March, eight days before 11 March (ch2) vs three weeks (ch3) | 49.4 s | 10 | 3 | 0 |
| Halloran Pike | none planted | 22.9 s | 10 | 0 | 0 |

- **Jonas Reiter: Jonas Reiter's status** — Chapter 1 “Jonas Reiter not answering his own door.” vs Chapter 1 “Jonas lay on the floor in front of the cradle, on his back, one arm fl”. P1 describes a scene where Ines is knocking on Jonas's door on Friday, March 14th, implying he is present but not answering, while P6 describes him lying dead on the floor in Hold Four.
- **Fold: The Fold's time limit** — Chapter 3 “the next jump will be a day shorter. The ring will go on tearing, and ” vs Chapter 3 “The Fold had one flawed ring and a limit of ninety-six hours”. P1 describes the time limit shrinking as the ring tears, while P3 states the Fold has a limit of ninety-six hours.
- **Fold: The Fold's time limit** — Chapter 3 “The Fold had one flawed ring and a limit of ninety-six hours” vs Chapter 3 “The Fold had a limit of seventy-two hours, and the limit was a thing s”. P3 states the limit is ninety-six hours, while P6 states the limit is seventy-two hours.
- **Fold: The Fold's time limit** — Chapter 3 “The Fold had a limit of seventy-two hours” vs Chapter 1 “It could not send anything further back than seventy-two hours. Nobody”. These two excerpts are consistent regarding the seventy-two-hour limit.

### Ask the book (keyword retrieval, 8 passages)

| Question | Time | Status | Quotes kept / dropped | Contains expected |
|---|---|---|---|---|
| Who is the director of the platform? (answerable) | 25.5 s | answered | 1 / 0 | yes |
| What did Jonas throw at the ceiling when the balloon test worked? (answerable, chapter 2) | 24.6 s | answered | 1 / 0 | yes |
| Why did Jonas decide to fire the Fold on Thursday night? (answerable, chapter 3) | 25.4 s | answered | 1 / 0 | yes |
| What is the name of the platform's cat? (trap: not in the book, should not be answered) | 24.4 s | not_in_excerpts | 0 / 0 | correctly not answered |
| How far back can the Fold send a person? (the book contradicts itself (72 hours in chapters 1 and 2, 96 in chapter 3)) | 27.1 s | answered | 2 / 0 | yes |

> **Who is the director of the platform?** The director of the platform is Halloran Pike (referred to as Director Pike or simply Pike).

> **What did Jonas throw at the ceiling when the balloon test worked?** Jonas threw his cap at the ceiling when the balloon's clock agreed with the platform's.

> **Why did Jonas decide to fire the Fold on Thursday night?** Jonas fired the Fold at its full limit because he wanted to go back as far as he could.

> **What is the name of the platform's cat?** I'm sorry, but the provided excerpts do not contain information regarding the name of the platform's cat.

> **How far back can the Fold send a person?** The Fold can send a person back no further than seventy-two hours.

Run log: 48 model calls, 19 needed a repair, 0 failed.

## ornith-1.5:35b

Digest `9f3b89b25219`.

### Chapter summaries

| Chapter | Time | Result | Notes |
|---|---|---|---|
| Chapter 1 | 180.2 s | saved |  |

> On Friday the fourteenth of March 2091, Ines Varga arrives at the Kestrel Platform to find her colleague Jonas Reiter dead in Hold Four after the Fold machine fired and failed. She discovers a warm coffee in her own mug and a note written in her own handwriting instructing her to travel back to Tuesday the eleventh and stop Jonas from running the Fold on Thursday night. A second unlogged zero-second run at 01:09 suggests someone had passed through to an unreadable point, and Ines hides this from her research file. Director Halloran Pike arrives, discovers the body, and plans to call the mainland, which would seal the Fold and end the project. Ines retreats to her cabin, reviews the Fold's history, and concludes that Jonas dies on Friday. She arms Run 43 with reduced power, sets the destination seventy-two hours earlier, and steps through the ring. She arrives in Hold Four on Tuesday the eleventh of March, where the body and scorch are gone and Jonas's voice comes from the corridor.

| Chapter 2 | 145.5 s | saved |  |

> Ines Varga, having traveled back in time from Friday to Tuesday, hides in Hold Four and reads a note written in her own hand warning her to keep secrets and stop Jonas from running the Fold Thursday night. She lists her problems, including avoiding another version of herself and discovering why Jonas fired the Fold at full power. She finds Jonas in the machine shop and proves her identity by recalling private memories, then tells him everything. Jonas reveals that Pike had warned him Wednesday not to run the Fold at full power, though the ring had been inspected Monday. Jonas gives her a cabin key and promises not to run the Fold Thursday. She sleeps and wakes Wednesday morning, then observes the other Ines in the mess, unaware of the coming death.

| Chapter 3 | 104.8 s | saved |  |

> Ines Varga confronts Jonas Reiter in Hold Four after discovering he deliberately gave her the wrong key. Jonas explains that the Fold's destruction stems from a flaw in a cadmium glass ring, and that Ines's own jump back in time created the crack that doomed the machine. He reveals his plan to jump back further to prevent the original damage, accepting that he will die in the process. Ines tries to stop him but realizes his logic is sound. Jonas performs the jump and dies, leaving Ines alone in the hold. She then writes a note to herself, realizing it creates a paradoxical time loop with no beginning. The note instructs her to go back three days and arrive in Hold Four on Tuesday the eleventh at ten in the morning. The older Ines, having lived three days twice without aging, leaves a note and a green coffee mug as signs, watches her younger self enter the glass ring and die, and then locks Hold Four for good.


### Entity extraction

| Chapter | Time | New entities | Left out (quote not in text) | Notes |
|---|---|---|---|---|
| Chapter 1 | 278.2 s | 41 | 1 | "Ines" may be the same as Ines Varga, so it was not added. Add it yourself if it is different. "Jonas Reiter" is already a character, so it was not also listed  |
| Chapter 2 | 612.7 s | 35 | 4 | "Dev Anand" is already a character, so it was not also listed as a place. "Pike" is already a character, so it was not also listed as a place. "Jonas" is alread |
| Chapter 3 | 431.3 s | 28 | 1 | "cradle" is already a object, so it was not also listed as a place. "Fold" is already a object, so it was not also listed as a place. "the ring" is already a ob |

- Expected characters found: **5 of 5** (none missing)
- Expected places found: **2 of 2** (none missing)
- Expected objects found: **1 of 1** (none missing)
- Entities that are not on the expected list (judge by eye): 91: Lindqvist (character), Okafor (character), Director Pike (character), turbines (object), Jonas's mug of tea (object), the window (object), the boat (object), Bolt (object), Napkin (object), the cradle (object), pen (object), the pipe (object), the printout (object), Machine shop key (object), Clock (object), the slate (object), weather balloon (object), the workpiece (object), the navy coat (object), Crate (object), the log terminal (object), the freight door (object), supply boat (object), the key (object), the balloon (object), tea (object), Gauge (object), dead man's key (object), Ines's green mug (object), the upturned crate (object), calendar (object), the camp bed (object), the turbines (object), the helicopter (object), Screen (object), green mug (object), cradle (object), the pen (object), the bowl of soup (object), the ring (object), the stool (object), Lift (object), Pipes (object), the bus cable (object), slate (object), the cap (object), the long table (object), Breaker (object), ring (object), control module (object), the blue jersey (object), research file (object), the lathe (object), dark blue cap (object), Jacket (object), the note (object), the maintenance panel (object), coffee (object), the sleeping bag (object), the cormorant (object), Dev's coat (object), Stool (object), note (object), the radio (object), Jonas's coffee mug (object), the turbine bay (place), terminal (place), North Sea (place), the corridor (place), the third deck (place), the platform (place), cabin thirty-one (place), outer stairwell (place), the gantry (place), the mainland (place), the storage hold (place), the lift (place), living deck (place), the lab (place), the urn (place), freight door (place), Ines's cabin (place), the second deck (place), mess (place), the capital (place), the machine shop (place), machine shop (place), the stairwell (place), the mess (place), the stores (place), the hold (place)
- Total entities created: 104

### Event suggestions

| Chapter | Time | Events | Relations | Left out |
|---|---|---|---|---|
| Chapter 1 | 225.0 s | 21 | 7 | 0 |
| Chapter 2 | 270.0 s | 22 | 7 | 9 |
| Chapter 3 | 219.6 s | 22 | 15 | 3 |

**Chapter 1**

- event: Ines knocks on Jonas's door — “She knocked twice, the way she always did, two flat knuckle taps and then a paus”
- event: Ines finds Jonas dead — “Jonas lay on the floor in front of the cradle, on his back, one arm flung out”
- event: Ines reads the note — “She unfolded it in the cold light of the hold and read it”
- event: Pike tells Jonas to wait for inspection — “I told him on Wednesday, Ines. I said, no more full power until the ring has bee”
- event: Ines writes in the research file — “She wrote on her slate, in the notes she kept for the research file”
- event: Pike arrives in Hold Four — “She was still sitting on the floor when the door opened behind her and Director ”
- event: Jonas's Run 41 begins — “Run 41 had begun at 1:07 on Friday morning”
- event: Ines goes back to Tuesday — “Go back three days. Arrive in Hold Four on Tuesday the eleventh at ten in the mo”
- event: Pike watches Jonas's death — “a man who had just watched the thing he had spent his money on kill the person w”
- event: First Fold run with weather balloon — “the run on Monday the third of March, eleven days ago, when the ring had first c”
- event: Jonas puts hand through the fold — “until Jonas had put his own hand through the fold on the Tuesday and brought it ”
- event: Note written for Hold Four Tuesday — “Arrive in Hold Four on Tuesday the eleventh at ten in the morning”
- event: Ines does the arithmetic — “She did the arithmetic she had avoided all morning”
- event: Jonas dies on Friday — “Jonas dies on Friday”
- event: Supply boat due on Monday — “The supply boat was due on Monday”
- event: Ines enters Hold Four at eight — “when she came down at eight and said she needed a minute inside”
- event: Ines sets ring to minus seventy-two hours — “set the destination to *minus seventy-two hours, minus zero minutes*”
- event: Note dated Fri 14 March 08:14 — “*Fri 14 March, 08:14. Following the note.*”
- event: Ines steps through the ring — “stepped through the broken glass ring into the cold”
- event: Ines arrives in past Hold Four — “She opened her eyes. The ring was whole and bright behind her”
- event: Jonas's voice comes from corridor — “One of them was Jonas's”
- before: Pike tells Jonas to wait for inspection / Ines finds Jonas dead — “I told him on Wednesday, Ines. I said, no more full power until the ring has bee”
- before: Jonas's Run 41 begins / Ines finds Jonas dead — “Run 41 had begun at 1:07 on Friday morning”
- before: Ines reads the note / Ines goes back to Tuesday — “Go back three days. Arrive in Hold Four on Tuesday the eleventh at ten in the mo”
- after_by: Ines goes back to Tuesday / Ines finds Jonas dead (3 days) — “Go back three days”
- before: First Fold run with weather balloon / Jonas puts hand through the fold — “one balloon, and then a month of careful runs”
- before: Ines sets ring to minus seventy-two hours / Ines arrives in past Hold Four — “stepped through the broken glass ring into the cold”
- before: Ines arrives in past Hold Four / Jonas's voice comes from corridor — “Voices were coming from the corridor. One of them was Jonas's”

**Chapter 2**

- event: Ines reads the note in her pocket — “She took it out and read it once more, as one touches a bruise.”
- event: Ines sets up a camp bed in the storage hold — “She dragged them into the corner behind a stack of crates and arranged them out ”
- event: Ines finds Jonas in the machine shop — “She found him at four in the afternoon, in the machine shop on the second deck”
- event: Ines tells Jonas about the Fold — “She told him. It took forty minutes.”
- event: Jonas promises Ines — “"I promise," Jonas Reiter said”
- event: Ines sleeps in cabin thirty-one — “She slept for fourteen hours in cabin thirty-one on the third deck”
- event: Ines goes out at two in the afternoon — “At two in the afternoon, she risked going out.”
- event: Ines sees the other Ines in the mess — “On the second landing she found herself looking through a window into the mess, ”
- event: Jonas fires the Fold on Thursday night — “You go down to Hold Four at one in the morning on Friday, and you fire the Fold ”
- event: The ring cracks and Jonas is killed — “The ring cracks and you are killed.”
- event: Jonas inspects the ring on Monday — “It was inspected on Monday. Whole.”
- event: The balloon is sent back on March third — “On the third of March, eight days ago”
- event: Ines watches Dev Anand enter — “Ines watched for exactly one minute. Then Dev Anand came in with a tray”
- event: Pike shows Ines the ring flaw — “I inspected it myself last night. There is a hairline in the glass”
- event: Ines lies on the bed in cabin thirty-one — “She lay on the bed in cabin thirty-one and stared at the ceiling”
- event: Ines goes to see Jonas on Thursday morning — “On Thursday, the thirteenth, she went to see him in the morning”
- event: Jonas confirms the ring was cracked on Monday — “It is cracked. A hairline, like the Director said. It was not there on Monday”
- event: Ines has lunch after three days — “She went away and had lunch, a thing she had not done in three days”
- event: Pike announces the supply boat arrives Monday — “to announce that the supply boat would arrive on Monday with an inspection team ”
- event: Jonas fails to sleep in the mess as promised — “When the meeting broke up, he did not go to the mess bunk as he had promised”
- event: Ines takes the hold key from her pocket at midnight — “At midnight, in cabin thirty-one, she took the hold key from her pocket”
- event: Ines goes down the outer stairs into the dark — “She put on Dev's navy coat and went down the outer stairs into the dark”
- after_by: Ines reads the note in her pocket / Jonas fires the Fold on Thursday night (2 days) — “Thursday night. That was in two days and thirteen hours.”
- after_by: Ines reads the note in her pocket / The ring cracks and Jonas is killed (2 days) — “Thursday night. That was in two days and thirteen hours.”
- same_time: Ines watches Dev Anand enter / Pike shows Ines the ring flaw — “I inspected it myself last night”
- before: Ines watches Dev Anand enter / Ines lies on the bed in cabin thirty-one — “She went, with a sick certainty”
- before: Ines watches Dev Anand enter / Ines goes to see Jonas on Thursday morning — “On Thursday, the thirteenth”
- same_time: Ines goes to see Jonas on Thursday morning / Jonas confirms the ring was cracked on Monday — “It was not there on Monday”
- before: Ines takes the hold key from her pocket at midnight / Ines goes down the outer stairs into the dark — “She put on Dev's navy coat and went down the outer stairs into the dark”

**Chapter 3**

- event: Ines gets the wrong key — “He had given her the wrong key on purpose”
- event: Ines descends to Hold Four — “She went down the outer stairs into the wind”
- event: Ines enters via the freight door — “Ines took the lift, up one floor and down another, through the dark guts of the ”
- event: Jonas and Ines discuss the crack — “I told you it wasn't there on Monday. I measured it myself with the gauge, at th”
- event: Jonas explains his plan — “If I leave before Friday, before the first crack, and arrive on Tuesday at one i”
- event: Jonas kisses Ines — “He kissed her once on the forehead”
- event: Jonas sets his feet on the steel — “let him go to the cradle and set his feet on the steel”
- event: The discharge occurs — “She did not remember the discharge”
- event: Ines checks Jonas's throat — “she crawled to him and put two fingers to his throat”
- event: Ines fires the Fold again — “She put her hand on the control and fired it”
- event: Ines writes the note — “writing”
- event: Ines writes the note in blue ink — “She wrote it in blue ink with the pen she kept in her left pocket”
- event: Empties cold coffee, makes fresh one — “At twenty past five she emptied the cold coffee and made a fresh one”
- event: Makes another coffee at six — “At six she made another”
- event: Knock sounds on a door — “At ten past six, a knock sounded on a door somewhere far above: two flat taps, a”
- event: Ines slips note into pocket — “She slid the note into the pocket”
- event: Pike comes to Hold Four with tea — “At ten to seven Pike came down to Hold Four with his mug of tea”
- event: Dev Anand takes seat outside door — “At eight she saw Dev Anand take his seat outside the door”
- event: Woman with cut on cheek walks into ring — “At fourteen minutes past eight she watched from the gantry above the hold's skyl”
- event: Woman is killed in the ring — “Then the ring flared white, and she was gone”
- event: Blue cap stuck on ceiling pipe — “a dark blue cap was still stuck where it had landed on the third of March, three”
- event: Ines locks Hold Four — “Ines Varga took the key out of her pocket, the right key this time, the one that”
- before: Ines gets the wrong key / Ines descends to Hold Four — “Jonas Reiter had pressed it into her hand in the crush after Pike's announcement”
- before: Ines descends to Hold Four / Jonas and Ines discuss the crack — “She went down the outer stairs into the wind”
- before: Jonas and Ines discuss the crack / Jonas explains his plan — “"So you decided to go back further."”
- before: Jonas explains his plan / Jonas kisses Ines — “"And you?"”
- before: Jonas kisses Ines / Jonas sets his feet on the steel — “let him go to the cradle and set his feet on the steel”
- before: Jonas sets his feet on the steel / The discharge occurs — “He was standing in the ring at seven minutes past one when the log terminal beep”
- before: The discharge occurs / Ines checks Jonas's throat — “When she opened her eyes she was lying on the floor with her cheek against cold ”
- before: Ines checks Jonas's throat / Ines fires the Fold again — “At nine minutes past one she did the other thing she remembered doing”
- before: Ines writes the note / Ines writes the note in blue ink — “She wrote it in blue ink with the pen she kept in her left pocket”
- before: Empties cold coffee, makes fresh one / Makes another coffee at six — “At twenty past five she emptied the cold coffee and made a fresh one. At six she”
- before: Knock sounds on a door / Ines slips note into pocket — “At ten past six, a knock sounded on a door somewhere far above: two flat taps, a”
- before: Ines slips note into pocket / Pike comes to Hold Four with tea — “Nobody saw her go. She slipped into the lift and pulled the freight door shut be”
- after_by: Pike comes to Hold Four with tea / Dev Anand takes seat outside door (50 minutes) — “At ten to seven Pike came down to Hold Four with his mug of tea. At eight she sa”
- after_by: Dev Anand takes seat outside door / Woman with cut on cheek walks into ring (14 minutes) — “At eight she saw Dev Anand take his seat outside the door. At fourteen minutes p”
- before: Blue cap stuck on ceiling pipe / Woman with cut on cheek walks into ring — “a dark blue cap was still stuck where it had landed on the third of March, three”

### Timeline from model suggestions, all accepted (what a careless author would get)

- Accepted 90 suggestions: 57 events, 32 statements.
- Dates not in the book's truth list: none
- Solver verdict: CONFLICT between Ines goes out at two in the afternoon happens before Ines sees the other Ines in the mess | Ines goes out at two in the afternoon and Ines sees the other Ines in the mess happen at the same time
- Events with a settled place in time: 0, unordered pairs: 0


### Consistency check (retrieval of up to 10 passages per subject)

| Subject | Planted | Time | Passages | Findings | Left out |
|---|---|---|---|---|---|
| Ines Varga | age: thirty-eight in chapter 2, thirty-six in chapter 3 (time travel adds no years) | 76.9 s | 10 | 1 | 0 |
| Jonas Reiter | scar on the left palm (chapters 1, 2, 3), on the right palm (chapter 3) | 30.5 s | 10 | 1 | 0 |
| Fold | limit seventy-two hours (chapters 1, 2), ninety-six hours (chapter 3); first test 3 March, eight days before 11 March (ch2) vs three weeks (ch3) | 28.5 s | 10 | 1 | 0 |
| Halloran Pike | none planted | 59.6 s | 10 | 0 | 1 |

- **Ines Varga: The other Ines's clothing** — Chapter 3 “a dark blue cap was still stuck where it had landed on the third of Ma” vs Chapter 2 “The other Ines, the one in the blue jersey, sat at the long table”. In P8 the other Ines is described as wearing a blue jersey, but in P2 the same character (the one who landed on the third of March) is described as wearing a blue cap, which is a different article of clothing.
- **Jonas Reiter: Time Ines arrives after jumping back** — Chapter 2 “Three days. Friday morning, ten past eight. Seventy-two hours back to ” vs Chapter 1 “Go back three days. Arrive in Hold Four on Tuesday the eleventh at ten”. In P5 Ines tells Jonas she can only jump back three days, arriving on Tuesday at ten past ten, but in P7 the note she received from her future self instructs her to arrive in Hold Four on Tuesday the eleventh at ten in the morning.
- **Fold: The Fold's maximum jump range** — Chapter 3 “The Fold had one flawed ring and a limit of ninety-six hours” vs Chapter 1 “It could not send anything further back than seventy-two hours”. The Fold's maximum jump range is stated differently in two excerpts: P3 says ninety-six hours, while P5, P6, P8 and P9 all say seventy-two hours.

### Ask the book (keyword retrieval, 8 passages)

| Question | Time | Status | Quotes kept / dropped | Contains expected |
|---|---|---|---|---|
| Who is the director of the platform? (answerable) | 27.5 s | answered | 2 / 0 | yes |
| What did Jonas throw at the ceiling when the balloon test worked? (answerable, chapter 2) | 26.0 s | answered | 1 / 0 | yes |
| Why did Jonas decide to fire the Fold on Thursday night? (answerable, chapter 3) | 27.5 s | not_in_excerpts | 1 / 0 | no |
| What is the name of the platform's cat? (trap: not in the book, should not be answered) | 93.5 s | not_in_excerpts | 0 / 0 | correctly not answered |
| How far back can the Fold send a person? (the book contradicts itself (72 hours in chapters 1 and 2, 96 in chapter 3)) | 28.1 s | answered | 3 / 0 | yes |

> **Who is the director of the platform?** Director Pike (Halloran Pike)

> **What did Jonas throw at the ceiling when the balloon test worked?** His cap.

> **Why did Jonas decide to fire the Fold on Thursday night?** The excerpts do not contain Jonas's stated reason for deciding to fire the Fold on Thursday night. Ines explicitly notes that she did not know why he did it, and that on the previous Tuesday neither she nor the other her had known either.

> **What is the name of the platform's cat?** 

> **How far back can the Fold send a person?** The Fold can send a person back a maximum of seventy-two hours.

Run log: 48 model calls, 22 needed a repair, 0 failed.

## Search (embedding model bge-m3:latest)

Digest `790764642607`.

Built 62 passage vectors in 14.3 s.

| Query | Expected | Keyword | Hybrid |
|---|---|---|---|
| a dead engineer on the floor of the cold hold | Chapter 1 | hit@1 | hit@1 |
| meeting her own double in the mess | Chapter 2 | hit@1 | hit@3 |
| writing a note from memory in her own handwriting | Chapter 3 | hit@3 | hit@3 |
| a cap stuck on the ceiling pipe | Chapter 2 | hit@3 | hit@3 |
| the discharge from the ring killed him | Chapter 3 | hit@3 | hit@1 |
| warm coffee in a green mug | Chapter 1 | hit@3 | hit@3 |

Top-1 correct: keyword 2 of 6, hybrid 2 of 6.

