import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	type CliOverrides,
	type OutputFormat,
	loadConfig,
} from "../lib/config";
import { findMarkdownFiles } from "../lib/markdown/files";
import { type OutputItem, type OutputOptions, output } from "../lib/output";

export type LinkCheckOutputMode = "console" | "report";

export interface LinkCheckOptions {
	configPath?: string;
	vaultPath?: string;
	verbose?: boolean;
	json?: boolean;
	output?: OutputFormat;
	outputMode?: LinkCheckOutputMode;
	exclude?: string[];
	suggest?: boolean;
	createStubs?: boolean;
}

export interface LinkCheckPaths {
	vaultPath: string;
	reportPath: string;
	outputMode: LinkCheckOutputMode;
	excludePatterns: string[];
	suggest: boolean;
	createStubs: boolean;
}

export interface BrokenLink {
	sourcePath: string;
	line: number;
	raw: string;
	target: string;
	heading?: string;
	reason: "missing-file" | "missing-heading";
	suggestions: string[];
	stubCreated: boolean;
}

export interface LinkCheckResult {
	vaultPath: string;
	filesScanned: number;
	brokenLinks: BrokenLink[];
	reportPath: string;
	stubsCreated: number;
}

interface LinkOccurrence {
	raw: string;
	target: string;
	heading?: string;
	line: number;
}

interface FileIndexes {
	pathIndex: Map<string, string[]>;
	baseIndex: Map<string, string[]>;
	names: string[];
}

export async function runLinkCheck(options: LinkCheckOptions): Promise<void> {
	const config = await loadConfig(options.configPath, {
		vault: options.vaultPath,
		verbose: options.verbose,
		json: options.json,
		output: options.output,
	} satisfies CliOverrides);

	const outputOptions: OutputOptions = {
		format: config.output.format,
		color: config.output.color,
		verbose: config.output.verbose,
		quiet: false,
	};

	const outputMode = normalizeOutputMode(options.outputMode ?? "console");
	const reportPath = path.join(config.vault.path, "Broken Links.md");

	try {
		const result = await checkBrokenLinks({
			vaultPath: config.vault.path,
			reportPath,
			outputMode,
			excludePatterns: normalizeExcludePatterns(options.exclude),
			suggest: Boolean(options.suggest),
			createStubs: Boolean(options.createStubs),
		});

		if (outputMode === "console") {
			console.log(buildConsoleLines(result).join("\n"));
			return;
		}

		const report = buildReport(result);
		await writeFile(reportPath, report, "utf8");

		const items: OutputItem[] = [
			{
				type: result.brokenLinks.length > 0 ? "warning" : "success",
				message:
					result.brokenLinks.length > 0
						? "Broken links report generated"
						: "No broken links found",
				details: buildSummary(result),
			},
			{ type: "info", message: `Report path: ${result.reportPath}` },
		];

		if (result.stubsCreated > 0) {
			items.push({
				type: "info",
				message: `Stub notes created: ${result.stubsCreated}`,
			});
		}

		output(items, outputOptions);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		output([{ type: "error", message }], {
			...outputOptions,
			format: "console",
		});
		process.exitCode = 1;
	}
}

