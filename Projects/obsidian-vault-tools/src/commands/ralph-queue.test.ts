import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createBunAdapter } from "../lib/adapters";
import { buildRalphQueue } from "./ralph-queue";

async function setupVault(): Promise<{
	vaultPath: string;
	todosPath: string;
	projectsPath: string;
	repoPath: string;
}> {
	const vaultPath = await mkdtemp(path.join(tmpdir(), "vault-tools-"));
	const todosPath = path.join(vaultPath, "6 - Atomic Notes", "Todos");
	const projectsPath = path.join(vaultPath, "8 - Projects");
	const repoPath = path.join(vaultPath, "Repos", "runiverse");
	await mkdir(todosPath, { recursive: true });
	await mkdir(projectsPath, { recursive: true });
	await mkdir(repoPath, { recursive: true });
	await writeFile(path.join(repoPath, "AGENTS.md"), "# Agents\n");
	await mkdir(path.join(repoPath, "specs"), { recursive: true });
	await writeFile(
		path.join(repoPath, "IMPLEMENTATION_PLAN.md"),
		["- [ ] Core queue builder [001-core.md]"].join("\n"),
	);
	await writeFile(path.join(repoPath, "specs", "001-core.md"), "# Core\n");
	return { vaultPath, todosPath, projectsPath, repoPath };
}

test("builds queue from active high/medium todos with project and spec info", async () => {
	const { vaultPath, todosPath, projectsPath, repoPath } = await setupVault();
	await writeFile(
		path.join(projectsPath, "Runiverse.md"),
		[
			"---",
			`repo_path: ${repoPath}`,
			"income_potential: true",
			"---",
			"# Runiverse",
		].join("\n"),
	);
	await writeFile(
		path.join(todosPath, "Queue Work.md"),
		[
			"---",
			"status: active",
			"priority: high",
			"due: 2026-01-19",
			"---",
			"# Queue Work",
			"",
			"## Project",
			"[[Runiverse]]",
			"",
			"## Tasks",
			"- [ ] Build queue command",
		].join("\n"),
	);

	const adapter = createBunAdapter(vaultPath);
	const result = await buildRalphQueue({
		adapter,
		vaultPath,
		todosPath,
		projectsPath,
		maxTasks: 5,
		includeLowPriority: false,
		now: new Date(2026, 0, 19),
	});

	expect(result.tasks.length).toBe(1);
	expect(result.tasks[0].title).toBe("Queue Work");
	expect(result.tasks[0].project?.name).toBe("Runiverse");
	expect(result.tasks[0].specPath).toContain("001-core.md");
	expect(result.tasks[0].score).toBeGreaterThanOrEqual(4);
});

test("skips low priority unless included and respects filters and exclusions", async () => {
	const { vaultPath, todosPath, projectsPath, repoPath } = await setupVault();
	await writeFile(
		path.join(projectsPath, "Ralph.md"),
		["---", `repo_path: ${repoPath}`, "---", "# Ralph"].join("\n"),
	);
	await writeFile(
		path.join(todosPath, "Low.md"),
		[
			"---",
			"status: active",
			"priority: low",
			"---",
			"# Low",
			"",
			"## Project",
			"[[Ralph]]",
			"",
			"## Tasks",
			"- [ ] Optional task",
		].join("\n"),
	);
	await writeFile(
		path.join(todosPath, "Manual.md"),
		[
			"---",
			"status: active",
			"priority: high",
			"tags: [manual]",
			"---",
			"# Manual",
			"",
			"## Project",
			"[[Ralph]]",
			"",
			"## Tasks",
			"- [ ] Skip this",
		].join("\n"),
	);

	const adapter = createBunAdapter(vaultPath);
	const result = await buildRalphQueue({
		adapter,
		vaultPath,
		todosPath,
		projectsPath,
		maxTasks: 5,
		includeLowPriority: false,
		projectFilter: "Ralph",
	});

	expect(result.tasks.length).toBe(0);
	expect(result.skipped.length).toBeGreaterThan(0);

	const included = await buildRalphQueue({
		adapter,
		vaultPath,
		todosPath,
		projectsPath,
		maxTasks: 5,
		includeLowPriority: true,
		projectFilter: "ralph",
	});

	expect(included.tasks.length).toBe(1);
	expect(included.tasks[0].title).toBe("Low");
});
