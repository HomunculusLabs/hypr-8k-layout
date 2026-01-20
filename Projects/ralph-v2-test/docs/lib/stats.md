# stats

## Summary

- Build vault statistics, compare snapshots, and render console/markdown reports for the `stats` command.

## API

- `normalizeSections(input?: string | string[]): StatsSection[]`: Validate and normalize section names.
- `buildVaultStats(paths: VaultStatsPaths): Promise<VaultStatsResult>`: Scan markdown files and compute statistics.
- `compareStats(current: VaultStatsResult, comparePath: string): Promise<VaultStatsComparison>`: Load a previous JSON snapshot and compute deltas.
- `renderMarkdownReport(result: VaultStatsResult, comparison: VaultStatsComparison | null, sections: StatsSection[]): string`: Format stats as a markdown report.
- `renderConsoleReport(result: VaultStatsResult, comparison: VaultStatsComparison | null, sections: StatsSection[]): string`: Format stats for console output.

## Data Structures

- `StatsSection`: `"counts" | "links" | "tags" | "activity" | "frontmatter"`.
- `VaultStatsPaths`: `{ vaultPath, rootPath, reportPath, sections, schemas, now? }`.
- `VaultStatsResult`: Summary totals plus per-folder/type counts, link analysis, tag analysis, activity metrics, frontmatter health, and warnings.
- `VaultStatsComparison`: `totalsDelta` for notes/words/characters/links/tags plus `comparedTo` timestamp.

## Behavior Notes

- `buildVaultStats` scans markdown files under `rootPath` and resolves note links using vault-relative paths or basenames.
- Link stats ignore external targets (`http(s)://`, `mailto:`) and track orphans (no backlinks) and dead ends (no outgoing links).
- Tag stats include frontmatter `tags`/`tag` and inline `#tags`, normalized to lowercase; tags inside code fences are ignored.
- Activity stats use file modified time (`mtime`) to compute recent counts and weekday distribution.
- Frontmatter analysis runs only when `sections` includes `frontmatter` and `schemas` are provided.
- Parsing failures are collected in `warnings` and skipped.

## Examples

```ts
import {
  buildVaultStats,
  normalizeSections,
  renderMarkdownReport,
} from "./src/lib/stats";

const sections = normalizeSections(["counts", "links", "tags"]);
const result = await buildVaultStats({
  vaultPath: "/path/to/vault",
  rootPath: "/path/to/vault",
  reportPath: "/path/to/vault/Vault Stats.md",
  sections,
  schemas: {},
});

const markdown = renderMarkdownReport(result, null, sections);
console.log(markdown);
```

```ts
import { buildVaultStats, compareStats } from "./src/lib/stats";

const currentStats = await buildVaultStats({
  vaultPath: "/path/to/vault",
  rootPath: "/path/to/vault",
  reportPath: "/path/to/vault/Vault Stats.md",
  sections: ["counts", "links"],
  schemas: {},
});

const comparison = await compareStats(
  currentStats,
  "/path/to/previous-stats.json",
);
console.log(comparison.totalsDelta);
```

## Related

- [[commands/stats]]
- [[configuration]]
