import type { OutputItem } from "./types";

function summarize(items: OutputItem[]): {
	total: number;
	errors: number;
	warnings: number;
} {
	return items.reduce(
		(acc, item) => {
			acc.total += 1;
			if (item.type === "error") acc.errors += 1;
			if (item.type === "warning") acc.warnings += 1;
			return acc;
		},
		{ total: 0, errors: 0, warnings: 0 },
	);
}

function formatDetails(item: OutputItem): string {
	const parts = [`- [${item.type.toUpperCase()}] ${item.message}`];
	if (item.file) {
		const line = typeof item.line === "number" ? `:${item.line}` : "";
		parts.push(`  - File: ${item.file}${line}`);
	}
	if (item.details) {
		parts.push(`  - Details: ${item.details}`);
	}
	return parts.join("\n");
}

export function formatMarkdown(items: OutputItem[], title?: string): string {
	const summary = summarize(items);
	const lines: string[] = [];

	if (title) {
		lines.push(`# ${title}`, "");
	}

	lines.push("## Summary");
	lines.push(`- Total: ${summary.total}`);
	lines.push(`- Errors: ${summary.errors}`);
	lines.push(`- Warnings: ${summary.warnings}`, "");

	lines.push("## Details");
	if (items.length === 0) {
		lines.push("No items.");
		return lines.join("\n");
	}

	lines.push(items.map((item) => formatDetails(item)).join("\n"));
	return lines.join("\n");
}
