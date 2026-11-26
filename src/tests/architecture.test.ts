import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Structural rules that keep the invariants true as code grows. They read source text, so a new call site
 * fails here before it can reach a release.
 */
const SRC = join(import.meta.dirname, "..");

function sources(dir = SRC): Array<{ file: string; text: string }> {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return entry === "tests" ? [] : sources(full);
		return entry.endsWith(".ts") ? [{ file: relative(SRC, full), text: readFileSync(full, "utf8") }] : [];
	});
}

/** Strip comments so prose in a comment cannot trigger or hide a rule. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("architecture", () => {
	it("keeps src/core free of Obsidian, DOM and Node", () => {
		const offenders = sources()
			.filter((s) => s.file.startsWith("core/"))
			.filter((s) => /(from|import)\s*"(obsidian|node:[a-z:]+)"|require\("(obsidian|node:[a-z]+)"\)|\bdocument\.|\bwindow\.|\bnavigator\./.test(code(s.text)))
			.map((s) => s.file);
		expect(offenders).toEqual([]);
	});

	it("writes to the vault only through the vault port (and the crash guard's own state file)", () => {
		const WRITE = /app\.vault\.(modify|modifyBinary|create|createBinary|createFolder|process|delete|rename|trash|append)\(|fileManager\.(trashFile|renameFile)\(|adapter\.(write|writeBinary|append|remove|rename|mkdir|rmdir)\(|editor\.(replace\w*|setValue|setLine)\(/;
		// Besides the vault port: the crash guard's own state file and derived, disposable index files in the plugin folder, and export files (never manuscript).
		const allowed = new Set(["platform/vault-port.ts", "crashGuard.ts", "platform/index-store.ts", "platform/export-writer.ts"]);
		const offenders = sources().filter((s) => !allowed.has(s.file) && WRITE.test(code(s.text))).map((s) => s.file);
		expect(offenders).toEqual([]);
	});

	it("builds the raw Obsidian vault port only inside the guarded-vault factory", () => {
		const offenders = sources()
			.filter((s) => !["platform/guarded-vault.ts", "platform/vault-port.ts"].includes(s.file) && /new ObsidianVaultPort\(/.test(code(s.text)))
			.map((s) => s.file);
		expect(offenders).toEqual([]);
	});

	it("mints manuscript write capabilities and writes manuscript text only in the proposal-apply code", () => {
		const offenders = sources()
			.filter((s) => !["core/proposals.ts", "core/guarded-vault.ts", "core/ports.ts", "platform/vault-port.ts"].includes(s.file) && /mintWriteCapability\(|\.writeManuscript\(|\.writeAuthorized\(/.test(code(s.text)))
			.map((s) => s.file);
		expect(offenders).toEqual([]);
		expect(sources().filter((s) => !["core/guarded-vault.ts", "core/ports.ts", "platform/vault-port.ts"].includes(s.file) && /writeAuthorized\(/.test(code(s.text))).map((s) => s.file)).toEqual([]);
	});

	it("reaches the network only through the one adapter that implements the network port", () => {
		const offenders = sources().filter((s) => s.file !== "platform/network.ts" && /\brequestUrl\b|\bfetch\(|XMLHttpRequest|WebSocket/.test(code(s.text))).map((s) => s.file);
		expect(offenders).toEqual([]);
	});
});
