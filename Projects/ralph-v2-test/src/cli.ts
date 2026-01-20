#!/usr/bin/env bun
import { Command } from "commander";
import { runShoppingSync } from "./commands/shopping-sync";

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

program.parse();
