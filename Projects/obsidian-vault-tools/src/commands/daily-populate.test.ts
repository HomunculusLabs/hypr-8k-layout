import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createBunAdapter } from "../lib/adapters";
import { populateDailyNote } from "./daily-populate";

async function setupVault(): Promise<{
	vaultPath: string;
	todosPath: string;
	dailyPath: string;
	projectsPath: string;
	templatePath: string;
}> {
	const vaultPath = await mkdtemp(path.join(tmpdir(), "vault-tools-"));
	const todosPath = path.join(vaultPath, "6 - Atomic Notes", "Todos");
	const dailyPath = path.join(vaultPath, "1 - Dailies");
	const projectsPath = path.join(vaultPath, "8 - Projects");
	const templatePath = path.join(vaultPath, "5 - Templates", "daily-notes.md");
	await mkdir(todosPath, { recursive: true });
	await mkdir(dailyPath, { recursive: true });
	await mkdir(projectsPath, { recursive: true });
	return { vaultPath, todosPath, dailyPath, projectsPath, templatePath };
}

test("injects due and overdue todos into Today's Focus", async () => {
	const { todosPath, dailyPath, projectsPath, templatePath, vaultPath } =
		await setupVault();
	const date = "2026-01-20";

	await writeFile(
		path.join(todosPath, "Fix Pump.md"),
		["---", "due: 2026-01-20", "---", "", "# Fix Pump", ""].join("\n"),
	);
	await writeFile(
		path.join(todosPath, "Repair.md"),
		["---", "due: 2026-01-18", "---", "", "# Repair", ""].join("\n"),
	);
	await writeFile(
		path.join(dailyPath, `${date}.md`),
		["# 2026-01-20", "", "## Today's Focus", ""].join("\n"),
	);

	const adapter = createBunAdapter(vaultPath);
	await populateDailyNote({
		adapter,
		vaultPath,
		todosPath,
		projectsPath,
		dailyPath,
		templatePath,
		date,
	});

	const content = await readFile(path.join(dailyPath, `${date}.md`), "utf8");
	expect(content).toContain("- [ ] [[Fix Pump]] (due: 2026-01-20)");
	expect(content).toContain("- [ ] [[Repair]] (due: 2026-01-18)");
});

test("rolls over incomplete tasks from yesterday", async () => {
	const { todosPath, dailyPath, projectsPath, templatePath, vaultPath } =
		await setupVault();
	const date = "2026-01-20";
	const previous = "2026-01-19";

	await writeFile(
		path.join(dailyPath, `${previous}.md`),
		[
			`# ${previous}`,
			"",
			"## Tasks",
			"- [ ] Review PR for eliza-editor",
			"- [x] Done item",
			"",
		].join("\n"),
	);
	await writeFile(
		path.join(dailyPath, `${date}.md`),
		["# 2026-01-20", "", "## Tasks", "- [ ] Existing task", ""].join("\n"),
	);

	const adapter = createBunAdapter(vaultPath);
	await populateDailyNote({
		adapter,
		vaultPath,
		todosPath,
		projectsPath,
		dailyPath,
		templatePath,
		date,
	});

	const content = await readFile(path.join(dailyPath, `${date}.md`), "utf8");
	expect(content).toContain("- [ ] Existing task");
	expect(content).toContain("- [ ] Review PR for eliza-editor");
	expect(content).not.toContain("- [x] Done item");
});

test("includes blocked todos and ralph status", async () => {
	const { todosPath, dailyPath, projectsPath, templatePath, vaultPath } =
		await setupVault();
	const date = "2026-01-20";

	await writeFile(
		path.join(todosPath, "Kenan Shopify Help.md"),
		[
			"---",
			"status: blocked",
			"blocker: waiting to schedule",
			"---",
			"",
			"# Kenan Shopify Help",
			"",
		].join("\n"),
	);

	const projectFolder = path.join(projectsPath, "Homelab");
	await mkdir(projectFolder, { recursive: true });
	await writeFile(
		path.join(projectFolder, "IMPLEMENTATION_PLAN.md"),
		[
			"# Implementation Plan",
			"",
			"- [ ] Portainer migration (step 3/7) (ETA: 2026-01-31)",
			"",
		].join("\n"),
	);

	await writeFile(
		path.join(dailyPath, `${date}.md`),
		["# 2026-01-20", "", "## Ralph Status", "", "## Blocked", ""].join("\n"),
	);

	const adapter = createBunAdapter(vaultPath);
	await populateDailyNote({
		adapter,
		vaultPath,
		todosPath,
		projectsPath,
		dailyPath,
		templatePath,
		date,
	});

	const content = await readFile(path.join(dailyPath, `${date}.md`), "utf8");
	expect(content).toContain(
		"- `Homelab`: Portainer migration (step 3/7) (ETA: 2026-01-31)",
	);
	expect(content).toContain("- [[Kenan Shopify Help]] - waiting to schedule");
});
