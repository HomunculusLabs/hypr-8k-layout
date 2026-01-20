import path from "node:path";
import { createBunAdapter } from "../lib/adapters";
import { createCommandRunner } from "../lib/command-runner";
import { FILENAMES, OUTPUT_FORMAT } from "../lib/constants";
import { loadConfig } from "../lib/config";
import { type OutputItem, type OutputOptions, output } from "../lib/output";
import {
	type RalphQueueResult,
	buildRalphQueue,
	formatQueueConsole,
	formatQueueMarkdown,
} from "../lib/ralph-queue";
import type { CliOverrides } from "../types";

export type RalphQueueOutputMode = "console" | "queue" | "json";

export interface RalphQueueOptions {
	configPath?: string;
	vaultPath?: string;
	verbose?: boolean;
	json?: boolean;
	output?: RalphQueueOutputMode;
	maxTasks?: number;
	timeBudget?: string;
	project?: string;
	includeLowPriority?: boolean;
	explain?: boolean;
}

const QUEUE_FILENAME = FILENAMES.ralphQueue;
const DEFAULT_MAX_TASKS = 5;

export const runRalphQueue = createCommandRunner(
	async (options: RalphQueueOptions, { setOutputOptions }): Promise<void> => {
	const config = await loadConfig(options.configPath, {
		vault: options.vaultPath,
		verbose: options.verbose,
		json: options.json,
	} satisfies CliOverrides);

	const outputOptions = buildOutputOptions(config);
	setOutputOptions(outputOptions);
	const adapter = createBunAdapter(config.vault.path);
	const outputMode = normalizeOutputMode(
		options.output ?? (options.json ? OUTPUT_FORMAT.json : OUTPUT_FORMAT.console),
		config.output.format,
	);
	const maxTasks = normalizeMaxTasks(options.maxTasks);
	const timeBudgetHours = parseTimeBudget(options.timeBudget);

	const result = await buildRalphQueue({
		adapter,
		vaultPath: config.vault.path,
		todosPath: config.vault.todosFolder,
		projectsPath: config.vault.projectsFolder,
		maxTasks,
		timeBudgetHours: timeBudgetHours ?? undefined,
		projectFilter: options.project,
		includeLowPriority: options.includeLowPriority ?? false,
	});

	if (outputMode === OUTPUT_FORMAT.json) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}

	if (outputMode === "queue") {
		const queuePath = path.join(config.vault.path, QUEUE_FILENAME);
		const queueText = formatQueueMarkdown(result, {
			generated: new Date(),
			timeBudgetHours: timeBudgetHours ?? undefined,
			explain: options.explain ?? false,
		});
		await adapter.writeFile(queuePath, queueText);
		output(buildQueueOutputItems(result, queuePath), {
			...outputOptions,
			format: OUTPUT_FORMAT.console,
		});
		return;
	}

	const lines = formatQueueConsole(result, {
		explain: options.explain ?? false,
	});
	console.log(lines.join("\n"));
},
);

export { buildRalphQueue } from "../lib/ralph-queue";

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

function normalizeOutputMode(
	value: RalphQueueOutputMode,
	defaultFormat: OutputOptions["format"],
): RalphQueueOutputMode {
	if (value === "queue" || value === OUTPUT_FORMAT.json || value === OUTPUT_FORMAT.console) {
		return value;
	}
	return defaultFormat === OUTPUT_FORMAT.json
		? OUTPUT_FORMAT.json
		: OUTPUT_FORMAT.console;
}

function normalizeMaxTasks(maxTasks?: number): number {
	if (!maxTasks || Number.isNaN(maxTasks) || maxTasks <= 0) {
		return DEFAULT_MAX_TASKS;
	}
	return Math.floor(maxTasks);
}

function parseTimeBudget(value?: string): number | null {
	if (!value) return null;
	const trimmed = value.trim().toLowerCase();
	if (!trimmed) return null;

	const match =
		/^(\d+(?:\.\d+)?)(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)?$/.exec(
			trimmed,
		);
	if (!match) return null;
	const amount = Number.parseFloat(match[1]);
	const unit = match[2] ?? "h";
	if (unit.startsWith("m")) return amount / 60;
	return amount;
}

function buildQueueOutputItems(
	result: RalphQueueResult,
	queuePath: string,
): OutputItem[] {
	const items: OutputItem[] = result.warnings.map((warning) => ({
		type: "warning",
		message: warning,
	}));
	items.push({
		type: "success",
		message: "Ralph queue generated",
		details: `Queued ${result.stats.queued} task(s)`,
	});
	items.push({ type: "info", message: `Queue path: ${queuePath}` });
	return items;
}
