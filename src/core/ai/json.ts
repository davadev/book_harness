/** First `{` to last `}`: local models add prose or code fences around JSON even when told not to. */
export function extractJsonObject(raw: string): unknown {
	const first = raw.indexOf("{");
	const last = raw.lastIndexOf("}");
	if (first < 0 || last <= first) throw new Error("The reply contained no JSON object.");
	try {
		return JSON.parse(raw.slice(first, last + 1));
	} catch (e) {
		throw new Error(`The reply was not valid JSON: ${(e as Error).message}`);
	}
}
