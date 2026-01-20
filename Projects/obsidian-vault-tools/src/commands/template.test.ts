import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createBunAdapter } from "../lib/adapters";
import { createFromTemplate, listTemplates } from "./template";

async function setupVault(): Promise<{
	vaultPath: string;
	templatesPath: string;
}> {
	const vaultPath = await mkdtemp(path.join(tmpdir(), "vault-tools-"));
	const templatesPath = path.join(vaultPath, "5 - Templates");
	await mkdir(templatesPath, { recursive: true });
	return { vaultPath, templatesPath };
}

test("lists templates including nested folders", async () => {
	const { templatesPath, vaultPath } = await setupVault();

	await writeFile(
		path.join(templatesPath, "todo.md"),
		[
			"---",
			"template_name: Todo",
			'default_output: "6 - Atomic Notes/Todos/"',
			"---",
			"",
			"# {{title}}",
		].join("\n"),
	);

	await mkdir(path.join(templatesPath, "projects"), { recursive: true });
	await writeFile(
		path.join(templatesPath, "projects", "roadmap.md"),
		["# Roadmap"].join("\n"),
	);

	const adapter = createBunAdapter(vaultPath);
	const result = await listTemplates(adapter, templatesPath);
	const keys = result.templates.map((template) => template.key);

	expect(keys).toContain("todo");
	expect(keys).toContain("projects/roadmap");
	const todo = result.templates.find((template) => template.key === "todo");
	expect(todo?.defaultOutput).toBe("6 - Atomic Notes/Todos/");
});

test("creates a note with substitutions and metadata defaults", async () => {
	const { templatesPath, vaultPath } = await setupVault();
	const templatePath = path.join(templatesPath, "todo.md");

	await writeFile(
		templatePath,
		[
			"---",
			"template_name: Todo",
			'default_output: "6 - Atomic Notes/Todos/"',
			"variables:",
			"  - name: priority",
			"    type: enum",
			"    values: [low, high]",
			"    default: low",
			"  - name: project",
			"    type: string",
			"    required: true",
			"status: active",
			'created: "{{date:YYYY-MM-DD}}"',
			"---",
			"",
			"# {{title}}",
			"",
			"Priority: {{priority}}",
			"Project: {{input:project}}",
			"",
		].join("\n"),
	);

	const adapter = createBunAdapter(vaultPath);
	const result = await createFromTemplate({
		adapter,
		vaultPath,
		templatesPath,
		templateKey: "todo",
		title: "Implement Sync",
		vars: { priority: "high", project: "Alpha" },
		now: new Date(2026, 0, 19),
	});

	expect(result.outputPath).toBe(
		path.join(vaultPath, "6 - Atomic Notes", "Todos", "Implement Sync.md"),
	);

	const output = await readFile(result.outputPath, "utf8");
	expect(output).toContain("status: active");
	expect(output).toContain('created: "2026-01-19"');
	expect(output).toContain("# Implement Sync");
	expect(output).toContain("Priority: high");
	expect(output).toContain("Project: Alpha");
	expect(output).not.toContain("template_name");
	expect(output).not.toContain("default_output");
	expect(output).not.toContain("variables:");
});

test("errors when output file already exists", async () => {
	const { templatesPath, vaultPath } = await setupVault();
	await writeFile(path.join(templatesPath, "note.md"), "# {{title}}");

	const existingPath = path.join(vaultPath, "Existing.md");
	await writeFile(existingPath, "Already here");

	await expect(
		createFromTemplate({
			adapter: createBunAdapter(vaultPath),
			vaultPath,
			templatesPath,
			templateKey: "note",
			title: "Existing",
			vars: {},
			outputPath: existingPath,
		}),
	).rejects.toThrow("Output file already exists");
});
