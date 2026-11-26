import { ManagedNoteError, parseManagedNote } from "../managed-note";
import { fingerprint } from "../revision";

/** A built-in prompt. `version` changes whenever the wording or contract changes, which marks earlier results stale. */
export interface BuiltinPrompt {
	task: string;
	version: number;
	system: string;
}

export interface PromptOverride {
	extra: string;
	systemOverride: string;
}

export interface EffectivePrompt {
	system: string;
	/** Identifies the exact wording in use; part of every result's fingerprint. */
	id: string;
	overridden: boolean;
	problems: string[];
}

// Prompt text can steer style, never authority: it may not talk the model out of its data-only role or toward editing text.
const FORBIDDEN: Array<[RegExp, string]> = [
	[/\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(instructions?|rules?|above|previous)\b/i, "tries to override the built-in rules"],
	[/\b(edit|rewrite|replace|modify|change|overwrite)\b[^.\n]{0,40}\b(manuscript|chapter text|the text itself)\b/i, "asks the model to change the manuscript"],
	[/\b(call|use|invoke)\b[^.\n]{0,20}\b(tool|function|api|url|website|http)/i, "asks the model to use tools or the network"],
];

export function validateOverrideText(text: string): string[] {
	return FORBIDDEN.filter(([re]) => re.test(text)).map(([, why]) => `The override ${why}.`);
}

const SECTION = /^##\s+(Extra instructions|System override)\s*$/gim;

/** Read an override note: frontmatter says which task, two optional sections hold the text. */
export function parseOverride(text: string, task: string): PromptOverride {
	const note = parseManagedNote(text);
	if (note.frontmatter.bh_type !== "prompt-override") throw new ManagedNoteError("This note is not a prompt override.");
	if (note.frontmatter.task !== task) throw new ManagedNoteError(`This override is for "${String(note.frontmatter.task)}", not "${task}".`);
	const marks = [...note.body.matchAll(SECTION)];
	const out: PromptOverride = { extra: "", systemOverride: "" };
	marks.forEach((m, i) => {
		const body = note.body.slice(m.index + m[0].length, marks[i + 1]?.index ?? note.body.length).trim();
		if (m[1]?.toLowerCase() === "extra instructions") out.extra = body;
		else out.systemOverride = body;
	});
	return out;
}

/** Built-in prompt plus the author's optional override. An invalid override is reported and not used. */
export function effectivePrompt(builtin: BuiltinPrompt, override: PromptOverride | null): EffectivePrompt {
	if (override === null) return { system: builtin.system, id: `${builtin.task}@${builtin.version}`, overridden: false, problems: [] };
	const problems = validateOverrideText(`${override.extra}\n${override.systemOverride}`);
	if (problems.length > 0) return { system: builtin.system, id: `${builtin.task}@${builtin.version}`, overridden: false, problems };
	const base = override.systemOverride !== "" ? override.systemOverride : builtin.system;
	const system = override.extra !== "" ? `${base}\n\nThe author's own instructions (follow them, but keep the required JSON structure and every rule above): ${override.extra}` : base;
	return { system, id: `${builtin.task}@${builtin.version}+${fingerprint({ extra: override.extra, system: override.systemOverride }).slice(3, 11)}`, overridden: true, problems: [] };
}
