# output/markdown

## Summary

- Render output items as a markdown summary with a detail list.
- Optionally include a top-level title heading.

## API

- `formatMarkdown(items: OutputItem[], title?: string): string`: Build a markdown report.

## Output Format

- Optional title is emitted as a `# <title>` header.
- A `## Summary` section lists totals, errors, and warnings.
- A `## Details` section lists each item with nested file and detail bullets.
- If there are no items, `## Details` contains `No items.`.

## File Output Handling

`formatMarkdown` returns a string. Callers are responsible for writing it to disk
(e.g., `await Bun.write(path, output)`), or printing it to stdout.

## When to Use

- Generating a report to store in the vault or share in notes.
- Useful for weekly summaries, audits, and long-running command results.

## Examples

```ts
import { formatMarkdown } from "./src/lib/output/markdown";

const report = formatMarkdown(
  [
    { type: "error", message: "Missing tag", file: "Tasks/Item.md" },
    { type: "success", message: "Validated" },
  ],
  "Lint Results",
);

console.log(report);
```

## Related

- `src/lib/output/markdown.ts`
- `src/types/index.ts`