export async function checkBrokenLinks(
	paths: LinkCheckPaths,
): Promise<LinkCheckResult> {
	const markdownFiles = await findMarkdownFiles(paths.vaultPath);
	const filteredFiles = markdownFiles.filter(
		(file) =>
			!matchesExclude(
				path.relative(paths.vaultPath, file),
				paths.excludePatterns,
			),
	);
	const indexes = buildFileIndexes(markdownFiles, paths.vaultPath);
	const brokenLinks: BrokenLink[] = [];
	let stubsCreated = 0;

	const headingCache = new Map<string, Set<string>>();
	const createdStubs = new Set<string>();

	for (const filePath of filteredFiles) {
		const content = await readFile(filePath, "utf8");
		const occurrences = extractLinks(content);
		for (const occurrence of occurrences) {
			if (isExternalTarget(occurrence.target)) {
				continue;
			}
			const resolved = resolveTarget(
				occurrence.target,
				indexes,
				paths.vaultPath,
			);
			if (!resolved) {
				const suggestions = paths.suggest
					? findSuggestions(occurrence.target, indexes.names)
					: [];
				let stubCreated = false;
				if (paths.createStubs) {
					stubCreated = await createStub(
						paths.vaultPath,
						occurrence.target,
						createdStubs,
					);
					if (stubCreated) stubsCreated += 1;
				}

				brokenLinks.push({
					sourcePath: filePath,
					line: occurrence.line,
					raw: occurrence.raw,
					target: occurrence.target,
					heading: occurrence.heading,
					reason: "missing-file",
					suggestions,
					stubCreated,
				});
				continue;
			}

			if (occurrence.heading) {
				const headings = await getHeadings(resolved, headingCache);
				if (!headings.has(normalizeHeading(occurrence.heading))) {
					brokenLinks.push({
						sourcePath: filePath,
						line: occurrence.line,
						raw: occurrence.raw,
						target: occurrence.target,
						heading: occurrence.heading,
						reason: "missing-heading",
						suggestions: [],
						stubCreated: false,
					});
				}
			}
		}
	}

	return {
		vaultPath: paths.vaultPath,
		filesScanned: filteredFiles.length,
		brokenLinks,
		reportPath: paths.reportPath,
		stubsCreated,
	};
}

function normalizeOutputMode(value: string): LinkCheckOutputMode {
	return value === "report" ? "report" : "console";
}

function normalizeExcludePatterns(patterns?: string[]): string[] {
	return (patterns ?? []).map((pattern) => pattern.trim()).filter(Boolean);
}

function matchesExclude(filePath: string, patterns: string[]): boolean {
	if (patterns.length === 0) return false;
	const normalized = filePath.replaceAll("\\", "/").toLowerCase();
	return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

function buildFileIndexes(files: string[], vaultPath: string): FileIndexes {
	const pathIndex = new Map<string, string[]>();
	const baseIndex = new Map<string, string[]>();
	const names: string[] = [];

	for (const filePath of files) {
		const relative = path.relative(vaultPath, filePath).replaceAll("\\", "/");
		const key = normalizePathKey(relative);
		const base = path.basename(relative, ".md").toLowerCase();

		appendIndex(pathIndex, key, filePath);
		appendIndex(baseIndex, base, filePath);

		names.push(relative.replace(/\.md$/i, ""));
	}

	return { pathIndex, baseIndex, names };
}

function appendIndex(
	index: Map<string, string[]>,
	key: string,
	value: string,
): void {
	const existing = index.get(key);
	if (existing) {
		existing.push(value);
	} else {
		index.set(key, [value]);
	}
}

function extractLinks(content: string): LinkOccurrence[] {
	const lines = content.split("\n");
	const links: LinkOccurrence[] = [];
	const regex = /!?\[\[([^\]]+)\]\]/g;
	let inFence = false;
	let skippingFrontmatter = lines[0]?.trim() === "---";

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const trimmed = line.trim();

		if (skippingFrontmatter) {
			if (index > 0 && trimmed === "---") {
				skippingFrontmatter = false;
			}
			continue;
		}

		if (trimmed.startsWith("```")) {
			inFence = !inFence;
			continue;
		}

		if (inFence) {
			continue;
		}

		regex.lastIndex = 0;
		let match = regex.exec(line);
		while (match) {
			const raw = match[0];
			const inner = match[1];
			const parts = parseLinkParts(inner);
			if (parts.target.length > 0) {
				links.push({
					raw,
					target: parts.target,
					heading: parts.heading,
					line: index + 1,
				});
			}
			match = regex.exec(line);
		}
	}

	return links;
}

function parseLinkParts(raw: string): {
	target: string;
	heading?: string;
} {
	const [targetPart] = raw.split("|", 2);
	const trimmed = targetPart.trim();
	const hashIndex = trimmed.indexOf("#");
	if (hashIndex === -1) {
		return { target: trimmed };
	}
	return {
		target: trimmed.slice(0, hashIndex),
		heading: trimmed.slice(hashIndex + 1),
	};
}

