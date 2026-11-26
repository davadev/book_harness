/** The only way core code reaches the network. Platform code implements it; tests count and script calls. */
export interface NetRequest {
	url: string;
	method: "GET" | "POST";
	body?: string;
	timeoutMs: number;
	signal?: AbortSignal;
}

export interface NetResponse {
	status: number;
	text: string;
}

export interface NetworkPort {
	/** Resolves for any HTTP status. Rejects only when no response arrived (unreachable, timed out, canceled). */
	request(req: NetRequest): Promise<NetResponse>;
}
