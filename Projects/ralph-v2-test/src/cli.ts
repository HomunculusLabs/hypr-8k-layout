#!/usr/bin/env bun
import { Command } from "commander";
import { runDailyPopulate } from "./commands/daily-populate";
import { runLinkCheck } from "./commands/link-check";
import { runFrontmatterLint } from "./commands/lint";
import { runProjectHealth } from "./commands/project-health";
import { runRalphQueue } from "./commands/ralph-queue";
import { runShoppingSync } from "./commands/shopping-sync";
import { runStaleCheck } from "./commands/stale-check";
import { runTemplateCreate, runTemplateList } from "./commands/template";
import { runWeeklyRollup } from "./commands/weekly-rollup";

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

program
	.command("weekly-rollup")
	.description("Generate a weekly rollup from daily notes and todos")
	.option("--week <week>", "Week to summarize (YYYY-WXX)")
	.option("--start <date>", "Start date (YYYY-MM-DD)")
	.option("--end <date>", "End date (YYYY-MM-DD)")
	.option("--output <path>", "Output folder or file path")
	.action(async (options, command) => {
		const parent = command.parent?.opts() ?? {};
		await runWeeklyRollup({
			configPath: parent.config,
			vaultPath: parent.vault,
			verbose: parent.verbose,
			json: parent.json,
			week: options.week,
			start: options.start,
			end: options.end,
			outputPath: options.output,
		});
	});

program
	.command("stale-check")
	.description("Detect stale todos and generate a report")
	.option("--output <mode>", "Output mode (report, inline, console)", "report")
	.option(
		"--high-days <days>",
		"High priority staleness threshold",
		Number.parseInt,
	)
	.option(
		"--medium-days <days>",
		"Medium priority staleness threshold",
		Number.parseInt,
	)
	.option(
		"--low-days <days>",
		"Low priority staleness threshold",
		Number.parseInt,
	)
	.option(
		"--blocked-days <days>",
		"Blocked staleness threshold",
		Number.parseInt,
	)
	.option("--path <path>", "Override todos folder path")
	.option(
		"--exclude <pattern>",
		"Exclude todos matching pattern",
		(value, previous: string[] = []) => {
			previous.push(value);
			return previous;
		},
		[],
	)
	.action(async (options, command) => {
		const parent = command.parent?.opts() ?? {};
		await runStaleCheck({
			configPath: parent.config,
			vaultPath: parent.vault,
			verbose: parent.verbose,
			json: parent.json,
			outputMode: options.output,
			highDays: options.highDays,
			mediumDays: options.mediumDays,
			lowDays: options.lowDays,
			blockedDays: options.blockedDays,
			path: options.path,
			exclude: options.exclude,
		});
	});

program
	.command("link-check")
	.description("Check vault for broken wikilinks")
	.option("--output <mode>", "Output mode (console, report)", "console")
	.option(
		"--exclude <pattern>",
		"Exclude folders matching pattern",
		(value, previous: string[] = []) => {
			previous.push(value);
			return previous;
		},
		[],
	)
	.option("--suggest", "Include close match suggestions")
	.option("--create-stubs", "Create stub notes for missing links")
	.action(async (options, command) => {
		const parent = command.parent?.opts() ?? {};
		await runLinkCheck({
			configPath: parent.config,
			vaultPath: parent.vault,
			verbose: parent.verbose,
			json: parent.json,
			outputMode: options.output,
			exclude: options.exclude,
			suggest: options.suggest,
			createStubs: options.createStubs,
		});
	});

program
	.command("lint")
	.description("Lint frontmatter against configured schemas")
	.option("--path <path>", "Lint a specific folder")
	.option("--fix", "Auto-fix issues where possible")
	.option("--dry-run", "Show changes without writing")
	.option("--output <mode>", "Output mode (console, json, report)", "report")
	.action(async (options, command) => {
		const parent = command.parent?.opts() ?? {};
		await runFrontmatterLint({
			configPath: parent.config,
			vaultPath: parent.vault,
			verbose: parent.verbose,
			json: parent.json,
			outputMode: options.output,
			path: options.path,
			fix: options.fix,
			dryRun: options.dryRun,
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

program
	.command("ralph-queue")
	.description("Build a Ralph task queue from actionable todos")
	.option("--output <mode>", "Output mode (console, queue, json)", "console")
	.option("--max-tasks <count>", "Maximum tasks to queue", Number.parseInt)
	.option("--time-budget <budget>", "Time budget (e.g., 4h, 90m)")
	.option("--project <name>", "Filter by project name")
	.option("--include-low-priority", "Include low priority todos")
	.option("--explain", "Include score breakdowns")
	.action(async (options, command) => {
		const parent = command.parent?.opts() ?? {};
		await runRalphQueue({
			configPath: parent.config,
			vaultPath: parent.vault,
			verbose: parent.verbose,
			json: parent.json,
			output: options.output,
			maxTasks: options.maxTasks,
			timeBudget: options.timeBudget,
			project: options.project,
			includeLowPriority: options.includeLowPriority,
			explain: options.explain,
		});
	});

program
	.command("project-health")
	.description("Generate a project health dashboard")
	.option(
		"--output <mode>",
		"Output mode (console, dashboard, json)",
		"console",
	)
	.option("--status <status>", "Filter by status")
	.option("--sort <field>", "Sort by health, last-touched, or priority")
	.action(async (options, command) => {
		const parent = command.parent?.opts() ?? {};
		await runProjectHealth({
			configPath: parent.config,
			vaultPath: parent.vault,
			verbose: parent.verbose,
			json: parent.json,
			output: options.output,
			status: options.status,
			sort: options.sort,
		});
	});

program.parse();
