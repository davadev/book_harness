import type { App } from "obsidian";
import { GuardedVault } from "../core/guarded-vault";
import { ObsidianVaultPort } from "./vault-port";

/** The one place that wraps the raw Obsidian vault. Everything else receives the guarded port. */
export function createGuardedVault(app: App): GuardedVault {
	return new GuardedVault(new ObsidianVaultPort(app));
}
