import type { App } from "obsidian";
import type { VaultAdapter } from "./types";
import { BunVaultAdapter } from "./bun-adapter";
import { ObsidianVaultAdapter } from "./obsidian-adapter";

export function createBunAdapter(vaultPath: string): VaultAdapter {
	return new BunVaultAdapter(vaultPath);
}

export function createObsidianAdapter(app: App): VaultAdapter {
	return new ObsidianVaultAdapter(app);
}

export type { VaultAdapter, VaultFile } from "./types";
