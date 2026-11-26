import { requestUrl } from "obsidian";
import { ModelError } from "../core/ai/errors";
import type { NetRequest, NetResponse, NetworkPort } from "../core/ai/network";

/**
 * Obsidian's requestUrl is the transport that works on mobile and ignores CORS. It cannot be aborted or given a timeout,
 * so both are enforced by racing it; a late answer is simply dropped.
 */
export const obsidianNetwork: NetworkPort = {
	request(req: NetRequest): Promise<NetResponse> {
		return new Promise<NetResponse>((resolve, reject) => {
			let finished = false;
			const done = (fn: () => void) => {
				if (finished) return;
				finished = true;
				window.clearTimeout(timer);
				fn();
			};
			const timer = window.setTimeout(() => done(() => reject(new ModelError("timeout", "The model server took too long to answer. A large model may need more time to load; try again."))), req.timeoutMs);
			req.signal?.addEventListener("abort", () => done(() => reject(new ModelError("canceled", "Canceled."))));
			requestUrl({ url: req.url, method: req.method, body: req.body, contentType: req.body === undefined ? undefined : "application/json", throw: false }).then(
				(r) => done(() => resolve({ status: r.status, text: r.text })),
				(e: unknown) => done(() => reject(e instanceof Error ? e : new Error(String(e)))),
			);
		});
	},
};
