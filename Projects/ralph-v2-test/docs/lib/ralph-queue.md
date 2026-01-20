# ralph-queue

## Summary

- Build and format a prioritized Ralph task queue from todo notes.

## API

- `buildRalphQueue(paths: RalphQueuePaths): Promise<RalphQueueResult>`: Scan todos, score candidates, and return a queue with stats.
- `formatQueueMarkdown(result: RalphQueueResult, options: { generated: Date; timeBudgetHours?: number; explain: boolean }): string`: Render a queue note.
- `formatQueueConsole(result: RalphQueueResult, options: { explain: boolean }): string[]`: Render console lines for the queue.

## Data Structures

- `RalphQueuePaths`: `{ vaultPath, todosPath, projectsPath, maxTasks, timeBudgetHours?, projectFilter?, includeLowPriority, now? }`.
- `RalphQueueResult`: `{ tasks, skipped, warnings, stats }`.
- `RalphQueueTask`: `{ title, todoPath, priority, project?, specPath?, score, scoreReasons, dueDate?, incomePotential, estimate }`.
- `RalphQueueSkipped`: `{ title, reason, todoPath, project? }`.
- `RalphQueueStats`: `{ totalCandidates, queued, blockedSkipped, noRalphSupportSkipped, totalEstimateHours, timeBudgetHours? }`.
- `RalphProjectInfo`: `{ name, linkTarget, projectNotePath?, repoPath? }`.
- `RalphEstimate`: `{ minHours, maxHours, averageHours, label }`.

## Queue Algorithm

1. Collect all markdown todo files from `todosPath`.
2. For each todo note:
   - Resolve title from frontmatter `title` or filename.
   - Skip if tagged `manual`/`no-ralph` (frontmatter or inline tag).
   - Skip if `status` is not `active` (default `active`).
   - Skip if low priority and `includeLowPriority` is false.
   - Skip if no checkbox tasks are present.
   - Extract project from the first wikilink in a `## Project` section.
   - Skip if project is missing or fails the `projectFilter`.
   - Resolve the project note in `projectsPath` and its repo path.
   - Skip if repo path is missing, not found, or lacks `AGENTS.md`.
   - Attach income potential, due date, estimate, and spec info.
3. Score candidates, then sort descending by score.
4. Emit tasks until `maxTasks` is reached or `timeBudgetHours` would be exceeded.
5. Build stats for queued/skipped counts and total estimated hours.

## Task Discovery Logic

- Project links are resolved by name or relative path under `projectsPath`.
- Repo paths are read from `repo`, `repo_path`, `repoPath`, or `path` frontmatter
  and resolved relative to the project note when needed.
- Spec discovery reads the repo `IMPLEMENTATION_PLAN.md` and selects the first
  unchecked spec name in the form `- [ ] ... [spec-name.md]` when the file exists
  under `specs/`.

## Priority Scoring

Score is the sum of:

- Priority weight: `high` = 3, `medium` = 2, `low` = 1.
- Due status: `overdue` = +2, `due today` = +1.
- Spec present: +1 when a next spec is resolved.
- Income potential: +1 when `income`/`income_potential`/`incomePotential` is true.

The `scoreReasons` array records the labels in the order applied and is shown
when `explain` is enabled.

## Estimate Handling

- Accepts numeric hours or strings like `1-2h`, `90m`, or `2 hrs`.
- Converts minutes to hours.
- Defaults to priority-based ranges:
  - High: 2-4 hours
  - Medium: 1-2 hours
  - Low: 0.5-1 hour

## Examples

```ts
import { buildRalphQueue, formatQueueMarkdown } from "./src/lib/ralph-queue";

const result = await buildRalphQueue({
  vaultPath: "/vault",
  todosPath: "/vault/6 - Atomic Notes/Todos",
  projectsPath: "/vault/8 - Projects",
  maxTasks: 5,
  includeLowPriority: false,
});

const markdown = formatQueueMarkdown(result, {
  generated: new Date(),
  explain: true,
});

console.log(markdown);
```

## Related

- [[commands/ralph-queue]]
- [[configuration]]
