import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createBunAdapter } from "../lib/adapters";
import { checkBrokenLinks } from "./link-check";

async function setupVault(): Promise<string> {
	return await mkdtemp(path.join(tmpdir(), "vault-tools-link-check-"));
}

test("detects broken links and missing headings while skipping frontmatter and code fences", async () => {
	const vaultPath = await setupVault();
	const notePath = path.join(vaultPath, "Note A.md");
	const reportPath = path.join(vaultPath, "Broken Links.md");

	await writeFile(
		notePath,
		[
			"---",
			"title: Note A",
			"---",
			"# Note A",
			"",
			"Link to [[Missing Note]]",
			"Link to [[Existing Note#Missing Heading]]",
			"Link to [[existing note#Existing Heading]]",
			"Embed ![[Embed Note]]",
			"```",
			"Code [[Ignored]]",
			"```",
		].join("\n"),
	);
	await writeFile(
		path.join(vaultPath, "Existing Note.md"),
		["# Existing Heading", ""].join("\n"),
	);
	await writeFile(path.join(vaultPath, "Embed Note.md"), "# Embed");

	const adapter = createBunAdapter(vaultPath);
	const result = await checkBrokenLinks({
		adapter,
		vaultPath,
		reportPath,
		outputMode: "console",
		excludePatterns: [],
		suggest: false,
		createStubs: false,
	});

	expect(result.brokenLinks.length).toBe(2);
	const missingFile = result.brokenLinks.find(
		(link) => link.reason === "missing-file",
	);
	expect(missingFile?.line).toBe(6);

	const missingHeading = result.brokenLinks.find(
		(link) => link.reason === "missing-heading",
	);
	expect(missingHeading?.heading).toBe("Missing Heading");
});

test("respects excluded folders", async () => {
	const vaultPath = await setupVault();
	const archivePath = path.join(vaultPath, "_Archive");
	await mkdir(archivePath, { recursive: true });
	await writeFile(
		path.join(archivePath, "Old.md"),
		["# Old", "", "Link to [[Missing Archive]]"].join("\n"),
	);

	const adapter = createBunAdapter(vaultPath);
	const result = await checkBrokenLinks({
		adapter,
		vaultPath,
		reportPath: path.join(vaultPath, "Broken Links.md"),
		outputMode: "console",
		excludePatterns: ["_Archive"],
		suggest: false,
		createStubs: false,
	});

	expect(result.brokenLinks.length).toBe(0);
});

test("suggests close matches when enabled", async () => {
	const vaultPath = await setupVault();
	await writeFile(
		path.join(vaultPath, "Note.md"),
		["# Note", "", "Link to [[Exsting Task]]"].join("\n"),
	);
	await writeFile(path.join(vaultPath, "Existing Task.md"), "# Task");

	const adapter = createBunAdapter(vaultPath);
	const result = await checkBrokenLinks({
		adapter,
		vaultPath,
		reportPath: path.join(vaultPath, "Broken Links.md"),
		outputMode: "console",
		excludePatterns: [],
		suggest: true,
		createStubs: false,
	});

	expect(result.brokenLinks.length).toBe(1);
	expect(result.brokenLinks[0]?.suggestions).toContain("Existing Task");
});
