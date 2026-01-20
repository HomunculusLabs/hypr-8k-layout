# Review: Architecture Documentation (Spec 027)

## Scope
- Files reviewed: README.md, ARCHITECTURE.md, docs/configuration.md, src/cli.ts, src/lib/config.ts

## Findings

### Blocking
1. `ARCHITECTURE.md` says "Config is hierarchical: CLI > env > config file > defaults", but config values are not read from env; only `VAULT_PATH` is used for config discovery (`src/lib/config.ts`). This is inaccurate and should be corrected.
2. `docs/configuration.md` does not list default values for most options (todos/projects/daily/templates folders, output format/color/verbose), despite the review checklist requiring defaults.

### Non-blocking
- None.

## Checklist Notes
- README usage examples for `--help` and `stats --help` work as shown.
- Command table matches the CLI help output.
- Directory structure and "Adding a New Command" guide align with the repo layout.
- Config file location order and legacy keys match `src/lib/config.ts`.

## Approval
Changes requested.
