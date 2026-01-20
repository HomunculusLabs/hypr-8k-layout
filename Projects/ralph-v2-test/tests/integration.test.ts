import { $ } from "bun";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const VAULT = path.resolve("tests/fixtures/test-vault");
const CONFIG = path.join(VAULT, "vault-tools.config.yaml");
const REPORT_FILES = [
	"Vault Stats.md",
	"Broken Links.md",
	"Stale Todos Report.md",
];

async function runCli(args: string[]) {
	return await $`bun run src/cli.ts ${args}`;
}

type OutputItem = { type: string; message: string; details?: string };
type OutputPayload = {
	success: boolean;
	items: OutputItem[];
	summary: { total: number; errors: number; warnings: number };
};

function findOutputItem(items: OutputItem[], matcher: (item: OutputItem) => boolean) {
	const item = items.find(matcher);
	expect(item).toBeTruthy();
	return item as OutputItem;
}

function extractCount(details: string | undefined, label: string): number {
	const match = new RegExp(`${label}:\\s*(\\d+)`).exec(details ?? "");
	expect(match).toBeTruthy();
	return Number(match?.[1]);
}

let tempDir = "";

beforeAll(async () => {
	await cleanupReports();
	tempDir = await mkdtemp(path.join(os.tmpdir(), "vault-tools-int-"));
});

afterAll(async () => {
	if (!tempDir) return;
	await cleanupReports();
	await rm(tempDir, { recursive: true, force: true });
});

