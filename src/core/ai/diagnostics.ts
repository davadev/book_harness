/** What a run records about itself. Never the text that was sent or received. */
export interface RunDiagnostic {
	task: string;
	promptVersion: string;
	model: string;
	startedAt: string;
	ms: number;
	attempts: number;
	repaired: boolean;
	outcome: "ok" | "ok-with-issues" | "failed";
	issues: string[];
	error?: string;
	promptTokens?: number;
	outputTokens?: number;
}

const LIMIT = 100;

/** Device-local, in memory, bounded. Gone when the app closes. */
export class DiagnosticsLog {
	private readonly entries: RunDiagnostic[] = [];

	add(entry: RunDiagnostic): void {
		this.entries.push(entry);
		if (this.entries.length > LIMIT) this.entries.shift();
	}

	recent(n = 20): RunDiagnostic[] {
		return this.entries.slice(-n).reverse();
	}

	/** Shapes and outcomes only, safe to paste into a bug report. */
	report(): string {
		return this.recent(LIMIT)
			.map((e) => `${e.startedAt} ${e.task}@${e.promptVersion} ${e.model} ${e.outcome} ${e.ms}ms attempts=${e.attempts}${e.repaired ? " repaired" : ""}${e.issues.length ? ` issues=${e.issues.length}` : ""}${e.error ? ` error=${e.error}` : ""}`)
			.join("\n");
	}
}
