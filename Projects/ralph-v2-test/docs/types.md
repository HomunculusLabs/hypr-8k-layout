# types

## Summary

- Shared TypeScript types used across config loading, linting, stats, and output.
- Centralized in `src/types/index.ts` to keep command and library modules consistent.

## Types

### OutputFormat

**Purpose**
- Enumerates output formats supported by the CLI.

**Used by**
- `src/lib/constants.ts` (source of the union)
- `src/lib/config.ts`
- `src/commands/*.ts` (commands that accept `--output`)

**Example**
```ts
import type { OutputFormat } from "../types";

const format: OutputFormat = "markdown";
```

### FrontmatterFieldType

**Purpose**
- Describes the allowed field types in frontmatter schemas.

**Used by**
- `src/lib/config.ts` (schema normalization + validation)
- `src/lib/lint.ts` (frontmatter lint rules)

**Example**
```ts
import type { FrontmatterFieldType } from "../types";

const fieldType: FrontmatterFieldType = "date";
```

### FrontmatterSchemaField

**Purpose**
- Defines a single field in a frontmatter schema, including validation rules.

**Used by**
- `src/lib/config.ts` (schema parsing)
- `src/lib/lint.ts` (field validation)

**Example**
```ts
import type { FrontmatterSchemaField } from "../types";

const statusField: FrontmatterSchemaField = {
	type: "enum",
	required: true,
	values: ["todo", "doing", "done"],
};
```

### FrontmatterSchemaMatch

**Purpose**
- Describes how a schema matches notes (by folder, filename, or frontmatter).

**Used by**
- `src/lib/config.ts` (match normalization)
- `src/lib/lint.ts` (schema selection)

**Example**
```ts
import type { FrontmatterSchemaMatch } from "../types";

const match: FrontmatterSchemaMatch = {
	folder: "6 - Atomic Notes/Todos",
};
```

### FrontmatterSchema

**Purpose**
- Full schema definition: match criteria + field definitions.

**Used by**
- `src/lib/config.ts`
- `src/lib/lint.ts`
- `src/lib/stats.ts` (schema-based stats)

**Example**
```ts
import type { FrontmatterSchema } from "../types";

const todoSchema: FrontmatterSchema = {
	match: { folder: "6 - Atomic Notes/Todos" },
	fields: {
		status: { type: "enum", required: true, values: ["todo", "doing", "done"] },
		due: { type: "date" },
	},
};
```

### FrontmatterSchemas

**Purpose**
- Map of schema names to `FrontmatterSchema`.

**Used by**
- `src/lib/config.ts`
- `src/lib/lint.ts`
- `src/lib/stats.ts`

**Example**
```ts
import type { FrontmatterSchemas } from "../types";

const schemas: FrontmatterSchemas = {
	todo: { fields: { status: { type: "string" } } },
};
```

### VaultToolsConfig

**Purpose**
- Canonical configuration shape returned by the config loader.

**Used by**
- `src/lib/config.ts`
- Most commands via `loadConfig` results

**Example**
```ts
import type { VaultToolsConfig } from "../types";

function getVaultPath(config: VaultToolsConfig): string {
	return config.vault.path;
}
```

### CliOverrides

**Purpose**
- Subset of config fields that can be overridden via CLI flags.

**Used by**
- `src/lib/config.ts` (override application)
- `src/commands/*.ts` (CLI option typing)

**Example**
```ts
import type { CliOverrides } from "../types";

const overrides: CliOverrides = { verbose: true, output: "json" };
```

### OutputOptions

**Purpose**
- Runtime output settings (format, verbosity, quiet mode).

**Used by**
- `src/lib/command-runner.ts`
- `src/lib/output/index.ts` and formatter implementations
- `src/commands/*.ts` output helpers

**Example**
```ts
import type { OutputOptions } from "../types";

const options: OutputOptions = {
	format: "console",
	color: true,
	verbose: false,
	quiet: false,
};
```

### OutputItem

**Purpose**
- Structured output line for console/markdown/json formatters.

**Used by**
- `src/lib/output/*.ts`
- All commands that report results

**Example**
```ts
import type { OutputItem } from "../types";

const item: OutputItem = {
	type: "warning",
	message: "Missing frontmatter key",
	file: "6 - Atomic Notes/Todos/Example.md",
	line: 12,
};
```

## Relationships

- `FrontmatterSchemas` is a map of `FrontmatterSchema`, which contain `FrontmatterSchemaMatch`
  and `FrontmatterSchemaField` definitions.
- `VaultToolsConfig.schemas` is a `FrontmatterSchemas` map used by lint and stats.
- `OutputOptions.format` is an `OutputFormat` used to select output formatters.
- `CliOverrides` feeds into `VaultToolsConfig` during config loading.

## Related

- `src/types/index.ts`
- `docs/lib/config.md`
- `docs/lib/output/index.md`
