import path from "node:path";
import { createCommandRunner } from "../lib/command-runner";
import { OUTPUT_FORMAT } from "../lib/constants";
import { loadConfig } from "../lib/config";
import { type OutputItem, type OutputOptions, output } from "../lib/output";
import {
	buildWeeklyRollup,
	resolveWeeklyRollupRange,
} from "../lib/weekly-rollup";
import type { CliOverrides, OutputFormat } from "../types";

export interface WeeklyRollupOptions {
	configPath?: string;
	vaultPath?: string;
	verbose?: boolean;
	json?: boolean;
	output?: OutputFormat;
	week?: string;
	start?: string;
	end?: string;
	outputPath?: string;
}

export const runWeeklyRollup = createCommandRunner(
	async (
		options: WeeklyRollupOptions,
		{ setOutputOptions },
	): Promise<void> => {
	const config = await loadConfig(options.configPath, {
		vault: options.vaultPath,
		verbose: options.verbose,
		json: options.json,
		output: options.output,
	} satisfies CliOverrides);

	const outputOptions = buildOutputOptions(config);
	setOutputOptions(outputOptions);

	const range = resolveWeeklyRollupRange({
		week: options.week,
		start: options.start,
		end: options.end,
	});
	const outputPath = resolveOutputPath(options.outputPath, config.vault.path);

	const result = await buildWeeklyRollup({
		vaultPath: config.vault.path,
		todosPath: config.vault.todosFolder,
		dailyPath: config.vault.dailyFolder,
		outputPath,
		startDate: range.startDate,
		endDate: range.endDate,
	});

	if (config.output.format === OUTPUT_FORMAT.json) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}

	output(buildOutputItems(result), outputOptions);
},
);

export { buildWeeklyRollup } from "../lib/weekly-rollup";

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

function resolveOutputPath(outputPath: string | undefined, vaultPath: string) {
	const defaultPath = path.join(vaultPath, "1 - Rough Notes", "Weekly");
	if (!outputPath) {
		return defaultPath;
	}
	return path.isAbsolute(outputPath)
		? outputPath
		: path.join(vaultPath, outputPath);
}

function buildOutputItems(result: {
	reportPath: string;
	missingDays: string[];
}): OutputItem[] {
	const items: OutputItem[] = [];
	if (result.missingDays.length > 0) {
		items.push({
			type: "warning",
			message: `Missing daily notes: ${result.missingDays.join(", ")}`,
		});
	}

	items.push({
		type: "success",
		message: "Weekly rollup generated",
		details: result.reportPath,
	});

	return items;
}