async function cleanupReports() {
	await Promise.all(
		REPORT_FILES.map((file) =>
			rm(path.join(VAULT, file), { force: true }),
		),
	);
}
describe("Integration Tests", () => {
	describe("stats command", () => {
		it("produces valid JSON output", async () => {
			const result = await runCli(["--config", CONFIG, "--json", "stats"]);
			const parsed = await result.json();
			expect(parsed.totals.notes).toBe(15);
			expect(parsed.links.total).toBeGreaterThan(0);
			expect(parsed.links.orphans).toContain("Orphan Note");
			const dailyCounts = parsed.countsByFolder.find(
				(item: { folder: string; count: number }) => item.folder === "Daily",
			);
			expect(dailyCounts?.count).toBe(3);
		});

		it("produces console output without error", async () => {
			const result = await runCli(["--config", CONFIG, "stats"]);
			const text = await result.text();
			expect(text).toContain("Vault Statistics");
		});

		it("produces markdown output", async () => {
			const result = await runCli([
				"--config",
				CONFIG,
				"stats",
				"--output",
				"markdown",
			]);
			const text = await result.text();
			expect(text).toContain("## Summary");
		});
	});

	describe("project-health command", () => {
		it("scores projects correctly", async () => {
			const result = await runCli([
				"--config",
				CONFIG,
				"project-health",
				"--output",
				"json",
			]);
			const parsed = await result.json();
			expect(parsed.summary.total).toBe(3);
			expect(parsed.summary.active).toBe(2);
			expect(parsed.summary.healthy).toBe(1);
			expect(parsed.summary.critical).toBe(1);
			const names = parsed.projects.map((project: { name: string }) => project.name);
			expect(names).toContain("Active Project");
			expect(names).toContain("Stale Project");
			expect(names).toContain("Dead Project");
		});
	});

	describe("lint command", () => {
		it("validates frontmatter", async () => {
			const result = await runCli([
				"--config",
				CONFIG,
				"lint",
				"--output",
				"json",
			]);
			const parsed = await result.json();
			expect(parsed.totalErrors).toBe(0);
			expect(parsed.filesMatched).toBe(3);
			expect(parsed.totalWarnings).toBe(1);
			expect(parsed.issues.length).toBe(1);
			expect(parsed.issues[0]?.field).toBe("blocker");
			expect(parsed.issues[0]?.severity).toBe("warning");
		});
	});

	describe("link-check command", () => {
		it("finds broken links", async () => {
			const result = await runCli([
				"--config",
				CONFIG,
				"--json",
				"link-check",
				"--output",
				"report",
			]);
			const parsed = (await result.json()) as OutputPayload;
			expect(parsed.success).toBe(true);
			const summaryItem = findOutputItem(
				parsed.items,
				(item) => item.message === "Broken links report generated",
			);
			expect(extractCount(summaryItem.details, "broken links")).toBeGreaterThan(0);
			expect(
				extractCount(summaryItem.details, "files with broken links"),
			).toBeGreaterThan(0);
			const reportItem = findOutputItem(parsed.items, (item) =>
				item.message.startsWith("Report path:"),
			);
			const reportPath = reportItem.message.replace("Report path: ", "");
			await access(reportPath);
			const report = await readFile(reportPath, "utf8");
			expect(report).toContain("Missing Note");
		});
	});

	describe("stale-check command", () => {
		it("finds stale todos", async () => {
			const result = await runCli([
				"--config",
				CONFIG,
				"--json",
				"stale-check",
				"--output",
				"report",
			]);
			const parsed = (await result.json()) as OutputPayload;
			expect(parsed.success).toBe(true);
			const summaryItem = findOutputItem(
				parsed.items,
				(item) => item.message === "Stale todo report generated",
			);
			expect(extractCount(summaryItem.details, "Active todos")).toBe(2);
			expect(extractCount(summaryItem.details, "Stale")).toBe(2);
			expect(extractCount(summaryItem.details, "Blocked stale")).toBe(1);
			const reportItem = findOutputItem(parsed.items, (item) =>
				item.message.startsWith("Report path:"),
			);
			const reportPath = reportItem.message.replace("Report path: ", "");
			await access(reportPath);
			const report = await readFile(reportPath, "utf8");
			expect(report).toContain("[[Stale Project Todo]]");
			expect(report).toContain("[[Blocked Todo]]");
		});
	});

	describe("shopping-sync command", () => {
		it("syncs shopping list in dry run", async () => {
			const result = await runCli([
				"--config",
				CONFIG,
				"--json",
				"shopping-sync",
				"--dry-run",
			]);
			const parsed = (await result.json()) as OutputPayload;
			expect(parsed.success).toBe(true);
			const summaryItem = findOutputItem(
				parsed.items,
				(item) => item.message === "Shopping list dry run complete",
			);
			expect(summaryItem.details).toContain("Items: 3");
			expect(summaryItem.details).toContain("Categories: 2");
			expect(summaryItem.details).toContain("Todo updates: 0");
		});
	});

	describe("daily-populate command", () => {
		it("populates daily note in dry run", async () => {
			const result = await runCli([
				"--config",
				CONFIG,
				"--json",
				"daily-populate",
				"--date",
				"2024-01-17",
				"--dry-run",
			]);
			const parsed = (await result.json()) as OutputPayload;
			expect(parsed.success).toBe(true);
			const summaryItem = findOutputItem(
				parsed.items,
				(item) => item.message === "Daily note dry run complete",
			);
			expect(extractCount(summaryItem.details, "Focus")).toBe(2);
			expect(extractCount(summaryItem.details, "Blocked")).toBe(1);
			expect(extractCount(summaryItem.details, "Rollover")).toBe(1);
			expect(extractCount(summaryItem.details, "Ralph")).toBe(0);
		});
	});

	describe("weekly-rollup command", () => {
		it("generates weekly rollup report", async () => {
			const outputDir = path.join(tempDir, "weekly");
			const result = await runCli([
				"--config",
				CONFIG,
				"--json",
				"weekly-rollup",
				"--start",
				"2024-01-15",
				"--end",
				"2024-01-17",
				"--output",
				outputDir,
			]);
			const parsed = await result.json();
			expect(parsed.reportPath).toBeTruthy();
			await access(parsed.reportPath);
		});
	});

	describe("ralph-queue command", () => {
		it("builds task queue", async () => {
			const result = await runCli([
				"--config",
				CONFIG,
				"ralph-queue",
				"--output",
				"json",
			]);
			const parsed = await result.json();
			expect(parsed.tasks.length).toBe(1);
			expect(parsed.tasks[0]?.title).toBe("Active Project Todo");
		});
	});

	describe("template command", () => {
		it("lists templates", async () => {
			const result = await runCli([
				"--config",
				CONFIG,
				"--json",
				"template",
				"list",
			]);
			const parsed = await result.json();
			const keys = parsed.templates.map((template: { key: string }) =>
				template.key,
			);
			expect(keys).toContain("basic-note");
		});

		it("creates templates in dry run", async () => {
			const outputPath = path.join(tempDir, "integration-note.md");
			const result = await runCli([
				"--config",
				CONFIG,
				"--json",
				"template",
				"create",
				"basic-note",
				"Integration Note",
				"--dry-run",
				"--output",
				outputPath,
			]);
			const parsed = (await result.json()) as OutputPayload;
			expect(parsed.success).toBe(true);
			const summaryItem = findOutputItem(
				parsed.items,
				(item) => item.message === "Template dry run complete",
			);
			expect(summaryItem.details).toBe(outputPath);
		});
	});

	describe("command chaining", () => {
		it("runs stats and project-health against the same vault", async () => {
			const stats = await (
				await runCli(["--config", CONFIG, "--json", "stats"])
			).json();
			const health = await (
				await runCli([
					"--config",
					CONFIG,
					"project-health",
					"--output",
					"json",
				])
			).json();
			expect(health.summary.total).toBeGreaterThan(0);
			expect(stats.totals.notes).toBeGreaterThanOrEqual(
				health.summary.total,
			);
		});
	});
});
