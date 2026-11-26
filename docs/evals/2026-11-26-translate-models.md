# Model evaluation, 2026-11-26

Ollama 0.40.18. Book: fixtures/salt-ledger (synthetic). Real models; results vary between runs. Not a benchmark: read the outputs.

## qwen3.6:35b-a3b-nvfp4

Digest `1b50c6fdc2d4`.

### Translation (first paragraphs of Chapter 1)

- de: 35.8 s, 7 paragraphs translated, 0 failed, 0 problems left after repair

> # Kapitel 1: Die Tochter des Hüters
> Der Nebel zog in den Hafen von Halvern ein, wie er es im Oktober immer tat, nicht als eine Mauer, sondern als ein langsames Vergessen. Zuerst verschwand das ferne Ende des Wellenbrechers, dann die Masten der Heringsschiffe, dann der Uhrturm am Zollhaus, bis die ganze Stadt sich aufzulösen schien in das graue Wasser, das sie zurückzuhalten gebaut worden war. Vom Laternenraum des Greywater-Leuchtturms aus beobachtete Nora Voss dies mit der Geduld einer Person, die es jeden Herbst ihrer sechsundzwanzig Jahre schon gesehen hatte.
> Sie war seit vier Uhr wach. Die Laterne brauchte sie zu dieser Stunde nicht, denn das Uhrwerk drehte die große Linse ohne Hilfe, aber das Uhrwerk brauchte Öl, und Öl war etwas, dem ihr Vater niemand anderem anvertraut hatte zu messen. Nun, da er fort war, fiel es ihr zu. Sie wischte sich die Hände an einem Lappen ab, der nach Waltran und Messingpolitur roch, und zählte die Tropfen, wie sie in den Reservoir fielen: eins, zwei, drei, vier, und dann eine Pause, denn der fünfte hing immer länger als er sollte an der Lippe des Ausgusses.
> "Du zählst sie laut aus, weißt du", sagte eine Stimme von der Treppe. "Dein Vater tat das Gleiche. Ich dachte immer, es sei ein Gebet."

- cs: 25.5 s, 7 paragraphs translated, 0 failed, 0 problems left after repair

> # Kapitola 1: Dcera Strážkyně
> Mlha se do přístavu v Halvernu valila tak, jako vždy v říjnu, ne jako zeď, ale jako pomalé zapomínání. Nejprve zmizel vzdálený konec molu, pak stěžary sardinkových lodí, poté hodinová věž na celním úřadě, až se celé město zdálo rozpouštět v šedé vodě, kterou bylo postaveno k tomu, aby ho zadrželo. Z lucerny majáku Greywater Light Nora Vossová sledovala, jak se to děje, s trpělivostí někoho, kdo to viděl každý podzim svých dvaceti šesti let.
> Stála vzhůru od čtyř. Lampa ji v tu dobu nepotřebovala, protože hodinový mechanismus otáčel velkou čočku bez cizí pomoci, ale hodinový mechanismus potřeboval olej a olej byla věc, které otec nedůvěřoval nikomu jinému než sobě. Nyní, když byl pryč, připadla na její bedra. Otírala si ruce hadrem, který voněl velrybím tukem a leštidlem na mosaz, a počítala kapky, jak padaly do nádrže: jedna, dvě, tři, čtyři, a pak pauza, protože ta pátá vždycky visela na okraji trychtýře déle, než by měla.
> "Počítáš je nahlas, víš," řekl hlas ze schodů. "Tvoje otec to dělal stejně. Dříve jsem si myslel, že je to modlitba."

Run log: 14 model calls, 0 needed a repair, 0 failed.

## nemotron-3.5-lightning:30b-mlx

Digest `8b1474be6e54`.

### Translation (first paragraphs of Chapter 1)

- de: 415.1 s, 6 paragraphs translated, 1 failed, 3 problems left after repair: Paragraph 1: The translation's length is very different from the source; translate the whole paragraph and nothing else. | Paragraph 3: The translation's length is very different from the source; translate the whole paragraph and nothing else. | Paragraph 4: The translation's length is very different from the source; translate the whole paragraph and nothing else.

