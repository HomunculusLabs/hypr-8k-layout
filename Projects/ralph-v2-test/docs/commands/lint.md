# lint

## Summary

- Lint frontmatter against configured schemas and optionally auto-fix missing or malformed fields.

## Usage

```bash
bun run src/cli.ts lint [options]
```

## Options

- `--path <path>`: Lint a specific folder (absolute or relative to the vault root).
- `--fix`: Auto-fix issues where possible (adds defaults, normalizes enums/dates).
- `--dry-run`: Show fixes without writing files (use with `--fix`).
- `--output <mode>`: Output mode: `console`, `json`, or `report` (default).
- `-h, --help`: Show command help.
- `--vault <path>`: Global option. Override vault root path.
- `--config <path>`: Global option. Use a specific config file.
- `-v, --verbose`: Global option. Verbose output.
- `-q, --quiet`: Global option. Quiet output.
- `--json`: Global option. Force JSON output.

## Examples

```bash
# Generate a markdown report in the vault root
bun run src/cli.ts lint

# Console output for a subfolder
bun run src/cli.ts lint --path "8 - Projects" --output console

# JSON output for scripting
bun run src/cli.ts lint --output json

# Apply auto-fixes, but don't write changes
bun run src/cli.ts lint --fix --dry-run
```

## Schema Configuration

Lint rules live under `schemas` in `vault-tools.config.yaml`. Each schema has:

- `match`: Optional filter to select files by folder, filename regex, and frontmatter key/value pairs.
- `fields`: The frontmatter fields to validate.

### Schema format

```yaml
schemas:
  todo:
    match:
      folder: 6 - Atomic Notes/Todos
      filename: ".*\\.md$"
      frontmatter:
        type: todo
    fields:
      title:
        type: string
        required: true
        default: Untitled
      status:
        type: enum
        required: true
        values: [open, done, blocked]
      due:
        type: date
      tags:
        type: array
```

Supported field types:

- `string`: must be a string.
- `array`: must be an array.
- `enum`: must be one of `values`.
- `date`: parseable date normalized to `YYYY-MM-DD` with `--fix`.

### Example lint rules

- **Required field**: `title` is required; missing values are errors unless `--fix` adds a `default`.
- **Enum values**: `status` must be one of `open|done|blocked`; `--fix` can normalize close matches.
- **Date normalization**: `due` accepts parseable dates but is normalized to `YYYY-MM-DD` with `--fix`.
- **Unknown fields**: Any frontmatter key not listed in `fields` (or in `match.frontmatter`) becomes a warning.

## Output

### Console

```text
Files scanned: 12, Errors: 2, Warnings: 1
ERROR: 8 - Projects/Alpha.md title - Missing required field (expected: default: Untitled)
WARNING: 8 - Projects/Alpha.md extra_field - Unknown field
```

Errors indicate required fields or invalid values; warnings point to unknown fields or schema overlap; info lines appear when `--fix` applies changes.

### Report

`--output report` writes `Frontmatter Lint Report.md` to the vault root and prints a summary.

```md
# Frontmatter Lint Report

*Generated: 2026-01-19*

## Summary
- Files scanned: 12
- Files with errors: 1
- Total errors: 2
- Total warnings: 1

## Errors
### [[Alpha.md]] (todo)
- `title`: Missing required field (expected: default: Untitled)
```

### JSON

```json
{
  "filesScanned": 12,
  "filesMatched": 3,
  "filesWithErrors": 1,
  "totalErrors": 2,
  "totalWarnings": 1,
  "totalInfos": 0,
  "issues": [
    {
      "severity": "error",
      "filePath": "/vault/8 - Projects/Alpha.md",
      "noteType": "todo",
      "field": "title",
      "message": "Missing required field",
      "expected": "default: Untitled"
    }
  ],
  "reportPath": "/vault/Frontmatter Lint Report.md",
  "fixedFiles": 0
}
```

## Related

- [[configuration]]
- [[lib/lint]]
