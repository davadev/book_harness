/** Waits without blocking the interface; used between retries of a model call. */
export const sleep = (ms: number): Promise<void> => new Promise<void>((r) => window.setTimeout(r, ms));
