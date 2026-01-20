import readline from "node:readline/promises";
import { createCommandRunner } from "../lib/command-runner";
import { OUTPUT_FORMAT } from "../lib/constants";
import { loadConfig } from "../lib/config";
import { type OutputItem, type OutputOptions, output } from "../lib/output";
import {
	type TemplateCreateResult,
	type TemplateInfo,
	createFromTemplate,
	listTemplates,
} from "../lib/template";
import type { CliOverrides, OutputFormat } from "../types";

export { createFromTemplate, listTemplates } from "../lib/template";

export interface TemplateListOptions {
	configPath?: string;
	vaultPath?: string;
	verbose?: boolean;
	json?: boolean;
	output?: OutputFormat;
}

export interface TemplateCreateOptions {
	configPath?: string;
	vaultPath?: string;
	verbose?: boolean;
	json?: boolean;
	output?: OutputFormat;
	templateKey: string;
	title: string;
	vars?: Record<string, string>;
	outputPath?: string;
	interactive?: boolean;
	dryRun?: boolean;
	open?: boolean;
	postCommand?: string;
	gitAdd?: boolean;
}

export const runTemplateList = createCommandRunner(
	async (
		options: TemplateListOptions,
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

	const result = await listTemplates(config.vault.templatesFolder);
	if (outputOptions.format === OUTPUT_FORMAT.json) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}

	if (outputOptions.format === OUTPUT_FORMAT.markdown) {
		console.log(formatTemplateListMarkdown(result.templates));
		return;
	}

	console.log(formatTemplateListConsole(result.templates));
},
);

export const runTemplateCreate = createCommandRunner(
	async (
		options: TemplateCreateOptions,
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
	const interactive = Boolean(options.interactive);
	const rl = interactive
		? readline.createInterface({ input: process.stdin, output: process.stdout })
		: null;

	const prompt = rl
		? async (question: string) => rl.question(question)
		: undefined;
	const confirm = rl
		? async (question: string) => {
				const answer = await rl.question(question);
				return answer.trim().toLowerCase().startsWith("y");
			}
		: undefined;

	try {
		const result = await createFromTemplate({
			vaultPath: config.vault.path,
			templatesPath: config.vault.templatesFolder,
			templateKey: options.templateKey,
			title: options.title,
			vars: options.vars ?? {},
			outputPath: options.outputPath,
			interactive,
			dryRun: options.dryRun,
			open: options.open,
			postCommand: options.postCommand,
			gitAdd: options.gitAdd,
			prompt,
			confirm,
		});

		if (result.canceled) {
			output([{ type: "info", message: "Template creation cancelled" }], {
				...outputOptions,
				format: OUTPUT_FORMAT.console,
			});
			return;
		}

		output(buildCreateOutputItems(result), outputOptions);
	} finally {
		rl?.close();
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

function buildCreateOutputItems(result: TemplateCreateResult): OutputItem[] {
	const items: OutputItem[] = [
		{
			type: "success",
			message: result.dryRun ? "Template dry run complete" : "Template created",
			details: result.outputPath,
		},
	];
	if (result.overwritten) {
		items.push({
			type: "warning",
			message: "Existing file overwritten",
		});
	}
	return items;
}

function formatTemplateListConsole(templates: TemplateInfo[]): string {
	if (templates.length === 0) {
		return "No templates found.";
	}
	const lines = ["Available Templates:", ""];
	const maxKey = Math.max(...templates.map((template) => template.key.length));
	for (const template of templates) {
		const padded = template.key.padEnd(maxKey + 2, " ");
		const suffix = template.defaultOutput
			? ` (default: ${template.defaultOutput})`
			: "";
		lines.push(`  ${padded}${template.name}${suffix}`);
	}
	lines.push(
		"",
		"Usage: vault-tools template create <template> <title> [--var key=value]",
	);
	return lines.join("\n");
}

function formatTemplateListMarkdown(templates: TemplateInfo[]): string {
	if (templates.length === 0) {
		return "# Templates\n\nNo templates found.";
	}
	const lines = ["# Templates", "", "## Available", ""];
	for (const template of templates) {
		const suffix = template.defaultOutput
			? ` (default: ${template.defaultOutput})`
			: "";
		lines.push(`- \`${template.key}\`: ${template.name}${suffix}`);
	}
	lines.push(
		"",
		"## Usage",
		"`vault-tools template create <template> <title> [--var key=value]`",
	);
	return lines.join("\n");
}
