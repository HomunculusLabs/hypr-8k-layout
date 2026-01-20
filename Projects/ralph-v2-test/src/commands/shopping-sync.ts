import { watch } from "node:fs";
import path from "node:path";
import { type CliOverrides, loadConfig } from "../lib/config";
import { type OutputItem, type OutputOptions, output } from "../lib/output";
import {
	type ShoppingSyncResult,
	syncShoppingList,
} from "../lib/shopping-sync";

export interface ShoppingSyncOptions {
	configPath?: string;
	vaultPath?: string;
	verbose?: boolean;
	json?: boolean;
	dryRun?: boolean;
	watch?: boolean;
}

const WATCH_DEBOUNCE_MS = 200;

export async function runShoppingSync(
	options: ShoppingSyncOptions,
): Promise<void> {
	const config = await loadConfig(options.configPath, {
		vault: options.vaultPath,
		verbose: options.verbose,
		json: options.json,
	} satisfies CliOverrides);

	const outputOptions = buildOutputOptions(config);
	const todosPath = config.vault.todosFolder;
	const shoppingListPath = path.join(config.vault.path, "Shopping List.md");

	const performSync = async (): Promise<void> => {
		const result = await syncShoppingList({
			todosPath,
			shoppingListPath,
			dryRun: options.dryRun,
		});
		output(buildOutputItems(result), outputOptions);
	};

	try {
		await performSync();
	} catch (error) {
		reportError(error, outputOptions);
		process.exitCode = 1;
		return;
	}

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
}

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

function reportError(error: unknown, outputOptions: OutputOptions): void {
	const message = error instanceof Error ? error.message : "Unknown error";
	output([{ type: "error", message }], {
		...outputOptions,
		format: "console",
	});
}
