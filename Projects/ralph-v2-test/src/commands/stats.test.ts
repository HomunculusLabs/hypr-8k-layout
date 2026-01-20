import { expect, test } from "bun:test";
import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildVaultStats } from "./stats";

async function setupVault(): Promise<string> {
	return mkdtemp(path.join(tmpdir(), "vault-tools-"));
}

function note(content: string): string {
	return content.trimStart();
}

async function setMtime(filePath: string, date: Date): Promise<void> {
	await utimes(filePath, date, date);
}

test("buildVaultStats calculates counts, links, tags, and frontmatter", async () => {
	const vaultPath = await setupVault();
	const notesPath = path.join(vaultPath, "Notes");
	const projectsPath = path.join(vaultPath, "Projects");
	await mkdir(notesPath, { recursive: true });
	await mkdir(projectsPath, { recursive: true });

	const alphaPath = path.join(notesPath, "Alpha.md");
	const betaPath = path.join(notesPath, "Beta.md");
	const projectPath = path.join(projectsPath, "Project.md");
	const missingPath = path.join(projectsPath, "Missing.md");
	const rootPath = path.join(vaultPath, "Root.md");

	await writeFile(
		alphaPath,
		note(`
---
type: idea
tags:
  - tag1
  - tag2
status: active
date: 2026-01-19
---
Alpha content with a link to [[Beta]] and #inline.
`),
	);
	await writeFile(
		betaPath,
		note(`
---
tags: tag2, tag3
---
Beta content with no outgoing links.
`),
	);
	await writeFile(
		projectPath,
		note(`
---
status: active
---
Project note linking to [[Alpha]].
`),
	);
	await writeFile(
		missingPath,
		note(`
---
---
Missing required status field.
`),
	);
	await writeFile(rootPath, "Root note.");

	await setMtime(alphaPath, new Date("2026-01-19T10:00:00Z"));
	await setMtime(betaPath, new Date("2026-01-18T10:00:00Z"));
	await setMtime(projectPath, new Date("2026-01-10T10:00:00Z"));
	await setMtime(missingPath, new Date("2026-01-05T10:00:00Z"));
	await setMtime(rootPath, new Date("2025-12-30T10:00:00Z"));

	const result = await buildVaultStats({
		vaultPath,
		rootPath: vaultPath,
		reportPath: path.join(vaultPath, "Vault Stats.md"),
		sections: ["counts", "links", "tags", "activity", "frontmatter"],
		schemas: {
			project: {
				match: { folder: "Projects" },
				fields: {
					status: {
						type: "enum",
						required: true,
						values: ["active", "paused"],
					},
				},
			},
		},
		now: new Date("2026-01-20T10:00:00Z"),
	});

	expect(result.totals.notes).toBe(5);
	expect(result.links.total).toBe(2);
	expect(result.links.orphans.length).toBe(3);
	expect(result.links.deadEnds.length).toBe(3);

	expect(result.tags.counts.tag1).toBe(1);
	expect(result.tags.counts.tag2).toBe(2);
	expect(result.tags.counts.tag3).toBe(1);
	expect(result.tags.counts.inline).toBe(1);
	expect(result.tags.untagged).toBe(3);

	const notesFolder = result.countsByFolder.find(
		(entry) => entry.folder === "Notes",
	);
	expect(notesFolder?.count).toBe(2);

	const ideaType = result.countsByType.find((entry) => entry.type === "idea");
	expect(ideaType?.count).toBe(1);

	expect(result.activity.recent.last7).toBe(2);
	expect(result.activity.recent.last30).toBe(5);

	expect(result.frontmatter.fieldUsage.status).toBe(2);
	expect(result.frontmatter.enumDistributions.project.active).toBe(1);
	expect(result.frontmatter.missingRequired.project.status).toBe(1);
});
