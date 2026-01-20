import { writeFile } from "node:fs/promises";
import path from "node:path";
import { type CliOverrides, loadConfig } from "../lib/config";
import { type OutputItem, type OutputOptions, output } from "../lib/output";
import {
	type ProjectHealthResult,
	buildProjectHealth,
	formatDashboardMarkdown,
} from "../lib/project-health";

export type ProjectHealthOutputMode = "console" | "dashboard" | "json";

export interface ProjectHealthOptions {
	configPath?: string;
	vaultPath?: string;
	verbose?: boolean;
	json?: boolean;
	output?: ProjectHealthOutputMode;
	status?: string;
	sort?: string;
}

const DASHBOARD_FILENAME = "Projects Dashboard.md";

export async function runProjectHealth(
	options: ProjectHealthOptions,
): Promise<void> {
	const config = await loadConfig(options.configPath, {
		vault: options.vaultPath,
		verbose: options.verbose,
		json: options.json,
	} satisfies CliOverrides);

	const outputOptions = buildOutputOptions(config);
	const outputMode = normalizeOutputMode(
		options.output ?? (options.json ? "json" : "console"),
		config.output.format,
	);

	try {
		const result = await buildProjectHealth({
			projectsPath: config.vault.projectsFolder,
			todosPath: config.vault.todosFolder,
			statusFilter: options.status,
			sort: options.sort,
		});

		if (outputMode === "json") {
			console.log(JSON.stringify(result, null, 2));
			return;
		}

		if (outputMode === "dashboard") {
			const dashboardPath = path.join(config.vault.path, DASHBOARD_FILENAME);
			const markdown = formatDashboardMarkdown(result);
			await writeFile(dashboardPath, markdown, "utf8");
			output(buildDashboardOutputItems(result, dashboardPath), {
				...outputOptions,
				format: "console",
			});
			return;
		}

		console.log(formatDashboardMarkdown(result));
	} catch (error) {
		reportError(error, outputOptions);
		process.exitCode = 1;
	}
}

export { buildProjectHealth } from "../lib/project-health";

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
	value: ProjectHealthOutputMode,
	defaultFormat: "console" | "json" | "markdown",
): ProjectHealthOutputMode {
	if (value === "console" || value === "dashboard" || value === "json") {
		return value;
	}
	return defaultFormat === "json" ? "json" : "console";
}

function buildDashboardOutputItems(
	result: ProjectHealthResult,
	dashboardPath: string,
): OutputItem[] {
	return [
		{
			type: "success",
			message: "Project health dashboard generated",
			details: `Projects: ${result.summary.total}`,
		},
		{ type: "info", message: `Dashboard path: ${dashboardPath}` },
	];
}

function reportError(error: unknown, outputOptions: OutputOptions): void {
	const message = error instanceof Error ? error.message : "Unknown error";
	output([{ type: "error", message }], {
		...outputOptions,
		format: "console",
	});
}
