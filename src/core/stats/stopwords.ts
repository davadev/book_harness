/**
 * Function words that are not interesting to count. Short, hand-written, per language; a word missing here only means
 * it shows up in the list, never that anything is hidden or judged. Other languages get no stopword list (stated in the panel).
 */
const LISTS: Record<string, string> = {
	en: "a about after all also an and any are as at be because been but by can could did do does for from had has have he her him his how i if in into is it its just like me more my no not of on one only or our out over she so some than that the their them then there these they this to up us was we were what when which who will with would you your",
	de: "aber alle als also am an auch auf aus bei bin bis da dann das dass dein dem den der des die dies diese dir doch du ein eine einem einen einer er es euch für hab habe haben hat hatte ich ihm ihn ihr im in ist ja kein man mein mich mir mit nach nicht noch nur oder ohne sein sich sie sind so über um und uns unter von vor war wann was wenn wer wie wir wird wo zu zum zur",
	cs: "a aby ale ani až bez bude by byl byla byli bylo být co což další do ho i já jak je jeho její jen ještě jsem jsi jsme jsou k když která které který kde kdo mezi mi mně my na nad nebo než ní no o od on ona oni ono po pak pod podle pro před při s se si své svůj ta tak také tam te ten to tu ty u už v ve více však z za že",
	sk: "a aby ale ani až bez bol bola boli bolo budú by byť čo do ho i ja jeho jej ju už ako je k keď ktorá ktoré ktorý kde kto medzi mi my na nad alebo ním no o od on ona oni ono po pod podľa pre pred pri s sa si svoj ta tak aj tam ten to tu ty u v vo viac však z za že",
};

const cache = new Map<string, ReadonlySet<string>>();

export function stopwordsFor(language: string): ReadonlySet<string> | null {
	const list = LISTS[language];
	if (list === undefined) return null;
	let set = cache.get(language);
	if (!set) {
		set = new Set(list.split(" "));
		cache.set(language, set);
	}
	return set;
}
