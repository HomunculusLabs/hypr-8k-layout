# Review: Performance Improvements (Spec 024)

## Scope
- Files reviewed: src/lib/command-runner.ts, src/lib/regex-cache.ts, src/lib/stats.ts, src/lib/lint.ts, src/commands/*.ts, src/lib/output/index.ts

## Tests
- `bun test`
- `bun build src/cli.ts --outfile dist/vault-tools --target bun`

## Findings

### Blocking
1. Stack traces are not preserved. `createCommandRunner` funnels all errors through `reportError`, which only prints `error.message` and drops `error.stack` (see `src/lib/output/index.ts`). This fails the checklist item and makes debugging regressions harder.

### Non-blocking
- No explicit tests validate regex caching behavior (e.g., verifying compilation happens once or that cache keys respect flags). Existing tests exercise filename matching but not caching behavior directly.

## Checklist Notes
- Regex caching: `getCachedRegex` is used in schema matching for stats/lint, and cache keys include flags when provided.
- Command runner: all command entry points use `createCommandRunner`; most try-catch blocks in commands are removed.
- Behavior: output and exit codes align with previous command behavior; lint still sets exit code on validation errors.

## Approval
Changes requested.
