# output/index

## Summary

- Dispatch output items to the configured formatter and print to stdout.
- Provide a safe helper to report errors in console format.

## API

- `output(items: OutputItem[], options: OutputOptions): void`: Format items and print to stdout.
- `reportError(error: unknown, options: OutputOptions): void`: Emit an error item in console format.

## Behavior

- `output` selects the formatter based on `options.format` and writes to stdout.
- `reportError` forces console formatting so errors are always human-readable.

## When to Use

- Use `output` in command implementations after building `OutputItem[]`.
- Use `reportError` in top-level command handlers to normalize unexpected errors.

## Examples

```ts
import { output, reportError } from "./src/lib/output";

try {
  output([{ type: "success", message: "Done" }], {
    format: "console",
    color: true,
    quiet: false,
    verbose: false,
  });
} catch (error) {
  reportError(error, {
    format: "console",
    color: false,
    quiet: false,
    verbose: false,
  });
}
```

## Related

- `src/lib/output/index.ts`
- `src/types/index.ts`