> # Kapitel 1: Die Tochter des Wächters
> Der Nebel kam im Oktober so in Halverns Hafen, wie er es immer tat: nicht als Wand, sondern als langsames Vergessen. Zuerst verschwand das ferne Ende des Wellenbrechers, dann die Masten der Heringsboote, dann der Uhrturm des Zollhauses, bis die ganze Stadt zu scheinen schien, in das graue Wasser zu versinken, das sie gebaut hatte, um es fernzuhalten. Von der Laterne von Greywater Light beobachtete Nora Voss das Geschehen mit der Geduld einer Person, die es jedes Herbst ihres fünfundzwanzigsten Lebensjahres schon erlebt hatte.
> Der Nebel kam in den Hafen von Halvern so, wie er es im Oktober immer tat, nicht als Wand, sondern als langsames Vergessen. Zuerst verschwand das Ende des Wellenbrechers, dann die Masten der Heringsboote, dann der Uhrturm des Zollhauses, bis die ganze Stadt zu scheinen schien, in das graue Wasser zu versinken, das sie zu halten gebaut hatte. Von der Laterne von Greywater Light beobachtete Nora Voss das Geschehen mit der Geduld einer Person, die es jedes Herbst ihres sechsundzwanzigsten Lebensjahres erlebt hatte.
> Sie zählte sie laut, wusste sie. Ihr Vater hatte es ebenso getan. Ich dachte immer, es sei ein Gebet.

- cs: 37.0 s, 7 paragraphs translated, 0 failed, 1 problems left after repair: Paragraph 1: The translation's length is very different from the source; translate the whole paragraph and nothing else.

> # Kapitola 1: Strážkynina dcera
> Mlha do přístavu v Halvernu přicházela v říjnu tak, jak vždycky, ne jako zeď, ale jako pozvolné zapomnění. Nejprve zmizel konec molu, pak stěžně rybářských lodí, pak hodinová rampa na celnici, až se celé město jevilo, že se rozpouští do šedé vody, kterou bylo postaveno udržet pryč. Z lucerny Greywater Light Nora Voss sledovala děj s trpělivostí někoho, kdo to viděl každé podzimní roky svých dvaadvacet šest let.
> Mlha přicházela do přístavu Halvern tak, jak to v říjnu vždy dělala, ne jako zeď, ale jako pomalé zapomnění. Nejprve zmizela vzdálená koncová zeď, pak stěžně rybářských lodí, pak hodinová věž na celní budově, až se celé město jevilo, že se rozpouští do šedé vody, které bylo postavěno, aby udržela zpět. Z lucerny Greywater Light Nora Voss sledovala děj s trpělivostí někoho, kdo to viděl každé podzimní období svých dvacet šest let.
> Vstala jsem v čtyři hodiny. Lampa v tu hodinu nepotřebovala, protože se velká čepel točila sama, ale mechanismus potřeboval olej, a olej byl věc, kterou otec svěřil nikomu jinému, kdo by ho změřil. Nyní, když už není, na ní záleží. Otřela si ruce o hadr, který voněl tučnou zbalenou velrybou a polským voskem, a počítala kapky, které padaly do nádrže: jedna, dva, tři, čtyři, a pak pauza, protože pátá vždy visela na okraji výpustního otvoru déle, než by měla.

Run log: 14 model calls, 4 needed a repair, 1 failed.

## gemma4:e4b-mlx

Digest `64af8205368d`.

### Translation (first paragraphs of Chapter 1)

- de: 27.2 s, 7 paragraphs translated, 0 failed, 0 problems left after repair

> # Kapitel 1: Die Tochter des Wächters
> Der Nebel zog in den Hafen von Halvern, wie er es jeden Oktober tat, nicht als eine Wand, sondern als ein langsames Vergessen. Zuerst verschwand das Ende des Wellenbrechers, dann die Masten der Heringfischer, dann der Turm des Zollhauses, bis die ganze Stadt zu zerfließen schien in das graue Wasser, das sie eigentlich zurückhalten sollte. Aus dem Leuchtturm von Greywater sah Nora Voss, mit der Geduldung von jemandem, der es jeden Herbst ihrer sechsundzwanzig Jahre gesehen hatte.
> Sie war schon seit vier Uhr wach. Die Lampe brauchte sie in dieser Stunde nicht, denn das Uhrwerk drehte die große Linse von selbst, aber das Uhrwerk brauchte Öl, und Öl war etwas, das ihr Vater niemand anderem anvertraut hatte. Jetzt, da er fort war, fiel es ihr zu. Sie wischte ihre Hände an einem Lappen, der nach Walöl und Messingpolitur roch, und zählte die Tropfen, wie sie in den Speicher fielen: eins, zwei, drei, vier, und dann eine Pause, denn der fünfte hing immer länger als nötig am Rand des Ausgießes.
> "Du zählst sie laut," sagte eine Stimme von der Treppe. "Dein Vater tat das auch. Ich dachte, es wäre ein Gebet."

- cs: 25.4 s, 7 paragraphs translated, 0 failed, 0 problems left after repair

