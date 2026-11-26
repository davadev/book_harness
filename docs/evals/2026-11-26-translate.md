# Model evaluation, 2026-11-26

Ollama 0.40.18. Book: fixtures/salt-ledger (synthetic). Real models; results vary between runs. Not a benchmark: read the outputs.

## ornith-1.5:35b

Digest `9f3b89b25219`.

### Translation (first paragraphs of Chapter 1)

- de: 36.9 s, 7 paragraphs translated, 0 failed, 0 problems left after repair

> # Kapitel 1: Die Tochter des Bewahers
> Der Nebel kam in den Hafen von Halvern, so wie er im Oktober immer kam, nicht als Wand, sondern als langsames Vergessen. Zuerst verschwand das ferne Ende des Wellenbrechers, dann die Masten der Herringboote, dann die Turmuhr am Zollhaus, bis die ganze Stadt darin aufzulösen schien, in das graue Wasser, das sie einst zu halten gedacht war. Aus dem Laternenzimmer von Greywater Light beobachtete Nora Voss, wie es geschah, mit der Geduld einer, die es jeden Herbst ihrer sechsundzwanzig Jahre hatte geschehen sehen.
> Sie war seit vier Uhr wach. Die Lampe brauchte sie zu dieser Stunde nicht, denn das Uhrwerk drehte die große Linse ohne Hilfe, aber das Uhrwerk brauchte Öl, und Öl war eine Sache, bei der ihr Vater niemandem außer sich selbst vertraut hatte. Jetzt, wo er fort war, fiel es ihr zu. Sie wischte sich die Hände an einem Lappen, der nach Walrat und Messingpolitur roch, und zählte die Tropfen, wie sie in den Vorratsbehälter fielen: eins, zwei, drei, vier, und dann eine Pause, denn die fünfte hing immer länger am Rand der Ausgussöffnung, als es sein sollte.
> "Man zählt sie laut aus, weißt du", sagte eine Stimme von der Trepte. "Dein Vater tat dasselbe. Ich dachte einst, es sei ein Gebet."

- cs: 26.2 s, 7 paragraphs translated, 0 failed, 0 problems left after repair

> # Kapitola 1: Strážcova dcera
> Mlha přicházela do přístavu Halvern tak, jak přicházela vždy v říjnu, ne jako zeď, ale jako pomalé zapomínání. Nejdřiv zmizela vzdálená část mole, pak stožáry sleďáků, pak hodinová věž na celnici, až se celé zdál být město rozplývat v šedé vodě, kterou bylo postaveno zadržovat. Z lucerny majáku Greywater na ni Nora Voss dívala s trpělivostí člověka, který to viděl každý podzim svých dvacet šesti let.
> Byla vzhůru od čtyř. Lampu v tu hodinu nepotřebovala, neboť velké čočko otáčel strojek bez její pomoci, ale strojek potřeboval olej, a olej byla věc, kterou otec nedůvěřoval nikomu jinému měřit. Nyní, když byl pryč, padalo to na ni. Otřela si ruce hadrem, který páchl velrybím tukem a leskem na mosaz, a počítala kapky, jak padaly do nádrže: jedna, dvě, tři, čtyři, a pak pauza, protože pátá se vždycky na okraji trubičky zadržovala déle, než měla.
> "Počíteš je nahlas, víš," řekl hlas ze schodů. "Tvá otec dělal to samé. Já jsem si vždycky myslel, že je to modlitba."

Run log: 14 model calls, 0 needed a repair, 0 failed.

## gemma4:12b-it-q4_K_M

Digest `4eb23ef187e2`.

### Translation (first paragraphs of Chapter 1)

- de: 73.4 s, 7 paragraphs translated, 0 failed, 0 problems left after repair

> # Kapitel 1: Die Tochter des Wärters
> Der Nebel zog in den Hafen von Halvern auf die Art und Weise ein, wie er es jeden Oktober tat – nicht als Wand, sondern als ein langsames Vergessen. Zuerst verschwand das entfernte Ende des Wellenbrechers, dann die Masten der Heringboote, dann der Uhrturm am Zollhaus, bis die ganze Stadt zu schmelzen schien in dem grauen Wasser, das sie eigentlich zurückhalten sollte. Aus dem Laternenraum des Greywater Light beobachtete Nora Voss das Geschehen mit der Geduld von jemandem, der es jeden Herbst ihrer sechsundzwanzig Jahre lang beobachtet hatte.
> Sie war seit vier Uhr wach. Die Lampe brauchte sie zu dieser Stunde nicht, denn das Uhrwerk drehte die große Linse ohne Hilfe, aber das Uhrwerk brauchte Öl, und Öl war etwas, das ihr Vater niemand anderem anvertraut hatte zu dosieren. Nun, da er fort war, lag es an ihr. Sie wischte sich die Hände an einem Lappen ab, der nach Walfett und Messingpolitur roch, und zählte die Tropfen, während sie in das Reservoir fielen: eins, zwei, drei, vier, und dann eine Pause, weil der fünfte immer länger an der Lippe der Tülle hängen blieb, als er sollte.
> "Du zählst sie laut aus, weißt du", sagte eine Stimme von der Treppe. "Dein Vater tat dasselbe. Ich dachte früher, es sei ein Gebet."

- cs: 82.7 s, 6 paragraphs translated, 1 failed, 0 problems left after repair

> # Kapitola 1: Strážní dcera
> mlha připlula do přístavu Halvern tak, jak to v říjně vždycky bývalo, ne jako zeď, ale jako pomalé zapomínání. Nejdříve zmizela vzdálená část molu, poté majíky sádkových lodí, poté věž hodin na celnicím, až se celé město zdálo rozpouštět v šedé vodě, kterou mělo odrážet. Z světelné místnosti majáku Greywater pozorovala to Nora Voss s trpělivostí někoho, kdo to sledoval každý podzim svých dvaceti šesti let.
> Byla vzhůře už od čtyř. Lampu v té hodině nepotřebovala, protože převodní mechanismus otáčel obrovskou čočici bez pomoci, ale mechanismus potřeboval olej, a olej byl věc, kterou její otec nedůvěřil nikomu jinému, aby ho měřil. Teď, když byl pryč, padlo to na ni. Otřela si ruce o hadr, který voněl po velrybím tuku a mosazným polšticem, a počítala kapky, jak padaly do nádrže: jedna, dvě, tři, čtyři, a pak přerušení, protože pátá se na okraji výpustu vždya držela déle, než měla.
> Nora se neodobrčila. Znala ten hlas a znala i krok, který s ním soulal, těžší na levé noze, kde stará zranění nikdy úplně nezatáhlo. "Je to modlitba, kapitáne. Jenom velmi nudná modlitba."

Run log: 14 model calls, 0 needed a repair, 1 failed.
