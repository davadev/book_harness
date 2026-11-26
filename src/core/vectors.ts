/** One embedded passage. The vector is unit length, so similarity is a plain dot product. */
export interface VectorEntry {
	chapterId: string;
	passageId: string;
	vector: Float32Array;
}

export interface VectorFile {
	model: string;
	dims: number;
	entries: VectorEntry[];
}

export const vectorKey = (chapterId: string, passageId: string): string => `${chapterId}:${passageId}`;

export function normalize(v: ArrayLike<number>): Float32Array {
	const out = new Float32Array(v.length);
	let sum = 0;
	for (let i = 0; i < v.length; i++) sum += (v[i]) ** 2;
	const norm = Math.sqrt(sum) || 1;
	for (let i = 0; i < v.length; i++) out[i] = (v[i]) / norm;
	return out;
}

/** The entries most similar to `query`, best first. Brute force: at the size of a book this is fast and exact. */
export function nearest(query: Float32Array, entries: readonly VectorEntry[], k: number): Array<{ entry: VectorEntry; similarity: number }> {
	const scored = entries.map((entry) => {
		let dot = 0;
		for (let i = 0; i < query.length; i++) dot += (query[i]) * (entry.vector[i]);
		return { entry, similarity: dot };
	});
	return scored.sort((a, b) => b.similarity - a.similarity || vectorKey(a.entry.chapterId, a.entry.passageId).localeCompare(vectorKey(b.entry.chapterId, b.entry.passageId))).slice(0, k);
}

const MAGIC = "BHV1";

/** Binary form: magic, JSON header length, JSON header (model, dims, keys), then the vectors as little-endian floats. */
export function serializeVectors(file: VectorFile): ArrayBuffer {
	const header = new TextEncoder().encode(JSON.stringify({ model: file.model, dims: file.dims, keys: file.entries.map((e) => [e.chapterId, e.passageId]) }));
	const out = new ArrayBuffer(4 + 4 + header.length + file.entries.length * file.dims * 4);
	const view = new DataView(out);
	new TextEncoder().encodeInto(MAGIC, new Uint8Array(out, 0, 4));
	view.setUint32(4, header.length, true);
	new Uint8Array(out, 8, header.length).set(header);
	let at = 8 + header.length;
	for (const e of file.entries) for (let i = 0; i < file.dims; i++, at += 4) view.setFloat32(at, e.vector[i], true);
	return out;
}

/** Read a stored index. Anything unreadable is "no index": it is disposable and rebuilt on request. */
export function parseVectors(data: ArrayBuffer): VectorFile | null {
	try {
		if (data.byteLength < 8 || new TextDecoder().decode(new Uint8Array(data, 0, 4)) !== MAGIC) return null;
		const view = new DataView(data);
		const headerLength = view.getUint32(4, true);
		const header = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 8, headerLength))) as { model?: unknown; dims?: unknown; keys?: unknown };
		if (typeof header.model !== "string" || !Number.isInteger(header.dims) || (header.dims as number) < 1 || !Array.isArray(header.keys)) return null;
		const dims = header.dims as number;
		if (data.byteLength !== 8 + headerLength + header.keys.length * dims * 4) return null;
		let at = 8 + headerLength;
		const entries: VectorEntry[] = [];
		for (const key of header.keys as unknown[]) {
			if (!Array.isArray(key) || typeof key[0] !== "string" || typeof key[1] !== "string") return null;
			const vector = new Float32Array(dims);
			for (let i = 0; i < dims; i++, at += 4) vector[i] = view.getFloat32(at, true);
			entries.push({ chapterId: key[0], passageId: key[1], vector });
		}
		return { model: header.model, dims, entries };
	} catch {
		return null;
	}
}
