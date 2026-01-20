import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildWeeklyRollup } from "./weekly-rollup";

async function setupVault(): Promise<{
	vaultPath: string;
	dailyPath: string;
	todosPath: string;
	weeklyPath: string;
}> {
	const vaultPath = await mkdtemp(path.join(tmpdir(), "vault-tools-"));
	const dailyPath = path.join(vaultPath, "1 - Rough Notes", "Daily Notes");
	const todosPath = path.join(vaultPath, "6 - Atomic Notes", "Todos");
	const weeklyPath = path.join(vaultPath, "1 - Rough Notes", "Weekly");
	await mkdir(dailyPath, { recursive: true });
	await mkdir(todosPath, { recursive: true });
	return { vaultPath, dailyPath, todosPath, weeklyPath };
}

function buildDailyContent(options: {
	date: string;
	done: string[];
	extra: string[];
}): string {
	return [
		`# ${options.date}`,
		"",
		"**Done:**",
		...options.done.map((line) => `- ${line}`),
		"",
		"## Tasks",
		...options.extra,
		"",
	].join("\n");
}

test("builds weekly rollup from daily notes and completed todos", async () => {
	const { vaultPath, dailyPath, todosPath, weeklyPath } = await setupVault();

	await writeFile(
		path.join(dailyPath, "2026-01-12.md"),
		buildDailyContent({
			date: "2026-01-12",
			done: ["shipped feature", "[x] fixed bug"],
			extra: ["- [x] extra cleanup"],
		}),
	);

	await writeFile(
		path.join(dailyPath, "2026-01-13.md"),
		buildDailyContent({
			date: "2026-01-13",
			done: ["[x] Finish docs"],
			extra: ["- [x] reviewed"],
		}),
	);

	await writeFile(
		path.join(todosPath, "Finish docs.md"),
		[
			"---",
			"title: Finish docs",
			"status: completed",
			"completed: 2026-01-13",
			"category: work",
			"---",
			"",
			"## Project",
			"[[8 - Projects/Alpha]]",
			"",
		].join("\n"),
	);

	const result = await buildWeeklyRollup({
		vaultPath,
		todosPath,
		dailyPath,
		outputPath: weeklyPath,
		startDate: "2026-01-12",
		endDate: "2026-01-18",
		now: new Date(2026, 0, 19),
	});

	expect(result.label).toBe("2026-W03");
	expect(result.completedCount).toBe(5);
	expect(result.activeDays).toBe(2);
	expect(result.dailyStreak).toBe(2);
	expect(result.projectsTouched).toBe(1);
	expect(result.lastWeekCompletedCount).toBe(0);
	expect(result.missingDays.join(" ")).toContain("(2026-01-14)");

	const report = await readFile(result.reportPath, "utf8");
	expect(report).toContain("# Weekly Rollup - 2026-W03");
	expect(report).toContain("## By Project");
	expect(report).toContain("### [[8 - Projects/Alpha]]");
	expect(report).toContain("- [x] [[Finish docs]]");
	expect(report).toContain("## By Category");
	expect(report).toContain("### Work");
});
