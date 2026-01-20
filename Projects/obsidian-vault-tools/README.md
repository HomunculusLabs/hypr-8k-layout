# vault-tools

CLI utilities for Obsidian vault automation.

## Installation

```bash
bun install
```

## Obsidian Plugin Installation

### From Obsidian Community Plugins
1. Open Settings → Community plugins
2. Search for "Vault Tools"
3. Install and enable

### Manual Installation
1. Download `main.js`, `manifest.json`, `styles.css` from releases
2. Create folder: `.obsidian/plugins/vault-tools/`
3. Copy files into folder
4. Reload Obsidian and enable plugin

## Usage

```bash
# Show help
bun run src/cli.ts --help

# Run with an explicit vault path
bun run src/cli.ts stats --vault "/path/to/vault"
bun run src/cli.ts project-health --vault "/path/to/vault"
bun run src/cli.ts lint --vault "/path/to/vault"

# After building, run the compiled binary
bun run build
./vault-tools stats --vault "/path/to/vault"
```

## Commands

| Command | Description |
| --- | --- |
| `shopping-sync` | Sync shopping items from todo notes |
| `daily-populate` | Populate daily note with scheduled tasks and context |
| `weekly-rollup` | Generate a weekly rollup from daily notes and todos |
| `stale-check` | Detect stale todos and generate a report |
| `link-check` | Check vault for broken wikilinks |
| `lint` | Lint frontmatter against configured schemas |
| `template list` | List available templates |
| `template create` | Create a note from a template |
| `ralph-queue` | Build a Ralph task queue from actionable todos |
| `project-health` | Generate a project health dashboard |
| `stats` | Generate statistics about the vault |

## Configuration

Create a `vault-tools.config.yaml` in your vault root (or current working directory), or
place a config at `~/.config/vault-tools/config.yaml`. If `VAULT_PATH` is set, the tool
also checks for `vault-tools.config.yaml` inside that vault.

See `docs/configuration.md` for all options and schema details.

## Architecture

See `ARCHITECTURE.md` for project layout, design principles, and extension steps.

## Contributing

- Keep commands thin: parse args and delegate to `src/lib`.
- Add tests in `tests/` or alongside the lib module.
- Run `bun test` and `bun run lint` before PRs.

## Development

```bash
bun test
bun run lint
bun run build
```
