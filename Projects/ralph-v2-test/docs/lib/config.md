# config

## Summary

- Load vault-tools configuration from YAML, merge defaults, normalize paths, and apply CLI overrides.
- Accept legacy top-level keys and normalize frontmatter schema definitions for linting.

## API

- `loadConfig(overridePath?: string, cliOverrides?: CliOverrides): Promise<VaultToolsConfig>`: Load config, apply defaults and overrides, and validate the vault path.
- `findConfigFile(overridePath?: string): Promise<string | null>`: Locate the first config file that exists based on the priority order.

## Config Locations and Priority

`findConfigFile` searches for a config file in this order (first match wins):

1. `overridePath` passed via `--config` (must exist or an error is thrown)
2. `vault-tools.config.yaml` in the current working directory
3. `vault-tools.config.yaml` inside the vault specified by `VAULT_PATH`
4. `~/.config/vault-tools/config.yaml`

If no file is found, defaults are used and relative paths resolve from the current working directory.

## Config Precedence

When building the final configuration, sources are applied in this order:

1. CLI overrides (`--vault`, `--output`, `--json`, `--verbose`)
2. Environment variables (`VAULT_PATH` affects config discovery)
3. Config file values (from the search order above)
4. Defaults (listed below)

Environment variables do not override individual config keys; they only influence
where the config file is discovered.

## Path Normalization

- `~` expands to the current user's home directory.
- Relative paths are resolved against the config file's directory (or `process.cwd()` if no file was found).

## Defaults

```yaml
vault:
  path: .
  todosFolder: 6 - Atomic Notes/Todos
  projectsFolder: 8 - Projects
  dailyFolder: 1 - Dailies
  templatesFolder: 5 - Templates

output:
  format: console
  color: true
  verbose: false

schemas: {}
```

## Configuration Options

### vault

- `vault.path` (string, default: `.`): Vault root path.
- `vault.todosFolder` (string, default: `6 - Atomic Notes/Todos`): Todos folder path.
- `vault.projectsFolder` (string, default: `8 - Projects`): Projects folder path.
- `vault.dailyFolder` (string, default: `1 - Dailies`): Daily notes folder path.
- `vault.templatesFolder` (string, default: `5 - Templates`): Templates folder path.

### output

- `output.format` (string, default: `console`): `console`, `json`, or `markdown`.
- `output.color` (boolean, default: `true`): Enable ANSI color output.
- `output.verbose` (boolean, default: `false`): Enable verbose output.

### schemas

Frontmatter schema definitions used by the `lint` command.

- `schemas` (object, default: `{}`): Map of schema names to schema definitions.
- `schemas.<name>.match.folder` (string, optional, default: `undefined`): Folder to match.
- `schemas.<name>.match.filename` (string, optional, default: `undefined`): Filename to match.
- `schemas.<name>.match.frontmatter` (object, optional, default: `undefined`): Required frontmatter key/value pairs.
- `schemas.<name>.fields.<field>.type` (string): `string`, `date`, `enum`, or `array`.
- `schemas.<name>.fields.<field>.required` (boolean, optional, default: `false`): Whether the field is required.
- `schemas.<name>.fields.<field>.values` (string[], optional, default: `undefined`): Allowed values for `enum` fields.
- `schemas.<name>.fields.<field>.default` (any, optional, default: `undefined`): Default value used by fixers.

## Environment and CLI Overrides

- `VAULT_PATH` influences config discovery by adding a search candidate for
  `<VAULT_PATH>/vault-tools.config.yaml`.
- `--vault <path>` overrides `vault.path` after loading the config.
- `--verbose` sets `output.verbose` to true.
- `--json` forces `output.format` to `json`, overriding any configured format.
- Command-specific `--output` options override `output.format` unless `--json` is set.

## Legacy Config Migration

The loader still accepts these top-level legacy keys and maps them into `vault.*`:

- `vault_path` -> `vault.path`
- `todos_path` -> `vault.todosFolder`
- `projects_path` -> `vault.projectsFolder`
- `daily_notes_path` -> `vault.dailyFolder`
- `templates_path` -> `vault.templatesFolder`

If both legacy and modern keys are present, modern keys win.

## Example Config

```yaml
vault:
  path: /home/user/Documents/Main Vault
  todosFolder: 6 - Atomic Notes/Todos
  projectsFolder: 8 - Projects
  dailyFolder: 1 - Dailies
  templatesFolder: 5 - Templates

output:
  format: console
  color: true
  verbose: false

schemas:
  todo:
    match:
      folder: 6 - Atomic Notes/Todos
    fields:
      status:
        type: enum
        required: true
        values: [todo, doing, blocked, done]
      due:
        type: date
```

## Related

- `src/lib/config.ts`
- `docs/configuration.md`
