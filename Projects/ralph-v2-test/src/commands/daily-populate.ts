import path from "node:path";
import { loadConfig } from "../lib/config";
import {
	formatDate,
	normalizeDateInput,
	populateDailyNote,
} from "../lib/daily-populate";
import { type OutputItem, type OutputOptions, output } from "../lib/output";
import type { CliOverrides, OutputFormat } from "../types";

export interface DailyPopulateOptions {
	configPath?: string;
	vaultPath?: string;
	verbose?: boolean;
	json?: boolean;
	output?: OutputFormat;
	date?: string;
	create?: boolean;
	dryRun?: boolean;
	skip?: string[];
}

const DAILY_TEMPLATE_FILE = "daily-notes.md";

export async function runDailyPopulate(
	options: DailyPopulateOptions,
): Promise<void> {
	const config = await loadConfig(options.configPath, {
		vault: options.vaultPath,
		verbose: options.verbose,
		json: options.json,
		output: options.output,
	} satisfies CliOverrides);

	const outputOptions = buildOutputOptions(config);
	const date = normalizeDateInput(options.date) ?? formatDate(new Date());
	const dailyPath = config.vault.dailyFolder;
	const templatePath = path.join(
		config.vault.templatesFolder,
		DAILY_TEMPLATE_FILE,
	);
	const skip = new Set(
		(options.skip ?? []).map((value) => value.toLowerCase()),
	);

	try {
		const result = await populateDailyNote({
			vaultPath: config.vault.path,
			todosPath: config.vault.todosFolder,
			projectsPath: config.vault.projectsFolder,
			dailyPath,
			templatePath,
			date,
			create: options.create,
			dryRun: options.dryRun,
			skip,
		});

		output(buildOutputItems(result), outputOptions);
	} catch (error) {
		reportError(error, outputOptions);
		process.exitCode = 1;
	}
}

export { populateDailyNote } from "../lib/daily-populate";

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

function buildOutputItems(result: {
	notePath: string;
	focusItems: number;
	blockedItems: number;
	rolloverItems: number;
	ralphItems: number;
	created: boolean;
	updated: boolean;
	warnings: string[];
	dryRun: boolean;
}): OutputItem[] {
	const items: OutputItem[] = [];
	for (const warning of result.warnings) {
		items.push({ type: "warning", message: warning });
	}

	const details = [
		`Focus: ${result.focusItems}`,
		`Blocked: ${result.blockedItems}`,
		`Rollover: ${result.rolloverItems}`,
		`Ralph: ${result.ralphItems}`,
	].join(", ");

	items.push({
		type: "success",
		message: result.dryRun
			? "Daily note dry run complete"
			: "Daily note populated",
		details,
	});

	if (!result.updated) {
		items.push({
			type: "info",
			message: "Daily note already up to date",
		});
	}

	if (result.created) {
		items.push({
			type: "info",
			message: "Daily note created",
			details: result.notePath,
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
