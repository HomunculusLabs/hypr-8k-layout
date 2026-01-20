# Review: Edge Case Tests (Spec 025)

## Scope
- Files reviewed: src/lib/fs/walk.test.ts, src/lib/markdown/frontmatter.test.ts, src/lib/coerce.test.ts, src/commands/project-health.test.ts, src/commands/stats.test.ts

## Tests
- `bun test`
- `bun test --coverage`
- `bun test --shuffle`
- `bun build src/cli.ts --outfile dist/vault-tools --target bun`

## Findings

### Blocking
1. Temp directories created in tests are not cleaned up in `src/commands/project-health.test.ts` and `src/commands/stats.test.ts`. This violates the checklist items about cleaning up temp directories and avoiding artifacts on failure. Add `afterEach` cleanup or a shared helper that tracks and removes temp roots.

### Non-blocking
- The symlink coverage for `collectFiles` only checks a cycle; there is no explicit broken-symlink test at the walker level (the broken symlink case is only covered via `project-health`). Consider adding a direct broken-symlink test for `src/lib/fs/walk.ts` to ensure walker behavior is covered independently.

## Checklist Notes
- YAML edge cases: missing delimiter, invalid YAML, empty and whitespace-only frontmatter are covered and assert expected behavior.
- Date edge cases: leap year, month boundary, and invalid month/day cases are covered.
- Error paths: non-existent vault and file-as-vault paths are tested with exit code assertions.
- Tests are deterministic and pass under shuffled order.

## Approval
Changes requested.
