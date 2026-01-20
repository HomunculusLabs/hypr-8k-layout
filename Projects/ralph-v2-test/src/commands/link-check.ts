import { writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../lib/config";
import {
	LINK_CHECK_REPORT_FILENAME,
	type LinkCheckOutputMode,
	type LinkCheckPaths,
	type LinkCheckResult,
	buildConsoleLines,
	buildReport,
	buildSummary,
	checkBrokenLinks,
} from "../lib/link-check";
import { type OutputItem, type OutputOptions, output } from "../lib/output";
import type { CliOverrides, OutputFormat } from "../types";

export interface LinkCheckOptions {
	configPath?: string;
	vaultPath?: string;
	verbose?: boolean;
	json?: boolean;
	output?: OutputFormat;
	outputMode?: LinkCheckOutputMode;
	exclude?: string[];
	suggest?: boolean;
	createStubs?: boolean;
}

const DEFAULT_OUTPUT_MODE: LinkCheckOutputMode = "console";

export async function runLinkCheck(options: LinkCheckOptions): Promise<void> {
	const config = await loadConfig(options.configPath, {
		vault: options.vaultPath,
		verbose: options.verbose,
		json: options.json,
		output: options.output,
	} satisfies CliOverrides);

	const outputOptions = buildOutputOptions(config);
	const outputMode = normalizeOutputMode(
		options.outputMode ?? DEFAULT_OUTPUT_MODE,
	);
	const reportPath = path.join(config.vault.path, LINK_CHECK_REPORT_FILENAME);

	try {
		const result = await checkBrokenLinks({
			vaultPath: config.vault.path,
			reportPath,
			outputMode,
			excludePatterns: normalizeExcludePatterns(options.exclude),
			suggest: Boolean(options.suggest),
			createStubs: Boolean(options.createStubs),
		} satisfies LinkCheckPaths);

		if (outputMode === "console") {
			console.log(buildConsoleLines(result).join("\n"));
			return;
		}

		const report = buildReport(result);
		await writeFile(reportPath, report, "utf8");

		output(buildOutputItems(result), outputOptions);
	} catch (error) {
		reportError(error, outputOptions);
		process.exitCode = 1;
	}
}

export { checkBrokenLinks } from "../lib/link-check";

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

function normalizeOutputMode(value: string): LinkCheckOutputMode {
	return value === "report" ? "report" : "console";
}

function normalizeExcludePatterns(patterns?: string[]): string[] {
	return (patterns ?? []).map((pattern) => pattern.trim()).filter(Boolean);
}

function buildOutputItems(result: LinkCheckResult): OutputItem[] {
	const items: OutputItem[] = [
		{
			type: result.brokenLinks.length > 0 ? "warning" : "success",
			message:
				result.brokenLinks.length > 0
					? "Broken links report generated"
					: "No broken links found",
			details: buildSummary(result),
		},
		{ type: "info", message: `Report path: ${result.reportPath}` },
	];

	if (result.stubsCreated > 0) {
		items.push({
			type: "info",
			message: `Stub notes created: ${result.stubsCreated}`,
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
