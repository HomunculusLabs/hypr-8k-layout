# Review: Constants Consolidation (Spec 026)

## Scope
- Files reviewed: src/lib/constants.ts, src/lib/project-health.ts, src/lib/daily-populate.ts, src/lib/ralph-queue.ts, src/lib/link-check.ts, src/lib/lint.ts, src/commands/*, src/cli.ts

## Findings

### Blocking
1. `IMPLEMENTATION_PLAN.md` remains hardcoded in multiple places (`src/lib/project-health.ts`, `src/lib/daily-populate.ts`, `src/lib/ralph-queue.ts`) instead of being consolidated into `src/lib/constants.ts` as called out in spec 019. This violates the "All magic strings gathered" and "No duplicate definitions" criteria.

### Non-blocking
- Report/dashboard titles are still inline (for example, "# Frontmatter Lint Report", "# Broken Links Report", "Projects Health Dashboard"). If the intent is to centralize user-facing headings, consider a `TITLES`/`HEADINGS` constants map.
- Command-specific output mode strings remain inline (e.g., "report", "inline", "queue", "dashboard"). If these should be standardized, consider per-command output mode constants or enums.

## Checklist Notes
- Output format constants and typing look correct (`OUTPUT_FORMATS`, `OutputFormat`).
- Markdown regexes and delimiters are consolidated and used consistently.
- No centralized ignored-directory list is present in the codebase; unable to verify consolidation.

## Approval
Changes requested.
