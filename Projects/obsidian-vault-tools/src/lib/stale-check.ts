import type { VaultAdapter } from "./adapters";
import { parseNote } from "./markdown/frontmatter";

export interface StaleTodo {
	path: string;
	title: string;
	daysSinceModified: number;
	status: string;
}

export interface StaleCheckResult {
	scanned: number;
	staleCount: number;
	todos: StaleTodo[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function checkStaleTodos(
	adapter: VaultAdapter,
	todosFolder: string,
	staleDays = 14,
): Promise<StaleCheckResult> {
	const files = await adapter.getMarkdownFilesInFolder(todosFolder);
	const now = new Date();
	const stale: StaleTodo[] = [];

	for (const file of files) {
		const content = await adapter.readFile(file.path);
		const stats = await adapter.getFileStats(file.path);
		const note = parseNote(content);

		const status = note.frontmatter.status?.toString().toLowerCase() ?? "active";
		if (status === "completed" || status === "archived") continue;

		const daysSince = daysBetween(stats.mtime, now);
		if (daysSince >= staleDays) {
			stale.push({
				path: file.path,
				title: note.frontmatter.title?.toString() ?? file.name,
				daysSinceModified: daysSince,
				status,
			});
		}
	}

	stale.sort((a, b) => b.daysSinceModified - a.daysSinceModified);

	return {
		scanned: files.length,
		staleCount: stale.length,
		todos: stale,
	};
}

function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(earlier: Date, later: Date): number {
	const earlierStart = startOfDay(earlier).getTime();
	const laterStart = startOfDay(later).getTime();
	const diff = Math.floor((laterStart - earlierStart) / DAY_MS);
	return diff < 0 ? 0 : diff;
}
