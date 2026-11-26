export type ModelErrorKind = "not-configured" | "unreachable" | "timeout" | "canceled" | "host-rejected" | "http" | "bad-response" | "model-missing";

/** A failure the author can act on: the message says what happened and what to try. */
export class ModelError extends Error {
	constructor(readonly kind: ModelErrorKind, message: string) {
		super(message);
	}
}