function isExternalTarget(target: string): boolean {
	return /^https?:\/\//i.test(target) || /^mailto:/i.test(target);
}

function normalizePathKey(target: string): string {
	const cleaned = target.replaceAll("\\", "/").replace(/^\/+/, "");
	return cleaned.replace(/\.md$/i, "").toLowerCase();
}

function resolveTarget(
	target: string,
	indexes: FileIndexes,
	vaultPath: string,
): string | null {
	const normalized = normalizePathKey(target.trim());
	if (!normalized) return null;
	const hasPath = normalized.includes("/");
	if (hasPath) {
		const matches = indexes.pathIndex.get(normalized);
		return matches?.[0] ?? null;
	}

	const matches = indexes.baseIndex.get(normalized);
	if (!matches || matches.length === 0) {
		return null;
	}

	if (matches.length === 1) {
		return matches[0];
	}

	const relativeMatches = matches.map((match) =>
		path.relative(vaultPath, match),
	);
	relativeMatches.sort();
	const chosen = relativeMatches[0];
	return path.join(vaultPath, chosen);
}

async function getHeadings(
	filePath: string,
	cache: Map<string, Set<string>>,
): Promise<Set<string>> {
	const cached = cache.get(filePath);
	if (cached) return cached;
	const content = await readFile(filePath, "utf8");
	const headings = extractHeadings(content);
	cache.set(filePath, headings);
	return headings;
}

function extractHeadings(content: string): Set<string> {
	const headings = new Set<string>();
	const lines = content.split("\n");
	let inFence = false;
	let skippingFrontmatter = lines[0]?.trim() === "---";

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const trimmed = line.trim();

		if (skippingFrontmatter) {
			if (index > 0 && trimmed === "---") {
				skippingFrontmatter = false;
			}
			continue;
		}

		if (trimmed.startsWith("```")) {
			inFence = !inFence;
			continue;
		}

		if (inFence) {
			continue;
		}

		const match = /^(#{1,6})\s+(.+)$/.exec(line);
		if (match) {
			headings.add(normalizeHeading(match[2]));
		}
	}

	return headings;
}

function normalizeHeading(value: string): string {
	return value.trim().toLowerCase();
}

function findSuggestions(target: string, candidates: string[]): string[] {
	const normalizedTarget = normalizePathKey(target);
	if (!normalizedTarget) return [];
	const scores = candidates.map((candidate) => {
		const candidateKey = normalizePathKey(candidate);
		return {
			candidate,
			score: levenshtein(normalizedTarget, candidateKey),
		};
	});

	const threshold = Math.max(2, Math.ceil(normalizedTarget.length * 0.4));
	return scores
		.filter((entry) => entry.score <= threshold)
		.sort((a, b) => a.score - b.score)
		.slice(0, 3)
		.map((entry) => entry.candidate);
}

function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	const aLen = a.length;
	const bLen = b.length;
	if (aLen === 0) return bLen;
	if (bLen === 0) return aLen;

	const dp: number[] = new Array(bLen + 1).fill(0);
	for (let j = 0; j <= bLen; j += 1) {
		dp[j] = j;
	}

	for (let i = 1; i <= aLen; i += 1) {
		let prev = dp[0];
		dp[0] = i;
		for (let j = 1; j <= bLen; j += 1) {
			const temp = dp[j];
			if (a[i - 1] === b[j - 1]) {
				dp[j] = prev;
			} else {
				dp[j] = Math.min(prev + 1, dp[j] + 1, dp[j - 1] + 1);
			}
			prev = temp;
		}
	}

	return dp[bLen];
}

