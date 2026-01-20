import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createBunAdapter } from "../lib/adapters";
import { readNote } from "../lib/markdown/files";
import { checkStaleTodos } from "./stale-check";

async function setupVault(): Promise<{
	vaultPath: string;
	todosPath: string;
	reportPath: string;
}> {
	const vaultPath = await mkdtemp(path.join(tmpdir(), "vault-tools-"));
	const todosPath = path.join(vaultPath, "6 - Atomic Notes", "Todos");
	await mkdir(todosPath, { recursive: true });
	const reportPath = path.join(vaultPath, "Stale Todos Report.md");
	return { vaultPath, todosPath, reportPath };
}

function makeDate(value: string): Date {
	const [year, month, day] = value.split("-").map(Number);
	return new Date(year, month - 1, day);
}

function buildTodoContent(options: {
	status: string;
	priority: string;
	lastUpdated: string;
	blocker?: string;
}): string {
	const frontmatter = [
		"---",
		`status: ${options.status}`,
		`priority: ${options.priority}`,
		options.blocker ? `blocker: ${options.blocker}` : null,
		"---",
		"",
		`Last updated: ${options.lastUpdated}`,
		"",
	]
		.filter(Boolean)
		.join("\n");
	return frontmatter;
}

test("flags stale todos by priority and severity", async () => {
	const { todosPath, reportPath, vaultPath } = await setupVault();
	await writeFile(
		path.join(todosPath, "Old High.md"),
		buildTodoContent({
			status: "active",
			priority: "high",
			lastUpdated: "2026-01-10",
		}),
	);
	await writeFile(
		path.join(todosPath, "Old Medium.md"),
		buildTodoContent({
			status: "active",
			priority: "medium",
			lastUpdated: "2026-01-10",
		}),
	);

	const adapter = createBunAdapter(vaultPath);
	const result = await checkStaleTodos({
		adapter,
		vaultPath,
		todosPath,
		reportPath,
		outputMode: "report",
		thresholds: { high: 3, medium: 7, low: 14, blocked: 14 },
		excludePatterns: [],
		now: makeDate("2026-01-19"),
	});

	expect(result.staleTodos.length).toBe(2);
	const high = result.staleTodos.find((todo) => todo.title === "Old High");
	const medium = result.staleTodos.find((todo) => todo.title === "Old Medium");
	expect(high?.severity).toBe("critical");
	expect(medium?.severity).toBe("warning");

	const report = await readFile(reportPath, "utf8");
	expect(report).toContain("# Stale Todos Report");
	expect(report).toContain("## Critical (>2x threshold)");
	expect(report).toContain("## Warning (>1x threshold)");
});

test("respects exclusions and blocked thresholds", async () => {
	const { todosPath, reportPath, vaultPath } = await setupVault();
	await writeFile(
		path.join(todosPath, "If Time Task.md"),
		buildTodoContent({
			status: "active",
			priority: "low",
			lastUpdated: "2026-01-01",
		}),
	);
	await writeFile(
		path.join(todosPath, "Blocked Task.md"),
		buildTodoContent({
			status: "blocked",
			priority: "low",
			lastUpdated: "2025-12-20",
			blocker: "waiting on API",
		}),
	);

	const adapter = createBunAdapter(vaultPath);
	const result = await checkStaleTodos({
		adapter,
		vaultPath,
		todosPath,
		reportPath,
		outputMode: "report",
		thresholds: { high: 3, medium: 7, low: 14, blocked: 14 },
		excludePatterns: ["If Time"],
		now: makeDate("2026-01-19"),
	});

	expect(result.staleTodos.length).toBe(1);
	expect(result.staleTodos[0]?.title).toBe("Blocked Task");
	expect(result.staleTodos[0]?.blocker).toBe("waiting on API");
});

test("inline tagging adds stale tag", async () => {
	const { todosPath, reportPath, vaultPath } = await setupVault();
	const todoPath = path.join(todosPath, "Tag Me.md");
	await writeFile(
		todoPath,
		buildTodoContent({
			status: "active",
			priority: "high",
			lastUpdated: "2026-01-10",
		}),
	);

	const adapter = createBunAdapter(vaultPath);
	await checkStaleTodos({
		adapter,
		vaultPath,
		todosPath,
		reportPath,
		outputMode: "inline",
		thresholds: { high: 3, medium: 7, low: 14, blocked: 14 },
		excludePatterns: [],
		now: makeDate("2026-01-19"),
	});

	const updatedNote = await readNote(adapter, todoPath);
	const tags = updatedNote.frontmatter.tags as string[] | undefined;
	expect(tags).toContain("⚠️ STALE");
});
