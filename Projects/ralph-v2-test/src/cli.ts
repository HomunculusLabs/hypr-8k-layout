#!/usr/bin/env bun
import { Command } from "commander";
import { runDailyPopulate } from "./commands/daily-populate";
import { runShoppingSync } from "./commands/shopping-sync";
import { runTemplateCreate, runTemplateList } from "./commands/template";

const program = new Command();

program
	.name("vault-tools")
	.description("CLI tools for Obsidian vault automation")
	.version("0.1.0");

program
	.option("--vault <path>", "Path to vault root")
	.option("--config <path>", "Path to config file")
	.option("-v, --verbose", "Verbose output")
	.option("-q, --quiet", "Quiet mode")
	.option("--json", "JSON output");

program
	.command("shopping-sync")
	.description("Sync shopping items from todo notes")
	.option("--dry-run", "Show changes without writing")
	.option("--watch", "Watch for changes and resync")
	.action(async (options, command) => {
		const parent = command.parent?.opts() ?? {};
		await runShoppingSync({
			configPath: parent.config,
			vaultPath: parent.vault,
			verbose: parent.verbose,
			json: parent.json,
			dryRun: options.dryRun,
			watch: options.watch,
		});
	});

program
	.command("daily-populate")
	.description("Populate daily note with scheduled tasks and context")
	.option("--date <date>", "Date to populate (YYYY-MM-DD)")
	.option("--create", "Create note if missing")
	.option("--dry-run", "Show changes without writing")
	.option(
		"--skip <section...>",
		"Skip sections (focus, tasks, ralph, blocked, rollover)",
	)
	.action(async (options, command) => {
		const parent = command.parent?.opts() ?? {};
		await runDailyPopulate({
			configPath: parent.config,
			vaultPath: parent.vault,
			verbose: parent.verbose,
			json: parent.json,
			date: options.date,
			create: options.create,
			dryRun: options.dryRun,
			skip: options.skip,
		});
	});

const templateCommand = program
	.command("template")
	.description("Create notes from templates");

templateCommand
	.command("list")
	.description("List available templates")
	.action(async (_options, command) => {
		const parent = command.parent?.parent?.opts() ?? {};
		await runTemplateList({
			configPath: parent.config,
			vaultPath: parent.vault,
			verbose: parent.verbose,
			json: parent.json,
		});
	});

templateCommand
	.command("create")
	.description("Create a note from a template")
	.argument("<template>", "Template key")
	.argument("<title>", "Title for the new note")
	.option(
		"--var <pair>",
		"Template variable (key=value)",
		(value, previous: string[] = []) => {
			previous.push(value);
			return previous;
		},
		[],
	)
	.option("--output <path>", "Output path or directory")
	.option("--interactive", "Prompt for missing variables")
	.option("--dry-run", "Show output without writing")
	.option("--open", "Open in editor after creation")
	.option("--post <command>", "Run a command after creation (use {{path}})")
	.option("--git-add", "Stage the created file with git")
	.action(async (template, title, options, command) => {
		const parent = command.parent?.parent?.opts() ?? {};
		const vars: Record<string, string> = {};
		for (const pair of options.var as string[]) {
			const index = pair.indexOf("=");
			if (index === -1) {
				throw new Error(`Invalid --var value: ${pair}`);
			}
			const key = pair.slice(0, index).trim();
			const value = pair.slice(index + 1).trim();
			if (!key) {
				throw new Error(`Invalid --var value: ${pair}`);
			}
			vars[key] = value;
		}

		await runTemplateCreate({
			configPath: parent.config,
			vaultPath: parent.vault,
			verbose: parent.verbose,
			json: parent.json,
			templateKey: template,
			title,
			vars,
			outputPath: options.output,
			interactive: options.interactive,
			dryRun: options.dryRun,
			open: options.open,
			postCommand: options.post,
			gitAdd: options.gitAdd,
		});
	});

program.parse();
