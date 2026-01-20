# stats

## Summary

- Generate statistics about an Obsidian vault, including counts, links, tags, activity, and frontmatter health.

## Usage

```bash
bun run src/cli.ts stats [options]
```

## Options

- `--section <section...>`: Sections to include. Values: `counts`, `links`, `tags`, `activity`, `frontmatter`. Defaults to all sections.
- `--path <path>`: Limit the scan to a folder (absolute or relative to the vault root).
- `--output <format>`: Output format: `console`, `markdown`, or `json`.
- `--compare <path>`: Compare against a previous stats JSON snapshot (absolute or vault-relative path).
- `--vault <path>`: Global option. Override vault root path.
- `--config <path>`: Global option. Use a specific config file.
- `-v, --verbose`: Global option. Verbose output.
- `-q, --quiet`: Global option. Quiet output.
- `--json`: Global option. Force JSON output.

## Examples

```bash
# Full stats in console output (default)
bun run src/cli.ts stats

# Only counts and links for a subfolder
bun run src/cli.ts stats --section counts --section links --path "8 - Projects"

# Save JSON snapshot for later comparison
bun run src/cli.ts stats --output json > vault-stats.json

# Compare current stats to a previous snapshot
bun run src/cli.ts stats --compare vault-stats.json

# Write a markdown report to the vault root
bun run src/cli.ts stats --output markdown
```

## Output

### Console

```text
Vault Statistics
Notes: 120, Words: 54321, Links: 876
Orphans: 3, Dead ends: 12
Untagged notes: 5
Recent: 22 (7d), 68 (30d)
```

### Markdown

`--output markdown` writes `Vault Stats.md` to the vault root and prints a short summary.

```md
# Vault Statistics

*Generated: 2026-01-19 09:30*

## Overview
| Metric | Count |
|--------|-------|
| Total notes | 120 |
| Total words | 54321 |
| Total links | 876 |
| Avg links/note | 7.3 |
```

### JSON

```json
{
  "generatedAt": "2026-01-19 09:30",
  "vaultPath": "/path/to/vault",
  "rootPath": "/path/to/vault",
  "filesScanned": 120,
  "totals": { "notes": 120, "words": 54321, "characters": 321000, "avgWords": 452, "avgCharacters": 2675 },
  "links": { "total": 876, "avgPerNote": 7.3, "mostLinked": [], "orphans": [], "deadEnds": [], "linkDensity": 7.3 },
  "tags": { "counts": {}, "untagged": 5, "cooccurrence": [] },
  "activity": { "byDay": {}, "byWeek": {}, "byMonth": {}, "recent": { "last7": 22, "last30": 68 }, "mostActiveWeekdays": [] },
  "frontmatter": { "fieldUsage": {}, "enumDistributions": {}, "missingRequired": {} },
  "warnings": []
}
```

## Configuration

- `vault.path`: Sets the vault root used for scanning.
- `output.format`: Sets the default output format when `--output` is omitted.
- `schemas`: Enables frontmatter schema checks used in the `frontmatter` section.

## Related

- [[configuration]]
- [[lib/stats]]
