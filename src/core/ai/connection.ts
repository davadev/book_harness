import type { NetworkPort } from "./network";
import { OllamaClient, normalizeEndpoint } from "./ollama";

export interface DeviceAiSettings {
	endpoint: string;
	generationModel: string;
	embeddingModel: string;
}

export interface ConnectionReport {
	ok: boolean;
	lines: string[];
}

/** Does `wanted` name an installed model? "llama3" matches "llama3:latest" the way Ollama itself resolves it. */
export function hasModel(installed: readonly string[], wanted: string): boolean {
	return installed.some((n) => n === wanted || (!wanted.includes(":") && n === `${wanted}:latest`));
}

/**
 * The author pressed "Test connection". This is the only place that sends anything without another feature asking:
 * it asks the server for its version and models and, if an embedding model is set, embeds the word "test".
 */
export async function testConnection(net: NetworkPort, cfg: DeviceAiSettings): Promise<ConnectionReport> {
	const base = normalizeEndpoint(cfg.endpoint);
	if (base === null) return { ok: false, lines: ["Enter the server address first, for example http://my-computer:11434."] };
	const client = new OllamaClient(net, base);
	const lines: string[] = [];
	try {
		lines.push(`Connected. Ollama ${await client.version()}.`);
		const installed = (await client.listModels()).map((m) => m.name);
		lines.push(`${installed.length} model${installed.length === 1 ? "" : "s"} installed.`);
		let ok = true;
		for (const [label, name] of [["Generation", cfg.generationModel], ["Embedding", cfg.embeddingModel]] as const) {
			if (name.trim() === "") lines.push(`${label} model: not chosen yet.`);
			else if (hasModel(installed, name.trim())) lines.push(`${label} model "${name.trim()}": installed.`);
			else {
				ok = false;
				lines.push(`${label} model "${name.trim()}": not installed on the server.`);
			}
		}
		if (ok && cfg.embeddingModel.trim() !== "") lines.push(`Embeddings work: ${(await client.embed(cfg.embeddingModel.trim(), ["test"])).embeddings[0].length} dimensions.`);
		return { ok, lines };
	} catch (e) {
		lines.push((e as Error).message);
		return { ok: false, lines };
	}
}
