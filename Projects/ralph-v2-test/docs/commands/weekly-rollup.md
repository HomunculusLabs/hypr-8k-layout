# weekly-rollup

## Summary

- Generate a weekly rollup report from daily notes and completed todos.

## Usage

```bash
bun run src/cli.ts weekly-rollup [options]
```

## Options

- `--week <week>`: ISO week to summarize (`YYYY-WXX`). Defaults to the current week.
- `--start <date>`: Start date (`YYYY-MM-DD`). Requires `--end`.
- `--end <date>`: End date (`YYYY-MM-DD`). Requires `--start`.
- `--output <path>`: Output folder or full markdown file path.
- `-h, --help`: Show command help.
- `--vault <path>`: Global option. Override vault root path.
- `--config <path>`: Global option. Use a specific config file.
- `-v, --verbose`: Global option. Verbose output.
- `-q, --quiet`: Global option. Quiet output.
- `--json`: Global option. Force JSON output.

## What Gets Rolled Up

- Daily notes in the date range.
- Completed todos in the todos folder with `status: completed`.

Daily note completions come from:

- The `**Done:**` section (bullets or checked checkboxes).
- Any checked checkbox (`- [x]`) in the note.

Todo completions are included when:

- `completed`/`done`/`finished`-style frontmatter fields resolve to a date, or
- A `completed: YYYY-MM-DD` line exists in the note body, or
- The file modified date falls within the range.

Todos can be tagged with:

- Project: first wikilink under a `## Project` or `## Projects` section.
- Category: `category`, `area`, `context`, or `tags` frontmatter (`work`, `home`, `personal`).

## Output Location and Format

- Default output folder: `<vault>/1 - Rough Notes/Weekly`
- If `--output` ends with `.md`, it is treated as a file path.
- Otherwise it is treated as a folder path and a report file named
  `Weekly Rollup - <label>.md` is created.

Report structure:

- Header with rollup label and date range.
- Summary of completed items, active days, and missing daily notes.
- Sections grouped by project, category, and day.
- Metrics table comparing last week vs this week.

Example report excerpt:

```md
# Weekly Rollup - 2026-W03

*Week of January 12, 2026 - January 18, 2026*

## Summary
- Completed: 5 todos
- Active days: 2/7
- vs last week: +5 todos

## By Project
### 8 - Projects/Alpha
- [x] Finish docs
```

## Configuration

- `vault.dailyFolder` (legacy `daily_notes_path`): Daily notes folder.
- `vault.todosFolder` (legacy `todos_path`): Todos folder.
- `vault.path` (legacy `vault_path`): Used to resolve default output folder.

## Related

- [[lib/weekly-rollup]]
- [[configuration]]
