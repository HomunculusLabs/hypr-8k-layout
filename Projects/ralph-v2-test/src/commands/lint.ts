import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createCommandRunner } from "../lib/command-runner";
import { loadConfig } from "../lib/config";
import {
	type FrontmatterLintResult,
	type LintOutputMode,
	buildConsoleLines,
	buildReport,
	buildSummary,
	lintFrontmatter,
	normalizeOutputMode,
	resolveRootPath,
} from "../lib/lint";
import { type OutputItem, type OutputOptions, output } from "../lib/output";
import type { CliOverrides, OutputFormat } from "../types";

export interface FrontmatterLintOptions {
	configPath?: string;
	vaultPath?: string;
	verbose?: boolean;
	json?: boolean;
	output?: OutputFormat;
	outputMode?: LintOutputMode;
	path?: string;
	fix?: boolean;
	dryRun?: boolean;
}

export const runFrontmatterLint = createCommandRunner(
	async (
		options: FrontmatterLintOptions,
		{ setOutputOptions },
	): Promise<void> => {
	const config = await loadConfig(options.configPath, {
		vault: options.vaultPath,
		verbose: options.verbose,
		json: options.json,
		output: options.output,
	} satisfies CliOverrides);

	const outputOptions: OutputOptions = {
		format: config.output.format,
		color: config.output.color,
		verbose: config.output.verbose,
		quiet: false,
	};
	setOutputOptions(outputOptions);

	const outputMode = normalizeOutputMode(
		options.outputMode ?? (options.json ? "json" : "report"),
	);
	const rootPath = resolveRootPath(
		config.vault.path,
		options.path ?? config.vault.path,
	);
	const reportPath = path.join(config.vault.path, "Frontmatter Lint Report.md");

	const result: FrontmatterLintResult = await lintFrontmatter({
		vaultPath: config.vault.path,
		rootPath,
		reportPath,
		outputMode,
		fix: Boolean(options.fix),
		dryRun: Boolean(options.dryRun),
		schemas: config.schemas ?? {},
	});

	if (outputMode === "json") {
		console.log(JSON.stringify(result, null, 2));
		if (result.totalErrors > 0) {
			process.exitCode = 1;
		}
		return;
	}

	if (outputMode === "console") {
		console.log(buildConsoleLines(result).join("\n"));
		if (result.totalErrors > 0) {
			process.exitCode = 1;
		}
		return;
	}

	const report = buildReport(result);
	await writeFile(reportPath, report, "utf8");

	const items: OutputItem[] = [
		{
			type: result.totalErrors > 0 ? "warning" : "success",
			message:
				result.totalErrors > 0
					? "Frontmatter lint report generated"
					: "No frontmatter issues found",
			details: buildSummary(result),
		},
		{ type: "info", message: `Report path: ${result.reportPath}` },
	];

	if (result.fixedFiles > 0) {
		items.push({
			type: "info",
			message: `Files updated: ${result.fixedFiles}`,
		});
	}

	output(items, outputOptions);
	if (result.totalErrors > 0) {
		process.exitCode = 1;
	}
},
);

export { lintFrontmatter } from "../lib/lint";
