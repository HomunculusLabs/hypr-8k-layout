import type { OutputItem } from "../../types";

export function formatJson(items: OutputItem[]): string {
	const summary = items.reduce(
		(acc, item) => {
			acc.total += 1;
			if (item.type === "error") acc.errors += 1;
			if (item.type === "warning") acc.warnings += 1;
			return acc;
		},
		{ total: 0, errors: 0, warnings: 0 },
	);

	const payload = {
		success: summary.errors === 0,
		items,
		summary,
	};

	return JSON.stringify(payload, null, 2);
}
