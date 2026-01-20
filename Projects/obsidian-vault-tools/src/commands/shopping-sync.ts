import { watch } from "node:fs";
import path from "node:path";
import { createBunAdapter } from "../lib/adapters";
import { createCommandRunner } from "../lib/command-runner";
import { loadConfig } from "../lib/config";
import {
	type OutputItem,
	type OutputOptions,
	output,
	reportError,
} from "../lib/output";
import {
	type ShoppingSyncResult,
	syncShoppingList,
} from "../lib/shopping-sync";
import type { CliOverrides } from "../types";

export interface ShoppingSyncOptions {
	configPath?: string;
	vaultPath?: string;
	verbose?: boolean;
	json?: boolean;
	dryRun?: boolean;
	watch?: boolean;
}

const WATCH_DEBOUNCE_MS = 200;

export const runShoppingSync = createCommandRunner(
	async (
		options: ShoppingSyncOptions,
		{ setOutputOptions },
	): Promise<void> => {
	const config = await loadConfig(options.configPath, {
		vault: options.vaultPath,
		verbose: options.verbose,
		json: options.json,
	} satisfies CliOverrides);

	const outputOptions = buildOutputOptions(config);
	setOutputOptions(outputOptions);
	const adapter = createBunAdapter(config.vault.path);
	const todosPath = config.vault.todosFolder;
	const shoppingListPath = path.join(config.vault.path, "Shopping List.md");

	const performSync = async (): Promise<void> => {
		const result = await syncShoppingList({
			adapter,
			todosPath,
			shoppingListPath,
			dryRun: options.dryRun,
		});
		output(buildOutputItems(result), outputOptions);
	};

	await performSync();

	if (options.watch) {
		let timer: ReturnType<typeof setTimeout> | undefined;
		let running = false;

		const schedule = (): void => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(async () => {
				if (running) return;
				running = true;
				try {
					await performSync();
				} catch (error) {
					reportError(error, outputOptions);
				} finally {
					running = false;
				}
			}, WATCH_DEBOUNCE_MS);
		};

		const watchers = [watch(todosPath, { recursive: true }, schedule)];
		watchers.push(watch(shoppingListPath, schedule));

		output(
			[{ type: "info", message: "Watching for shopping list changes..." }],
			outputOptions,
		);
	}
},
);

function buildOutputOptions(config: {
	output: { format: string; color: boolean; verbose: boolean };
}): OutputOptions {
	return {
		format: config.output.format,
		color: config.output.color,
		verbose: config.output.verbose,
		quiet: false,
	};
}

function buildOutputItems(result: ShoppingSyncResult): OutputItem[] {
	const items: OutputItem[] = [];
	for (const warning of result.warnings) {
		items.push({ type: "warning", message: warning });
	}

	const summary = `Items: ${result.items}, Categories: ${result.categories}, Todo updates: ${result.todoFilesUpdated}`;
	items.push({
		type: "success",
		message: result.dryRun
			? "Shopping list dry run complete"
			: "Shopping list synced",
		details: summary,
	});

	if (!result.shoppingListUpdated) {
		items.push({
			type: "info",
			message: "Shopping list already up to date",
		});
	}

	return items;
}
