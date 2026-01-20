# cli

## Summary

- Defines the top-level `vault-tools` CLI using Commander.
- Registers all commands, global options, and the CLI help/version behavior.
- Parses args and dispatches to each `run*` command implementation.

## Entry Point

`src/cli.ts` is the CLI entry point and is executed via Bun:

```bash
bun run src/cli.ts <command> [options]
```

The command definitions map directly to the command modules under
`src/commands/`. At the end of the file, `program.parse()` consumes the
process arguments, prints help/version when requested, and exits with a
non-zero status on parsing errors.

## Command Registration

Commands are registered on a single Commander `program` instance. Each command:

- Uses `program.command("<name>")` to create a subcommand.
- Adds options and arguments with `.option(...)` and `.argument(...)`.
- Defines an `.action(...)` handler that calls a `run*` function from
  `src/commands/`.
- Passes global options from `command.parent?.opts()` (or `parent.parent` for
  nested commands like `template create`).

Example pattern:

```ts
program
  .command("shopping-sync")
  .description("Sync shopping items from todo notes")
  .option("--dry-run", "Show changes without writing")
  .action(async (options, command) => {
    const parent = command.parent?.opts() ?? {};
    await runShoppingSync({
      configPath: parent.config,
      vaultPath: parent.vault,
      verbose: parent.verbose,
      json: parent.json,
      dryRun: options.dryRun,
    });
  });
```

## Global Options

These options are registered on `program` and are available to all commands:

- `--vault <path>`: Override vault root path.
- `--config <path>`: Use a specific config file.
- `-v, --verbose`: Verbose output.
- `-q, --quiet`: Quiet output.
- `--json`: Force JSON output.

Command handlers pass the selected values into each `run*` implementation.

## Help System

Commander automatically provides:

- `-h, --help` at the top level with the list of commands.
- `-h, --help` on each subcommand with its specific options.

Each command's `.description(...)` text appears in help output.

## Version Handling

The CLI version is set via `.version("0.1.0")`. Update this string when
releasing a new version to keep `vault-tools --version` accurate.

## Error Handling

There is no custom global error handler in `src/cli.ts`. Errors thrown from
command handlers (for example, invalid `--var` values in `template create`)
propagate to Bun, which exits with a non-zero status. Commander handles
option/argument parsing errors and prints usage before exiting.

## Adding New Commands

1. Implement the command in `src/commands/<name>.ts` with a `run<Name>` export.
2. Import the command in `src/cli.ts`.
3. Register it using `program.command(...)` with options/arguments.
4. In the action handler, pull global options from `command.parent?.opts()` and
   pass them into your `run*` function.
5. Add documentation under `docs/commands/`.

For nested commands (like `template list` and `template create`), define a
parent command and add subcommands via `.command(...)` on the parent.

## Related

- [[configuration]]
- [[commands/shopping-sync]]
- [[commands/template]]
