# project-health

## Summary

- Compute project health scores and generate the dashboard markdown used by the `project-health` command.

## API

- `buildProjectHealth(paths: ProjectHealthPaths): Promise<ProjectHealthResult>`: Scan project notes and linked todos to build scores, groups, and recommendations.
- `formatDashboardMarkdown(result: ProjectHealthResult): string`: Render the dashboard markdown text.

## Data Structures

- `ProjectHealthPaths`: `{ projectsPath, todosPath, statusFilter?, sort?, now? }`.
- `ProjectHealthResult`: `{ generated, summary, projects, groups, recommendations }`.
- `ProjectHealthProject`: Per-project metrics including `healthScore`, `healthCategory`, `priority`, `issues`.
- `ProjectHealthSummary`: Totals for `total`, `active`, `healthy`, `warning`, `critical`, `blocked`.
- `ProjectHealthGroups`: Buckets of projects by `critical`, `warning`, `healthy`, `paused`.
- `ProjectHealthRecommendations`: Lists for `shipIt`, `needsAttention`, `considerArchiving`.

## Scoring Algorithm

- Status values `paused`, `archived`, `completed`, and `inactive` short-circuit to `paused` with score 100.
- Otherwise, score is the sum of weighted factors (rounded to a whole number):
  - Recency (50): based on `lastTouched` compared to a 30-day staleness threshold.
  - Next action (20): `next_action`, `nextAction`, `next`, or a "Next Action" section with content.
  - Blockers (20): frontmatter blocker count plus linked todo notes marked `blocked`.
  - Status (10): `active` or `in-progress`.
- Categories: `healthy` >= 70, `warning` 40-69, `critical` < 40.

## Metric Details

- **Project candidates**: All markdown files under `projectsPath` plus `IMPLEMENTATION_PLAN.md` files inside project folders (treated as projects without notes).
- **Last touched**: First valid date from frontmatter keys (`last_touched`, `lastTouched`, `last_touched_date`, `updated`, `last_updated`, `modified`, `touched`), otherwise file `mtime`.
- **Next action**: Frontmatter `next_action`, `nextAction`, `next`, or a section heading containing "next action".
- **Blockers**: Numeric or list-based frontmatter counts plus linked todo notes with `status: blocked`.
- **Open tasks**: Frontmatter `open_tasks`/`openTasks`/`task_count`/`taskCount`, else open checklist items in `IMPLEMENTATION_PLAN.md`, else open linked todos.
- **Income potential**: Frontmatter `income`, `income_potential`, or `incomePotential` coerced to boolean.

## Behavior Notes

- Linked todos are resolved by basename or vault-relative path (case-insensitive) and de-duplicated.
- `statusFilter` matches exact status string (case-insensitive).
- `sort` supports `health`, `last-touched`, and `priority`.
- Recommendations:
  - `shipIt`: no blockers and has next action.
  - `needsAttention`: missing next action or blocked.
  - `considerArchiving`: stale (>= 30 days) with no next action.

## Examples

```ts
import { buildProjectHealth, formatDashboardMarkdown } from "./src/lib/project-health";

const result = await buildProjectHealth({
  projectsPath: "/vault/8 - Projects",
  todosPath: "/vault/6 - Atomic Notes/Todos",
});

const markdown = formatDashboardMarkdown(result);
console.log(markdown);
```

## Related

- [[commands/project-health]]
- [[configuration]]
