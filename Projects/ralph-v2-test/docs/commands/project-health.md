# project-health

## Summary

- Generate a project health dashboard from project notes and linked todos.

## Usage

```bash
bun run src/cli.ts project-health [options]
```

## Options

- `--output <mode>`: Output mode: `console`, `dashboard`, or `json`. Default: `console`.
- `--status <status>`: Filter projects by status (case-insensitive).
- `--sort <field>`: Sort by `health`, `last-touched`, or `priority`.
- `-h, --help`: Show command help.
- `--vault <path>`: Global option. Override vault root path.
- `--config <path>`: Global option. Use a specific config file.
- `-v, --verbose`: Global option. Verbose output.
- `-q, --quiet`: Global option. Quiet output.
- `--json`: Global option. Force JSON output.

## Examples

```bash
# Print a markdown dashboard to stdout
bun run src/cli.ts project-health

# Write the dashboard note to the vault root
bun run src/cli.ts project-health --output dashboard

# Filter to archived projects and sort by recency
bun run src/cli.ts project-health --status archived --sort last-touched

# JSON output for scripting
bun run src/cli.ts project-health --output json
```

## Output

### Console (markdown)

```md
# Projects Health Dashboard

*Generated: 2026-01-19*

## Summary
- Total projects: 12
- Active: 9
- Healthy: 4 | Warning: 3 | Critical: 2
- Blocked: 1

## Critical (Needs Immediate Attention)
| Project | Status | Last Touched | Issues |
|---------|--------|--------------|--------|
| [[Stale Launch]] | active | 45 days ago | Stale, No next action |

## Warning
| Project | Status | Last Touched | Issues |
|---------|--------|--------------|--------|
| [[Client Retainer]] | active | 12 days ago | Blocked (1) |

## Healthy
| Project | Status | Last Touched | Issues |
|---------|--------|--------------|--------|
| [[Website Refresh]] | active | 2 days ago | 85/100 |
```

### Dashboard file

`--output dashboard` writes `Projects Dashboard.md` to the vault root and prints a short console summary.

### JSON

```json
{
  "generated": "2026-01-19",
  "summary": { "total": 12, "active": 9, "healthy": 4, "warning": 3, "critical": 2, "blocked": 1 },
  "projects": [
    {
      "name": "Website Refresh",
      "path": "/path/to/vault/8 - Projects/Website Refresh.md",
      "folder": "/path/to/vault/8 - Projects",
      "status": "active",
      "lastTouched": "2026-01-17T00:00:00.000Z",
      "lastTouchedLabel": "2 days ago",
      "stalenessDays": 2,
      "hasNextAction": true,
      "blockers": 0,
      "openTasks": 3,
      "incomePotential": false,
      "healthScore": 85,
      "healthCategory": "healthy",
      "priority": "medium",
      "issues": []
    }
  ],
  "groups": { "critical": [], "warning": [], "healthy": [], "paused": [] },
  "recommendations": { "shipIt": [], "needsAttention": [], "considerArchiving": [] }
}
```

## Health Scoring

- Status values `paused`, `archived`, `completed`, and `inactive` are treated as paused with a score of 100.
- Active projects are scored out of 100 using:
  - Recency (50 points): based on last touched date, with a 30-day staleness threshold.
  - Next action (20 points): frontmatter fields `next_action`, `nextAction`, or `next`, or a "Next Action" section in the note.
  - Blockers (20 points): frontmatter blocker fields plus linked todo notes marked `blocked`.
  - Status (10 points): `active` or `in-progress`.
- Categories: `healthy` >= 70, `warning` 40-69, `critical` < 40.

## Configuration

- Uses `vault.projectsFolder` and `vault.todosFolder` from `vault-tools.config.yaml`.
- Scoring weights are currently hardcoded in `src/lib/project-health.ts` and are not configurable via YAML.

## Related

- [[configuration]]
- [[lib/project-health]]
