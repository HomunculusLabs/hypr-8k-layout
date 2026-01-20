# shopping-sync

## Summary

- Aggregate shopping items from todo notes and sync them into `Shopping List.md`.

## Usage

```bash
bun run src/cli.ts shopping-sync [options]
```

## Options

- `--dry-run`: Show changes without writing.
- `--watch`: Watch for changes and resync.
- `-h, --help`: Show command help.
- `--vault <path>`: Global option. Override vault root path.
- `--config <path>`: Global option. Use a specific config file.
- `-v, --verbose`: Global option. Verbose output.
- `-q, --quiet`: Global option. Quiet output.
- `--json`: Global option. Force JSON output.

## How It Works

- Scans every markdown file under the todos folder.
- Looks for a `## Shopping` section (case-insensitive) in each note.
- Collects checkbox items and groups them by category headings (H3-H6) within the shopping section.
- Writes a consolidated list to `Shopping List.md` at the vault root.
- Syncs checkbox states both ways: checked items in the list will be checked in todos, and vice versa.

## List Format

### Todo Notes

The command reads a `## Shopping` section that contains checkbox items.
Optional categories use headings like `### Produce` or `#### Pantry`.

```md
## Shopping

### Produce
- [ ] Lemons
- [x] Spinach

### Pantry
- [ ] Olive oil
```

### Shopping List Output

The generated list includes sources for each item as wikilinks.

```md
# Shopping List

## Produce
- [ ] Lemons ([[Weekend Prep]])
- [x] Spinach ([[Weekend Prep]])

## Pantry
- [ ] Olive oil ([[Kitchen Restock]], [[Weekend Prep]])

---
*Auto-synced: 2026-01-20 09:30*
```

## Examples

```bash
# Sync once
bun run src/cli.ts shopping-sync

# Dry run
bun run src/cli.ts shopping-sync --dry-run

# Keep syncing on changes
bun run src/cli.ts shopping-sync --watch
```

## Configuration

- `vault.path`: Vault root path. `Shopping List.md` is written here.
- `vault.todosFolder` (legacy `todos_path`): Folder scanned for todo notes.

## Related

- [[configuration]]
- [[lib/shopping-sync]]