async function createStub(
	vaultPath: string,
	target: string,
	created: Set<string>,
): Promise<boolean> {
	const trimmed = target.trim();
	if (!trimmed) return false;
	const normalizedKey = normalizePathKey(trimmed);
	if (!normalizedKey) return false;
	if (created.has(normalizedKey)) return false;

	const cleaned = trimmed.replaceAll("\\", "/").replace(/^\/+/, "");
	const relative = cleaned.endsWith(".md") ? cleaned : `${cleaned}.md`;
	const filePath = path.join(vaultPath, relative);
	const dir = path.dirname(filePath);
	await mkdir(dir, { recursive: true });

	const title = path.basename(relative, ".md");
	await writeFile(filePath, `# ${title}\n`, { flag: "wx" }).catch(() => null);
	created.add(normalizedKey);
	return true;
}

function buildSummary(result: LinkCheckResult): string {
	const filesWithBroken = new Set(
		result.brokenLinks.map((link) => link.sourcePath),
	).size;
	return `Files scanned: ${result.filesScanned}, broken links: ${result.brokenLinks.length}, files with broken links: ${filesWithBroken}`;
}

function buildReport(result: LinkCheckResult): string {
	const lines: string[] = [];
	lines.push("# Broken Links Report", "");
	lines.push(`*Generated: ${formatDate(new Date())}*`, "", "## Summary");
	lines.push(`- Files scanned: ${result.filesScanned}`);
	lines.push(`- Broken links found: ${result.brokenLinks.length}`);
	lines.push(
		`- Files with broken links: ${countBrokenFiles(result.brokenLinks)}`,
	);
	if (result.stubsCreated > 0) {
		lines.push(`- Stub notes created: ${result.stubsCreated}`);
	}
	lines.push("", "## Broken Links", "");

	if (result.brokenLinks.length === 0) {
		lines.push("No broken links found.");
		return lines.join("\n");
	}

	const grouped = groupBySource(result.brokenLinks);
	for (const [source, links] of grouped) {
		const relative = path.relative(result.vaultPath, source);
		lines.push(`### [[${relative}]]`);
		for (const link of links) {
			lines.push(`- Line ${link.line}: \`${link.raw}\``);
			if (link.reason === "missing-heading" && link.heading) {
				lines.push(
					`  - File exists but heading \`#${link.heading}\` not found`,
				);
			} else if (link.suggestions.length > 0) {
				lines.push(
					`  - Suggestion: Did you mean ${formatSuggestions(link.suggestions)}?`,
				);
			} else if (link.stubCreated) {
				lines.push("  - Stub note created");
			} else {
				lines.push("  - No close matches found");
			}
		}
		lines.push("");
	}

	return lines.join("\n").trimEnd();
}

function buildConsoleLines(result: LinkCheckResult): string[] {
	const lines: string[] = [];
	lines.push("Broken Link Check");
	lines.push(buildSummary(result));
	if (result.brokenLinks.length === 0) {
		lines.push("No broken links found.");
		return lines;
	}

	const grouped = groupBySource(result.brokenLinks);
	for (const [source, links] of grouped) {
		const relative = path.relative(result.vaultPath, source);
		lines.push("");
		lines.push(relative);
		for (const link of links) {
			const detail =
				link.reason === "missing-heading" && link.heading
					? `missing heading #${link.heading}`
					: "missing file";
			lines.push(`  Line ${link.line}: ${link.raw} (${detail})`);
			if (link.suggestions.length > 0) {
				lines.push(`    Suggestion: ${formatSuggestions(link.suggestions)}`);
			}
			if (link.stubCreated) {
				lines.push("    Stub note created");
			}
		}
	}

	return lines;
}

function formatSuggestions(suggestions: string[]): string {
	return suggestions.map((suggestion) => `[[${suggestion}]]`).join(", ");
}

function countBrokenFiles(links: BrokenLink[]): number {
	return new Set(links.map((link) => link.sourcePath)).size;
}

function groupBySource(links: BrokenLink[]): Map<string, BrokenLink[]> {
	const grouped = new Map<string, BrokenLink[]>();
	const sorted = [...links].sort((a, b) =>
		a.sourcePath.localeCompare(b.sourcePath),
	);
	for (const link of sorted) {
		const list = grouped.get(link.sourcePath);
		if (list) {
			list.push(link);
		} else {
			grouped.set(link.sourcePath, [link]);
		}
	}
	return grouped;
}

function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}
