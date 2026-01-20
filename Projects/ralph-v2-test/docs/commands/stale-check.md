# stale-check

## Summary

- Detect stale todos and generate a report, inline tags, or a console summary.

## Usage

```bash
bun run src/cli.ts stale-check [options]
```

## Options

- `--output <mode>`: Output mode: `report`, `inline`, or `console` (default: `report`).
- `--high-days <days>`: High priority staleness threshold in days (default: 3).
- `--medium-days <days>`: Medium priority staleness threshold in days (default: 7).
- `--low-days <days>`: Low priority staleness threshold in days (default: 14).
- `--blocked-days <days>`: Blocked staleness threshold in days (default: 14).
- `--path <path>`: Override todos folder path (absolute or relative to the vault root).
- `--exclude <pattern>`: Exclude todos matching a substring in the title or file path (repeatable).
- `-h, --help`: Show command help.
- `--vault <path>`: Global option. Override vault root path.
- `--config <path>`: Global option. Use a specific config file.
- `-v, --verbose`: Global option. Verbose output.
- `-q, --quiet`: Global option. Quiet output.
- `--json`: Global option. Force JSON output.

## How It Works

- Scans every markdown file under the todos folder.
- Skips todos with `status: completed` in frontmatter.
- Computes the last-updated date from the note content or file metadata.
- Marks items as stale when they exceed the configured threshold for their priority.
- Writes a report, tags the note frontmatter, or prints a summary depending on `--output`.

## Staleness Criteria

- **Priority**: Reads `priority` from frontmatter (`high`, `medium`, `low`). Defaults to `medium`.
- **Status**: `status: blocked` uses the blocked threshold; other statuses are treated as active.
- **Last updated**: Uses the first match for `Last updated: YYYY-MM-DD` (case-insensitive) in the note body.
- **Fallback dates**: If no explicit date is present, uses the file modified time; if missing, uses created time.
- **Severity**: `critical` if days stale >= 2x the threshold; otherwise `warning`.

Blocked items include the blocker reason when present in frontmatter under `blocker`, `blocker_reason`,
`blocked_reason`, or `blockedReason`.

## Threshold Configuration

Thresholds are days since last update. Values are rounded to whole days and clamped to at least 1 day.
Defaults are:

- High: 3 days
- Medium: 7 days
- Low: 14 days
- Blocked: 14 days

Override any threshold using the corresponding CLI flag.

## Output

### Report

`--output report` writes `Stale Todos Report.md` to the vault root and prints a summary via the configured
output format.

```md
# Stale Todos Report

*Generated: 2026-01-19*

## Critical (>2x threshold)
| Todo | Priority | Days Stale | Last Updated |
|------|----------|------------|--------------|
| [[Old High]] | high | 10 | 2026-01-09 |

## Warning (>1x threshold)
| Todo | Priority | Days Stale | Last Updated |
|------|----------|------------|--------------|
| [[Old Medium]] | medium | 8 | 2026-01-11 |

## Summary
- Total active todos: 12
- Stale todos: 3 (25%)
- Average age: 6.4 days
```

### Inline

`--output inline` tags each stale todo with `⚠️ STALE` in frontmatter. It still prints a summary via the
configured output format.

### Console

`--output console` prints a short summary to stdout and does not write files.

```text
Active todos: 12
Stale todos: 3
Blocked stale todos: 1
Average age: 6.4 days
```

## Examples

```bash
# Generate the default report in the vault root
bun run src/cli.ts stale-check

# Tag stale todos inline
bun run src/cli.ts stale-check --output inline

# Override thresholds for a sprint backlog
bun run src/cli.ts stale-check --high-days 2 --medium-days 5 --low-days 10

# Skip anything with "If Time" in the title or path
bun run src/cli.ts stale-check --exclude "If Time" --exclude "Someday"

# Only scan a specific folder
bun run src/cli.ts stale-check --path "8 - Projects/Alpha"
```

## Configuration

- `vault.path`: Vault root path used to resolve todos and report location.
- `vault.todosFolder` (legacy `todos_path`): Default todos folder when `--path` is not provided.
- `output.format`: Output format used for summaries (`console`, `markdown`, or `json`).

## Related

- [[configuration]]
