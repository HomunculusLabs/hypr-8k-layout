# link-check

## Summary

- Find broken wikilinks and missing heading references across a vault.

## API

- `checkBrokenLinks(paths: LinkCheckPaths): Promise<LinkCheckResult>`: Scan the vault and return broken link details.
- `buildSummary(result: LinkCheckResult): string`: Build the summary line used in console and report output.
- `buildReport(result: LinkCheckResult): string`: Render the markdown report content.
- `buildConsoleLines(result: LinkCheckResult): string[]`: Render console output lines.
- `LINK_CHECK_REPORT_FILENAME`: Default report filename (`Broken Links.md`).

## Data Structures

- `LinkCheckPaths`: `{ vaultPath, reportPath, outputMode, excludePatterns, suggest, createStubs }`.
- `LinkCheckResult`: `{ vaultPath, filesScanned, brokenLinks, reportPath, stubsCreated }`.
- `BrokenLink`: `{ sourcePath, line, raw, target, heading?, reason, suggestions, stubCreated }`.
- `reason`: `missing-file` or `missing-heading`.

## Link Detection

1. Collect all markdown files with `findMarkdownFiles`.
2. Filter out files whose relative path contains any `excludePatterns`.
3. For each file:
   - Skip frontmatter and fenced code blocks.
   - Parse wikilinks with `MARKDOWN.wikilinkWithEmbed`.
   - Ignore external targets (`http(s)` and `mailto:`).
4. Resolve each target to a vault file, then validate optional `#heading` anchors.

## Resolution Logic

- Targets with `/` are resolved against a normalized path index.
- Targets without `/` are matched by basename against a base index.
- If multiple matches exist, the lexicographically first relative path is chosen.
- Heading matches are case-insensitive and compare against normalized markdown headings.

## Broken Link Types

- **Missing file**: No matching note was found for the target.
- **Missing heading**: The note exists, but the specified heading was not found.

## Suggestions and Stubs

- Suggestions use Levenshtein distance with a dynamic threshold based on target length.
- A maximum of three close matches are returned when `suggest` is enabled.
- `createStubs` writes missing notes under the vault path and adds a top-level heading using the target name.

## Examples

```ts
import { checkBrokenLinks, buildReport } from "./src/lib/link-check";

const result = await checkBrokenLinks({
  vaultPath: "/vault",
  reportPath: "/vault/Broken Links.md",
  outputMode: "report",
  excludePatterns: ["_Archive"],
  suggest: true,
  createStubs: false,
});

const report = buildReport(result);
console.log(report);
```

## Related

- [[commands/link-check]]
- [[configuration]]
