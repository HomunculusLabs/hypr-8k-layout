import { expect, test } from "bun:test";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createBunAdapter } from "../lib/adapters";
import { buildProjectHealth, runProjectHealth } from "./project-health";

async function setupVault(): Promise<{
	vaultPath: string;
	projectsPath: string;
	todosPath: string;
}> {
	const vaultPath = await mkdtemp(path.join(tmpdir(), "vault-tools-"));
	const projectsPath = path.join(vaultPath, "8 - Projects");
	const todosPath = path.join(vaultPath, "6 - Atomic Notes", "Todos");
	await mkdir(projectsPath, { recursive: true });
	await mkdir(todosPath, { recursive: true });
	return { vaultPath, projectsPath, todosPath };
}

function note(content: string): string {
	return content.trimStart();
}

test("builds project health summary with blockers and staleness", async () => {
	const { vaultPath, projectsPath, todosPath } = await setupVault();

	await writeFile(
		path.join(projectsPath, "Active Project.md"),
		note(`
---
status: active
last_touched: 2026-01-18
next_action: Ship the feature
priority: high
income: true
---

Links:
- [[Blocked Todo]]
- [[Open Todo]]
`),
	);

	await writeFile(
		path.join(projectsPath, "Stale Project.md"),
		note(`
---
status: active
last_touched: 2025-12-01
---
`),
	);

	await writeFile(
		path.join(projectsPath, "Archived Project.md"),
		note(`
---
status: archived
---
`),
	);

	const folderProjectPath = path.join(projectsPath, "Folder Project");
	await mkdir(folderProjectPath, { recursive: true });
	await writeFile(
		path.join(folderProjectPath, "IMPLEMENTATION_PLAN.md"),
		note(`
- [ ] Task one
- [x] Task done
`),
	);

	await writeFile(
		path.join(todosPath, "Blocked Todo.md"),
		note(`
---
status: blocked
---
`),
	);

	await writeFile(
		path.join(todosPath, "Open Todo.md"),
		note(`
---
status: active
---
`),
	);

	const adapter = createBunAdapter(vaultPath);
	const result = await buildProjectHealth({
		adapter,
		projectsPath,
		todosPath,
		now: new Date(2026, 0, 19),
	});

	expect(result.summary.total).toBe(4);
	expect(result.summary.active).toBe(3);
	expect(result.groups.paused.length).toBe(1);

	const activeProject = result.projects.find(
		(project) => project.name === "Active Project",
	);
	expect(activeProject?.blockers).toBe(1);
	expect(activeProject?.openTasks).toBe(2);
	expect(activeProject?.hasNextAction).toBe(true);

	const staleProject = result.projects.find(
		(project) => project.name === "Stale Project",
	);
	expect(staleProject?.healthCategory).toBe("critical");
	expect(staleProject?.issues).toContain("Stale");

	expect(result.recommendations.considerArchiving.length).toBeGreaterThan(0);
});

test("filters by status", async () => {
	const { vaultPath, projectsPath, todosPath } = await setupVault();
	await writeFile(
		path.join(projectsPath, "Archived Project.md"),
		note(`
---
status: archived
---
`),
	);
	await writeFile(
		path.join(projectsPath, "Active Project.md"),
		note(`
---
status: active
---
`),
	);

	const adapter = createBunAdapter(vaultPath);
	const result = await buildProjectHealth({
		adapter,
		projectsPath,
		todosPath,
		statusFilter: "archived",
		now: new Date(2026, 0, 19),
	});

	expect(result.projects.length).toBe(1);
	expect(result.projects[0]?.status).toBe("archived");
});

test("follows symlinks to markdown files", async () => {
	const { vaultPath, projectsPath, todosPath } = await setupVault();

	const realNotePath = path.join(vaultPath, "Real.md");
	await writeFile(
		realNotePath,
		note(`
---
status: active
---
`),
	);
	await symlink(realNotePath, path.join(projectsPath, "Linked.md"));

	const adapter = createBunAdapter(vaultPath);
	const result = await buildProjectHealth({
		adapter,
		projectsPath,
		todosPath,
		now: new Date(2026, 0, 19),
	});

	expect(result.summary.total).toBe(1);
});

test("handles circular symlinks without hanging", async () => {
	const { vaultPath, projectsPath, todosPath } = await setupVault();
	const loopDir = path.join(projectsPath, "Loop");
	await mkdir(loopDir, { recursive: true });
	await symlink(loopDir, path.join(loopDir, "loop"));

	const adapter = createBunAdapter(vaultPath);
	const result = await buildProjectHealth({
		adapter,
		projectsPath,
		todosPath,
		now: new Date(2026, 0, 19),
	});

	expect(result.summary.total).toBe(0);
});

test("skips broken symlinks gracefully", async () => {
	const { vaultPath, projectsPath, todosPath } = await setupVault();
	await symlink("/nonexistent/path.md", path.join(projectsPath, "Broken.md"));

	const adapter = createBunAdapter(vaultPath);
	const result = await buildProjectHealth({
		adapter,
		projectsPath,
		todosPath,
		now: new Date(2026, 0, 19),
	});

	expect(result.summary.total).toBe(0);
});

test("reports invalid vault path errors", async () => {
	process.exitCode = 0;
	await runProjectHealth({
		vaultPath: "/nonexistent/vault-path",
	});
	expect(process.exitCode).toBe(1);
	process.exitCode = 0;
});
