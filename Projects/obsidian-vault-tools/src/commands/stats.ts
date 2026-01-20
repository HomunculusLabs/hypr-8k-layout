import path from "node:path";
import { createBunAdapter } from "../lib/adapters";
import { createCommandRunner } from "../lib/command-runner";
import { FILENAMES, OUTPUT_FORMAT } from "../lib/constants";
import { loadConfig } from "../lib/config";
import { type OutputItem, type OutputOptions, output } from "../lib/output";
import {
	buildVaultStats,
	compareStats,
	normalizeSections,
	renderConsoleReport,
	renderMarkdownReport,
} from "../lib/stats";
import type { CliOverrides, OutputFormat } from "../types";

export interface VaultStatsOptions {
	configPath?: string;
	vaultPath?: string;
	verbose?: boolean;
	json?: boolean;
	output?: OutputFormat;
	section?: string | string[];
	path?: string;
	compare?: string;
}

const REPORT_FILENAME = FILENAMES.vaultStatsReport;

export const runStats = createCommandRunner(
	async (
		options: VaultStatsOptions,
		{ setOutputOptions },
	): Promise<void> => {
	const config = await loadConfig(options.configPath, {
		vault: options.vaultPath,
		verbose: options.verbose,
		json: options.json,
		output: options.output,
	} satisfies CliOverrides);

	const sections = normalizeSections(options.section);
	const rootPath = resolveRootPath(config.vault.path, options.path);
	const reportPath = path.join(config.vault.path, REPORT_FILENAME);
	const comparePath = resolveComparePath(options.compare, config.vault.path);
	const outputOptions = buildOutputOptions(config);
	setOutputOptions(outputOptions);
	const adapter = createBunAdapter(config.vault.path);

	const result = await buildVaultStats({
		adapter,
		vaultPath: config.vault.path,
		rootPath,
		reportPath,
		sections,
		schemas: config.schemas ?? {},
	});

	const comparison = comparePath
		? await compareStats(result, comparePath, adapter)
		: null;

	if (config.output.format === OUTPUT_FORMAT.json) {
		const payload = comparison ? { ...result, comparison } : { ...result };
		console.log(JSON.stringify(payload, null, 2));
		return;
	}

	const markdown = renderMarkdownReport(result, comparison, sections);
	if (config.output.format === OUTPUT_FORMAT.markdown) {
		await adapter.writeFile(reportPath, markdown);
		output(buildReportOutputItems(result, reportPath), outputOptions);
		return;
	}

	console.log(renderConsoleReport(result, comparison, sections));
},
);

export { buildVaultStats } from "../lib/stats";

function resolveRootPath(vaultPath: string, targetPath?: string): string {
	if (!targetPath) return vaultPath;
	if (path.isAbsolute(targetPath)) return targetPath;
	return path.join(vaultPath, targetPath);
}

function resolveComparePath(
	input: string | undefined,
	vaultPath: string,
): string | null {
	if (!input) return null;
	return path.isAbsolute(input) ? input : path.join(vaultPath, input);
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

function buildReportOutputItems(
	result: { warnings: string[] },
	reportPath: string,
): OutputItem[] {
	const items: OutputItem[] = [
		{
			type: "success",
			message: "Vault stats report generated",
			details: reportPath,
		},
	];
	if (result.warnings.length > 0) {
		items.push({
			type: "warning",
			message: `Warnings: ${result.warnings.length}`,
		});
	}
	return items;
}
