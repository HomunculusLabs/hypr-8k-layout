# output/json

## Summary

- Format output items as a structured JSON payload.
- Include a summary block for total/errors/warnings.

## API

- `formatJson(items: OutputItem[]): string`: Serialize output items to pretty-printed JSON.

## JSON Structure

The JSON payload has this shape:

```json
{
  "success": true,
  "items": [],
  "summary": {
    "total": 0,
    "errors": 0,
    "warnings": 0
  }
}
```

- `success` is `true` when there are zero error items.
- `summary.total` counts all items.
- `summary.errors` counts items with `type: "error"`.
- `summary.warnings` counts items with `type: "warning"`.

The output is always pretty-printed with a two-space indent.

## Examples

```ts
import { formatJson } from "./src/lib/output/json";

const output = formatJson([
  { type: "success", message: "All good" },
  { type: "warning", message: "Minor issue" },
]);

console.log(output);
```

## Related

- `src/lib/output/json.ts`
- `src/types/index.ts`
