# output/console

## Summary

- Format output items for human-friendly console display with optional ANSI colors.
- Supports quiet and verbose modes for filtering and details.

## API

- `formatConsole(items: OutputItem[], options: OutputOptions): string`: Render items into a newline-delimited string.

## Output Format

- Each item becomes a line prefixed by its uppercase type (`INFO`, `SUCCESS`, `WARNING`, `ERROR`).
- When `options.verbose` is true:
  - `details` is appended on an indented line.
  - `file` and optional `line` are appended as `at <file>:<line>`.
- When `options.quiet` is true, only `error` items are emitted.
- When `options.color` is true, labels are colored with ANSI escape codes.

## When to Use

- Default format for human-readable CLI output.
- Best for interactive runs where color, context lines, and verbose details help.
- Use `quiet` for cron jobs or scripts where only errors should surface.

## Color Handling

- `info` -> blue
- `success` -> green
- `warning` -> yellow
- `error` -> red

Disable color by passing `options.color = false`.

## Table Formatting

The console formatter is line-oriented and does not build tables. If a command
needs tabular output, it should format the message strings or details as
pre-aligned columns before passing them to `formatConsole`.

## Examples

```ts
import { formatConsole } from "./src/lib/output/console";

const output = formatConsole(
  [
    { type: "info", message: "Scanning vault" },
    {
      type: "warning",
      message: "Broken link",
      file: "Notes/Today.md",
      line: 12,
      details: "[[Missing Note]]",
    },
  ],
  { format: "console", color: false, verbose: true, quiet: false },
);

console.log(output);
```

## Related

- `src/lib/output/console.ts`
- `src/types/index.ts`
