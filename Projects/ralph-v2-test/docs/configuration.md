# Configuration

Vault Tools loads configuration from one of these locations (first match wins):

1. `vault-tools.config.yaml` in the current working directory
2. `vault-tools.config.yaml` inside the vault specified by `VAULT_PATH`
3. `~/.config/vault-tools/config.yaml`

You can also pass `--config <path>` or `--vault <path>` on the CLI to override.

## Example

```yaml
vault:
  path: /home/user/Documents/Vault
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

## Options

### vault

- `vault.path` (string): Vault root path. Defaults to `.`.
- `vault.todosFolder` (string): Todos folder path, relative to the config file.
- `vault.projectsFolder` (string): Projects folder path, relative to the config file.
- `vault.dailyFolder` (string): Daily notes folder path, relative to the config file.
- `vault.templatesFolder` (string): Templates folder path, relative to the config file.

### output

- `output.format` (string): `console`, `json`, or `markdown`.
- `output.color` (boolean): Enable ANSI color output.
- `output.verbose` (boolean): Enable verbose logs.

### schemas

Frontmatter schema definitions used by the `lint` command.

- `schemas.<name>.match.folder` (string, optional): Folder to match.
- `schemas.<name>.match.filename` (string, optional): Filename to match.
- `schemas.<name>.match.frontmatter` (object, optional): Required frontmatter key/value pairs.
- `schemas.<name>.fields.<field>.type` (string): `string`, `date`, `enum`, or `array`.
- `schemas.<name>.fields.<field>.required` (boolean, optional): Whether the field is required.
- `schemas.<name>.fields.<field>.values` (string[], optional): Allowed values for `enum` fields.
- `schemas.<name>.fields.<field>.default` (any, optional): Default value used by fixers.

## Legacy Keys

These legacy top-level keys are still accepted and mapped into `vault.*`:

- `vault_path`
- `todos_path`
- `projects_path`
- `daily_notes_path`
- `templates_path`
