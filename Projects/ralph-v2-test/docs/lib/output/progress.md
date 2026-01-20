# output/progress

## Summary

- Provide a lightweight progress logger for long-running operations.
- Supports incrementing counts, completion, and failure reporting.

## API

- `createProgress(total: number, label: string): Progress`: Create a progress helper.
- `Progress.increment(): void`: Increment the count and log a progress line.
- `Progress.complete(): void`: Mark done and log a completion line.
- `Progress.fail(error: string): void`: Mark failed and log an error line.

## Behavior Notes

- Once `complete` or `fail` is called, further logs are suppressed.
- When `total > 0`, progress lines include `current/total`.
- When `total === 0`, progress lines include only the current count.

## Usage in Long Operations

Use `createProgress` in batch operations (directory walks, note processing) to
emit periodic progress without needing a full progress bar.

## When to Use

- Long-running loops where users need feedback but a full TUI is overkill.
- Batch processing of files or notes where counts are known or can be tracked.

## Examples

```ts
import { createProgress } from "./src/lib/output/progress";

const progress = createProgress(3, "Processing notes");

progress.increment();
progress.increment();
progress.complete();
```

## Related

- `src/lib/output/progress.ts`
