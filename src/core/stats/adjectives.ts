/**
 * What this build can honestly say about adjectives. There is no part-of-speech tagger here: the "heuristic" mode guesses
 * from word endings and a short closed list, and says so wherever it is shown. It will miss adjectives and flag some
 * non-adjectives. Czech and Slovak have no usable heuristic (their adjective endings are shared with nouns and verbs), so
 * those books get no guesses rather than wrong ones.
 */
export type AdjectiveSupport = { mode: "heuristic"; note: string } | { mode: "unavailable"; note: string } | { mode: "model"; note: string };

const EN_COMMON = "able bad big black blue bold bright broad brown calm cold common dark dead deep dim dry dull early easy empty faint fair false far fast fat fine firm flat fresh full glad good grand grave gray great green grey hard heavy high hollow hot huge kind large last late lean light little long loud low mad main near neat new nice odd old pale plain poor proud pure quick quiet rare raw red rich rough round sad safe same sharp short shy sick silent slow small smooth soft sour strange strong sure sweet tall thick thin tired true warm weak wet white wide wild wise wrong young";
const DE_COMMON = "alt arm blass blau böse breit dick dunkel dünn eng fern fest fremd frisch froh gelb glatt grau groß grün gut hart heiß hell hoch jung kalt klar klein kurz lang laut leer leicht leise lieb nah neu nett rau rot ruhig sanft scharf schlecht schmal schnell schwach schwarz schwer schön stark still stumm süß tief tot treu trocken warm weich weiß weit wild zart";
const EN = new Set(EN_COMMON.split(" "));
const DE = new Set(DE_COMMON.split(" "));
const EN_SUFFIX = /(?:ous|ful|ive|able|ible|less|ish|ic|ical|ary|ent|ant)$/;
const EN_NOT = new Set("family only early lovely lonely friendly ugly silly holy belly jelly reply apply supply bully rally tally ally fly sly dry cry try shy sky spy fry".split(" ")); // -y/-ly words that are not adjectives in this use
const DE_SUFFIX = /(?:ig|lich|isch|bar|sam|haft|los|end)$/;
const DE_NOT = new Set("könig könige honig essig käfig predigt pfennig könnig ewig fertig jedoch freilich wirklich".split(" "));

export function adjectiveSupport(language: string): AdjectiveSupport {
	if (language === "en") return { mode: "heuristic", note: "A guess from word endings and a short list of common adjectives. It misses some adjectives and includes some that are not." };
	if (language === "de") return { mode: "heuristic", note: "A guess from word endings and a short list of common adjectives; inflected forms (a final -e, -en, -er) are only partly recognised. It misses some adjectives and includes some that are not." };
	return { mode: "unavailable", note: language === "cs" || language === "sk" ? "Czech and Slovak adjective endings are shared with nouns and verbs, so no reliable guess is possible without a language model. Nothing is guessed." : "No adjective analysis is available for this language." };
}

/** Whether the word looks like an adjective under the heuristic for the language; false for languages without one. */
export function looksLikeAdjective(language: string, word: string): boolean {
	if (language === "en") return word.length > 3 && !EN_NOT.has(word) && (EN.has(word) || EN_SUFFIX.test(word));
	if (language === "de") {
		const stem = word.replace(/(?:en|er|em|es|e)$/, "");
		return word.length > 3 && !DE_NOT.has(word) && (DE.has(word) || DE.has(stem) || (stem.length > 3 && DE_SUFFIX.test(stem)));
	}
	return false;
}
