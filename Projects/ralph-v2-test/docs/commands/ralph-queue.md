# ralph-queue

## Summary

- Build a prioritized task queue from actionable todos for Ralph to execute.

## Usage

```bash
bun run src/cli.ts ralph-queue [options]
```

## Options

- `--output <mode>`: Output mode: `console`, `queue`, or `json`. Default: `console`.
- `--max-tasks <count>`: Maximum number of tasks to queue. Default: `5`.
- `--time-budget <budget>`: Time budget (e.g., `4h`, `90m`). Uses hours by default.
- `--project <name>`: Filter to projects whose name includes the value.
- `--include-low-priority`: Include low priority todos (otherwise skipped).
- `--explain`: Include score breakdowns in console/queue output.
- `-h, --help`: Show command help.
- `--vault <path>`: Global option. Override vault root path.
- `--config <path>`: Global option. Use a specific config file.
- `-v, --verbose`: Global option. Verbose output.
- `-q, --quiet`: Global option. Quiet output.
- `--json`: Global option. Force JSON output.

## How the Queue Is Built

- Scans markdown todos in `vault.todosFolder`.
- Skips notes tagged `manual` or `no-ralph` (frontmatter or inline tag).
- Requires `status: active` (default when missing).
- Requires at least one checkbox task in the note body.
- Requires a `## Project` section with a wikilink; the first link is used.
- Resolves the project note from `vault.projectsFolder` and reads its repo path.
- Validates the repo path exists and contains `AGENTS.md` (Ralph support).
- Optionally filters by `--project` string match.
- Pulls `due`/`due_date`, `priority`, `estimate`, and income metadata for scoring.

## Task Prioritization

Tasks are sorted by score (highest first) and then capped by `--max-tasks` and
optional `--time-budget`. Score is the sum of:

- Priority weight: `high` = 3, `medium` = 2, `low` = 1.
- Due date bonus: `overdue` = +2, `due today` = +1.
- Spec bonus: +1 when a repo spec is found.
- Income bonus: +1 when `income`/`income_potential`/`incomePotential` is true.

Time budgeting uses the task estimate average hours. Estimates are read from
frontmatter (`estimate`, `est`, `estimated_hours`, `hours`, `complexity`) and
support ranges like `1-2h` or single values like `90m`. Defaults are:

- High: 2-4 hours
- Medium: 1-2 hours
- Low: 0.5-1 hour

## Output

### Console

`--output console` prints a ranked list plus stats.

```text
Ralph queue:
1. Fix onboarding docs [Client Retainer] score 5 (high priority + has spec)
   spec: /repos/client/specs/012-docs-onboarding.md
   est: 2-4 hours

Stats:
- candidates: 8
- queued: 5
- total est hours: 7.0
```

### Queue Note

`--output queue` writes `Ralph Queue.md` to the vault root and prints a short
summary. Example excerpt:

```md
# Ralph Queue

*Generated: 2026-01-19*
*Time Budget: 4 hours*

## Next Up

### 1. Fix onboarding docs
- **Project**: [[Client Retainer]]
- **Repo**: `/repos/client`
- **Score**: 5 (high priority + has spec)
- **Spec**: `/repos/client/specs/012-docs-onboarding.md`
- **Est. Time**: 2-4 hours
```

### JSON

`--output json` prints the full queue structure:

```json
{
  "tasks": [
    {
      "title": "Fix onboarding docs",
      "todoPath": "/vault/6 - Atomic Notes/Todos/Onboarding.md",
      "priority": "high",
      "project": { "name": "Client Retainer", "linkTarget": "Client Retainer" },
      "specPath": "/repos/client/specs/012-docs-onboarding.md",
      "score": 5,
      "scoreReasons": ["high priority", "has spec"],
      "estimate": { "minHours": 2, "maxHours": 4, "averageHours": 3, "label": "2-4 hours" }
    }
  ],
  "stats": { "totalCandidates": 8, "queued": 5, "totalEstimateHours": 7 }
}
```

## Ralph Integration

- The queue ensures each task points to a repo with `AGENTS.md`, so Ralph can
  follow project-specific build/test instructions.
- When a repo has `specs/` and `IMPLEMENTATION_PLAN.md`, the next unchecked spec
  is attached as `specPath` to guide Ralph's next task.

## Related

- [[lib/ralph-queue]]
- [[configuration]]
