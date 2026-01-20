import { $ } from "bun";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const VAULT = path.resolve("tests/fixtures/test-vault");
const CONFIG = path.join(VAULT, "vault-tools.config.yaml");

async function runCli(args: string[]) {
	return await $`bun run src/cli.ts ${args}`;
}

let tempDir = "";

beforeAll(async () => {
	tempDir = await mkdtemp(path.join(os.tmpdir(), "vault-tools-int-"));
});

afterAll(async () => {
	if (!tempDir) return;
	await rm(tempDir, { recursive: true, force: true });
});

describe("Integration Tests", () => {
	describe("stats command", () => {
		it("produces valid JSON output", async () => {
			const result = await runCli(["--config", CONFIG, "--json", "stats"]);
			const parsed = await result.json();
			expect(parsed.totals.notes).toBeGreaterThan(0);
			expect(parsed.links.total).toBeGreaterThan(0);
			expect(parsed.links.orphans.length).toBeGreaterThan(0);
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
			expect(parsed.projects.length).toBeGreaterThan(0);
			expect(parsed.summary.total).toBeGreaterThan(0);
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
			expect(parsed.filesMatched).toBeGreaterThan(0);
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
			const parsed = await result.json();
			expect(parsed.success).toBe(true);
			expect(parsed.items.length).toBeGreaterThan(0);
		});
	});

	describe("stale-check command", () => {
		it("finds stale todos", async () => {
			const result = await runCli([
				"--config",
				CONFIG,
				"stale-check",
				"--output",
				"console",
			]);
			const text = await result.text();
			expect(text).toContain("Active todos");
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
			const parsed = await result.json();
			expect(parsed.success).toBe(true);
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
			const parsed = await result.json();
			expect(parsed.success).toBe(true);
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
			expect(parsed.tasks.length).toBeGreaterThan(0);
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
			const parsed = await result.json();
			expect(parsed.success).toBe(true);
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
