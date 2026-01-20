import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { lintFrontmatter } from "./lint";
import { readNote } from "../lib/markdown/files";

async function setupVault(): Promise<string> {
	return await mkdtemp(path.join(tmpdir(), "vault-tools-lint-"));
}

test("detects missing required fields, invalid enums, and type mismatches", async () => {
	const vaultPath = await setupVault();
	const todosPath = path.join(vaultPath, "Todos");
	await mkdir(todosPath, { recursive: true });

	const notePath = path.join(todosPath, "Task.md");
	await writeFile(
		notePath,
		[
			"---",
			"status: urgent",
			"priority: 1",
			"created: not-a-date",
			"---",
			"# Task",
		].join("\n"),
	);

	const result = await lintFrontmatter({
		vaultPath,
		rootPath: vaultPath,
		reportPath: path.join(vaultPath, "Frontmatter Lint Report.md"),
		outputMode: "console",
		fix: false,
		dryRun: false,
		schemas: {
			todo: {
				match: { folder: "Todos" },
				fields: {
					status: {
						type: "enum",
						values: ["active", "completed"],
						required: true,
					},
					priority: {
						type: "enum",
						values: ["low", "medium", "high"],
						required: true,
					},
					created: { type: "date", required: true },
				},
			},
		},
	});

	expect(result.totalErrors).toBe(3);
	expect(result.issues.some((issue) => issue.field === "status")).toBe(true);
	expect(result.issues.some((issue) => issue.field === "priority")).toBe(true);
	expect(result.issues.some((issue) => issue.field === "created")).toBe(true);
});

test("auto-fix adds defaults for missing required fields", async () => {
	const vaultPath = await setupVault();
	const notePath = path.join(vaultPath, "Task.md");
	await writeFile(notePath, ["---", "title: Task", "---", "# Task"].join("\n"));

	const result = await lintFrontmatter({
		vaultPath,
		rootPath: vaultPath,
		reportPath: path.join(vaultPath, "Frontmatter Lint Report.md"),
		outputMode: "console",
		fix: true,
		dryRun: false,
		schemas: {
			todo: {
				match: { filename: "Task" },
				fields: {
					status: {
						type: "enum",
						values: ["active", "completed"],
						required: true,
						default: "active",
					},
				},
			},
		},
	});

	expect(result.fixedFiles).toBe(1);
	const updated = await readNote(notePath);
	expect(updated.frontmatter.status).toBe("active");
});

test("matches schemas by folder and frontmatter fields", async () => {
	const vaultPath = await setupVault();
	const projectsPath = path.join(vaultPath, "Projects");
	await mkdir(projectsPath, { recursive: true });

	const projectPath = path.join(projectsPath, "Project.md");
	await writeFile(
		projectPath,
		["---", "type: project", "---", "# Project"].join("\n"),
	);

	const result = await lintFrontmatter({
		vaultPath,
		rootPath: vaultPath,
		reportPath: path.join(vaultPath, "Frontmatter Lint Report.md"),
		outputMode: "console",
		fix: false,
		dryRun: false,
		schemas: {
			project: {
				match: { folder: "Projects", frontmatter: { type: "project" } },
				fields: {
					name: { type: "string", required: true },
				},
			},
		},
	});

	expect(result.filesMatched).toBe(1);
	expect(result.totalErrors).toBe(1);
	expect(result.issues[0]?.field).toBe("name");
});
