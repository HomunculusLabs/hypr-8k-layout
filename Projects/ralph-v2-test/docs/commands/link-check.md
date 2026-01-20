# link-check

## Summary

- Scan the vault for broken wikilinks and optional missing heading references.

## Usage

```bash
bun run src/cli.ts link-check [options]
```

## Options

- `--output <mode>`: Output mode: `console` or `report` (default: `console`).
- `--exclude <pattern>`: Exclude files whose path contains the pattern (repeatable).
- `--suggest`: Include close-match suggestions for missing files.
- `--create-stubs`: Create stub notes for missing files.
- `-h, --help`: Show command help.
- `--vault <path>`: Global option. Override vault root path.
- `--config <path>`: Global option. Use a specific config file.
- `-v, --verbose`: Global option. Verbose output.
- `-q, --quiet`: Global option. Quiet output.
- `--json`: Global option. Force JSON output.

## How It Works

- Scans all markdown files in the vault, skipping files whose relative path matches `--exclude`.
- Ignores frontmatter and fenced code blocks.
- Parses wikilinks, including embeds (`![[...]]`).
- Skips external targets such as `http(s)` and `mailto:` links.
- Resolves links to files and headings. Missing files and missing headings are reported.
- When enabled, suggests close matches or creates stub notes for missing files.

## Link Issues Detected

- **Missing file**: The target note does not exist in the vault.
- **Missing heading**: The target note exists, but the referenced heading is not found.

## Output

### Console

`--output console` prints a summary and lists broken links by source file.

```text
Broken Link Check
Files scanned: 12, broken links: 3, files with broken links: 2

8 - Projects/Alpha.md
  Line 12: [[Missing Note]] (missing file)
    Suggestion: [[Existing Note]]
  Line 18: [[Spec#Missing Heading]] (missing heading #Missing Heading)
```

### Report

`--output report` writes `Broken Links.md` to the vault root and prints a summary via the configured output formatter.

```md
# Broken Links Report

*Generated: 2026-01-19*

## Summary
- Files scanned: 12
- Broken links found: 3
- Files with broken links: 2

## Broken Links

### [[8 - Projects/Alpha.md]]
- Line 12: `[[Missing Note]]`
  - Suggestion: Did you mean [[Existing Note]]?
- Line 18: `[[Spec#Missing Heading]]`
  - File exists but heading `#Missing Heading` not found
```

## Fix Suggestions

- Use `--suggest` to surface close matches when a note was renamed.
- Use `--create-stubs` to create placeholder notes for missing targets.
- Fix missing headings by adding the heading or updating the link target.

## Examples

```bash
# Console summary (default)
bun run src/cli.ts link-check

# Generate a report in the vault root
bun run src/cli.ts link-check --output report

# Ignore archive folders and include suggestions
bun run src/cli.ts link-check --exclude "_Archive" --suggest

# Create stub notes for missing links
bun run src/cli.ts link-check --create-stubs
```

## Configuration

- `vault.path`: Vault root path used for scanning and report output.
- `output.format`: Output format used for summaries (`console`, `markdown`, or `json`).

## Related

- [[configuration]]
- [[lib/link-check]]
