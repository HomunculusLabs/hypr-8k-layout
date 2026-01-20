# shopping-sync

## Summary

- Merge shopping checklist items from todo notes into a consolidated list and keep checkbox state in sync.

## API

- `syncShoppingList(paths: ShoppingSyncPaths): Promise<ShoppingSyncResult>`: Scan todos, update `Shopping List.md`, and propagate checkbox state.

## Data Structures

- `ShoppingSyncPaths`: `{ todosPath, shoppingListPath, dryRun? }`.
- `ShoppingSyncResult`: `{ items, categories, todoFilesUpdated, shoppingListUpdated, warnings, dryRun }`.

## Sync Algorithm

1. Find all markdown files under `todosPath`.
2. For each note, locate the `## Shopping` section and parse checkbox items.
3. Normalize item text (trim + lowercase) to deduplicate across notes.
4. Merge sources and checked state across occurrences.
5. Read `Shopping List.md` (if it exists) to carry forward checked items.
6. Render the list with categories and source links, then write it if changed.
7. Update todo notes so their checkbox states match the consolidated list.

## Parsing Rules

- The shopping section heading is case-insensitive: `## Shopping`.
- Categories are H3-H6 headings inside the shopping section.
- Checklist items must match `- [ ] Item` or `- [x] Item` (also `*` bullets).
- Lines starting with `- [` that do not match the checkbox pattern produce warnings.
- Code fences are ignored while parsing.
- Items without a category fall under `Uncategorized`.

## Conflict Handling

- If any occurrence of an item is checked, the consolidated list treats it as checked.
- Checked items in `Shopping List.md` are treated as checked even if todos are unchecked.
- After merging, todo note checkboxes are updated to match the consolidated state.

## Examples

```ts
import { syncShoppingList } from "./src/lib/shopping-sync";

const result = await syncShoppingList({
  todosPath: "/vault/6 - Atomic Notes/Todos",
  shoppingListPath: "/vault/Shopping List.md",
  dryRun: false,
});

console.log(result.items, result.categories, result.shoppingListUpdated);
```

## Related

- [[commands/shopping-sync]]