> # Kapitola 1: Dcera správce
> Mlha vstoupila do přístavu Halvern tak, jak to vždy dělala v říjnu, ne jako zeď, ale jako pomalé zapomínání. Nejdříve zmizel vzdálený konec průruční, pak výšvihy rybářských lodí, pak věžice na celní budově, dok se zdálo, že celé město se rozpouští do šedé vody, kterou mělo držet. Z lampové místnosti Greywater Light sledovala, jak se to děje, Nora Voss, s trpělivostí někoho, kdo to sledoval každý podzim svých dvacet šest let.
> Byla vzhůru od čtyř. Světlo jí v té hodině nepotřebovalo, protože stroje to velkou čočku poháněly bez pomoci, ale stroje potřebovaly olej, a olej byl věc, na který otec nikdy nevěřil nikomu jinému. Teď, když byl pryč, padlo to na ni. Otřel si ruce o hadřík, který voněl po velinovém tuku a měděném leštění, a počítala kapky, jak padaly do nádrže: jedna, dvě, tři, čtyři, a pak pauza, protože pátá vždy visela na okraji výtoku déle, než by měla.
> „Spočítáš je nahlas, víš,“ řekl hlas ze schodů. „Tvůj otec to dělal.Myslel jsem, že ježádání.“

Run log: 14 model calls, 1 needed a repair, 0 failed.

## ornith:9b

Digest `a75697c14589`.

### Translation (first paragraphs of Chapter 1)

- de: 51.8 s, 7 paragraphs translated, 0 failed, 0 problems left after repair

> # Kapitel 1: Die Tochter des Hüters
> Der Nebel kam in den Hafen von Halvern so, wie er es immer im Oktober tat: nicht als Wand, sondern als langsames Vergessen. Zuerst ging das ferne Ende des Wellenbrechers, dann die Masten der Heringsschiffe, dann der Uhrturm des Zollhauses, bis die ganze Stadt sich wie zu lösen schien in das graue Wasser, das sie erbaut worden war, um es zurückzuhalten. Aus dem Laternenraum des Greywater-Leuchtturms beobachtete Nora Voss, wie es geschah, mit der Geduld jemandes, der es jedes Herbstjahr ihrer zwanzigsechs Jahre beobachtet hatte.
> Sie war seit vier Uhr aufgestanden. Die Laterne brauchte sie in dieser Stunde nicht, denn der Uhrwerk drehte die große Linse ohne Hilfe, aber das Uhrwerk brauchte Öl, und Öl war etwas, das ihr Vater niemand anderem anvertraut hatte, es zu messen. Jetzt, da er weg war, fiel es ihr zu. Sie wischte sich die Hände an einem Lappen ab, der nach Walzfett und Messingpolitur roch, und zählte die Tropfen, wie sie in den Vorratsbehälter fielen: eins, zwei, drei, vier, und dann eine Pause, denn der fünfte hing immer länger am Rand der Öffnung als er sollte.
> "Du zählst sie laut, weißt du," sagte eine Stimme von der Treppe. "Dein Vater hat es auch so gemacht. Ich dachte immer, es sei ein Gebet."

- cs: 51.4 s, 7 paragraphs translated, 0 failed, 0 problems left after repair

> # KAPITOLA 1: Dcera strážce
> Mist se do přístavu Halvern dostával tak, jak to vždycky v říjnu bývalo, ne jako zeď, ale jako pomalé zapomínání. Nejdříve zmizel daleký konec překladiště, pak stěžně rybníkářských lodí, pak hodinová věž na celnici, až se zdálo, že celá obec se rozpouští do šedé vody, kterou měla být postavena, aby ji odrazila. Z lucerny na světelné věži Greywater to Nora Voss sledovala s trpělivostí někoho, kdo to sledoval každou podzimní sezónu svých dvaceti šesti let.
> Vstala o čtvrté. Lampa v té hodině nepotřebovala její pomoc, protože hodinový mechanismus otáčel velký čočkový sklo bez pomoci, ale hodinový mechanismus potřeboval olej a olej je věc, kterou její otec nikomu jinému nedůvěřoval měřit. Teď, co je pryč, připadalo to jí. Osmýřila si ruce na hadřík, který voněl po tukem velryb a mosazné pasty, a počítala kapky, jak padaly do zásobníku: jedna, dvě, tři, čtyři, a pak pauza, protože pátá vždy visela na okraji výlevky déle, než by měla.
> "Počítáš je nahlas, víš," řekl hlas ze schodů. "Tvého otce to také napadlo. Myslela jsem si, že je to modlitba."

Run log: 14 model calls, 0 needed a repair, 0 failed.

