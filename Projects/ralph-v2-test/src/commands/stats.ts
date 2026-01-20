import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	type CliOverrides,
	type FrontmatterSchema,
	type FrontmatterSchemas,
	type OutputFormat,
	loadConfig,
} from "../lib/config";
import { findMarkdownFiles } from "../lib/markdown/files";
import { type ParsedNote, parseNote } from "../lib/markdown/frontmatter";
import { parseWikilinks } from "../lib/markdown/wikilinks";
import { type OutputItem, type OutputOptions, output } from "../lib/output";

export type StatsSection =
	| "counts"
	| "links"
	| "tags"
	| "activity"
	| "frontmatter";

export interface VaultStatsOptions {
	configPath?: string;
	vaultPath?: string;
	verbose?: boolean;
	json?: boolean;
	output?: OutputFormat;
	section?: string | string[];
	path?: string;
	compare?: string;
}

export interface VaultStatsPaths {
	vaultPath: string;
	rootPath: string;
	reportPath: string;
	sections: StatsSection[];
	schemas: FrontmatterSchemas;
	now?: Date;
}

export interface VaultStatsResult {
	generatedAt: string;
	vaultPath: string;
	rootPath: string;
	filesScanned: number;
	totals: {
		notes: number;
		words: number;
		characters: number;
		avgWords: number;
		avgCharacters: number;
	};
	countsByFolder: Array<{ folder: string; count: number; percent: number }>;
	countsByType: Array<{ type: string; count: number; percent: number }>;
	links: {
		total: number;
		avgPerNote: number;
		mostLinked: Array<{ note: string; backlinks: number }>;
		orphans: string[];
		deadEnds: string[];
		linkDensity: number;
	};
	tags: {
		counts: Record<string, number>;
		untagged: number;
		cooccurrence: Array<{ pair: [string, string]; count: number }>;
	};
	activity: {
		byDay: Record<string, number>;
		byWeek: Record<string, number>;
		byMonth: Record<string, number>;
		recent: { last7: number; last30: number };
		mostActiveWeekdays: Array<{ day: string; count: number }>;
	};
	frontmatter: {
		fieldUsage: Record<string, number>;
		enumDistributions: Record<string, Record<string, number>>;
		missingRequired: Record<string, Record<string, number>>;
	};
	warnings: string[];
}

export interface VaultStatsComparison {
	comparedTo?: string;
	totalsDelta: {
		notes: number;
		words: number;
		characters: number;
		links: number;
		tags: number;
	};
}

export async function runStats(options: VaultStatsOptions): Promise<void> {
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

	const sections = normalizeSections(options.section);
	const rootPath = resolveRootPath(config.vault.path, options.path);
	const reportPath = path.join(config.vault.path, "Vault Stats.md");
	const comparePath = resolveComparePath(options.compare, config.vault.path);

	try {
		const result = await buildVaultStats({
			vaultPath: config.vault.path,
			rootPath,
			reportPath,
			sections,
			schemas: config.schemas ?? {},
		});

		const comparison = comparePath
			? await compareStats(result, comparePath)
			: null;

		if (config.output.format === "json") {
			const payload = comparison ? { ...result, comparison } : { ...result };
			console.log(JSON.stringify(payload, null, 2));
			return;
		}

		const markdown = renderMarkdownReport(result, comparison, sections);
		if (config.output.format === "markdown") {
			await writeFile(reportPath, markdown, "utf8");
			const items: OutputItem[] = [
				{
					type: "success",
					message: "Vault stats report generated",
					details: reportPath,
				},
			];
			if (result.warnings.length > 0) {
				items.push({
					type: "warning",
					message: `Warnings: ${result.warnings.length}`,
				});
			}
			output(items, outputOptions);
			return;
		}

		console.log(renderConsoleReport(result, comparison, sections));
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		output([{ type: "error", message }], {
			...outputOptions,
			format: "console",
		});
		process.exitCode = 1;
	}
}

export async function buildVaultStats(
	paths: VaultStatsPaths,
): Promise<VaultStatsResult> {
	const now = paths.now ?? new Date();
	const files = await findMarkdownFiles(paths.rootPath);
	const indexes = buildFileIndexes(files, paths.vaultPath);

	const countsByFolder = new Map<string, number>();
	const countsByType = new Map<string, number>();
	const fieldUsage = new Map<string, number>();
	const enumDistributions = new Map<string, Map<string, number>>();
	const missingRequired = new Map<string, Map<string, number>>();

	const totalLinksByNote = new Map<string, number>();
	const backlinks = new Map<string, number>();
	const warnings: string[] = [];

	let totalWords = 0;
	let totalCharacters = 0;
	let totalLinks = 0;
	let untaggedNotes = 0;

	const tagCounts = new Map<string, number>();
	const cooccurrenceCounts = new Map<string, number>();
	const activityByDay = new Map<string, number>();
	const activityByWeek = new Map<string, number>();
	const activityByMonth = new Map<string, number>();
	const weekdayCounts = new Map<string, number>();

	const recent = { last7: 0, last30: 0 };

	for (const filePath of files) {
		let note: ParsedNote;
		let content = "";
		try {
			const raw = await readFile(filePath, "utf8");
			note = parseNote(raw);
			content = note.content ?? "";
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown parse error";
			warnings.push(`Failed to parse ${filePath}: ${message}`);
			continue;
		}

		const relative = path.relative(paths.vaultPath, filePath);
		const folder = normalizeFolder(path.dirname(relative));
		const type = resolveNoteType(note.frontmatter, relative);

		increment(countsByFolder, folder);
		increment(countsByType, type);

		const wordCount = countWords(content);
		totalWords += wordCount;
		totalCharacters += content.length;

		for (const key of Object.keys(note.frontmatter ?? {})) {
			increment(fieldUsage, key);
		}

		const tags = collectTags(note.frontmatter ?? {}, content);
		if (tags.size === 0) {
			untaggedNotes += 1;
		} else {
			for (const tag of tags) {
				increment(tagCounts, tag);
			}
			incrementCooccurrence(cooccurrenceCounts, tags);
		}

		const links = parseWikilinks(content);
		for (const link of links) {
			const target = link.target.trim();
			if (!target || isExternalTarget(target)) continue;
			totalLinks += 1;
			increment(totalLinksByNote, filePath);
			const resolved = resolveTarget(target, indexes, paths.vaultPath);
			if (resolved) {
				increment(backlinks, resolved);
			}
		}

		const fileStats = await stat(filePath);
		const modified = fileStats.mtime;
		const dayKey = formatDate(modified);
		const weekKey = formatWeek(modified);
		const monthKey = formatMonth(modified);
		increment(activityByDay, dayKey);
		increment(activityByWeek, weekKey);
		increment(activityByMonth, monthKey);
		increment(weekdayCounts, formatWeekday(modified));

		const diffDays = differenceInDays(modified, now);
		if (diffDays <= 7) recent.last7 += 1;
		if (diffDays <= 30) recent.last30 += 1;

		if (paths.sections.includes("frontmatter")) {
			updateFrontmatterAnalysis(
				note.frontmatter ?? {},
				filePath,
				paths.schemas,
				paths.vaultPath,
				enumDistributions,
				missingRequired,
			);
		}
	}

	const totalNotes = files.length;
	const avgWords = totalNotes > 0 ? totalWords / totalNotes : 0;
	const avgChars = totalNotes > 0 ? totalCharacters / totalNotes : 0;
	const avgLinks = totalNotes > 0 ? totalLinks / totalNotes : 0;

	const orphans = files.filter((file) => (backlinks.get(file) ?? 0) === 0);
	const deadEnds = files.filter(
		(file) => (totalLinksByNote.get(file) ?? 0) === 0,
	);

	return {
		generatedAt: formatTimestamp(now),
		vaultPath: paths.vaultPath,
		rootPath: paths.rootPath,
		filesScanned: files.length,
		totals: {
			notes: totalNotes,
			words: totalWords,
			characters: totalCharacters,
			avgWords,
			avgCharacters: avgChars,
		},
		countsByFolder: mapToPercentList(countsByFolder, totalNotes, "folder"),
		countsByType: mapToPercentList(countsByType, totalNotes, "type"),
		links: {
			total: totalLinks,
			avgPerNote: avgLinks,
			mostLinked: topBacklinks(backlinks, paths.vaultPath),
			orphans: orphans.map((file) => formatNoteLabel(file, paths.vaultPath)),
			deadEnds: deadEnds.map((file) => formatNoteLabel(file, paths.vaultPath)),
			linkDensity: avgLinks,
		},
		tags: {
			counts: mapToObject(tagCounts),
			untagged: untaggedNotes,
			cooccurrence: formatCooccurrence(cooccurrenceCounts),
		},
		activity: {
			byDay: mapToObject(activityByDay),
			byWeek: mapToObject(activityByWeek),
			byMonth: mapToObject(activityByMonth),
			recent,
			mostActiveWeekdays: formatWeekdayCounts(weekdayCounts),
		},
		frontmatter: {
			fieldUsage: mapToObject(fieldUsage),
			enumDistributions: mapNestedToObject(enumDistributions),
			missingRequired: mapNestedToObject(missingRequired),
		},
		warnings,
	};
}

export async function compareStats(
	current: VaultStatsResult,
	comparePath: string,
): Promise<VaultStatsComparison> {
	const raw = await readFile(comparePath, "utf8");
	const parsed = JSON.parse(raw) as Partial<VaultStatsResult>;
	const previousTotals = parsed.totals ?? {
		notes: 0,
		words: 0,
		characters: 0,
	};
	const previousLinks = parsed.links?.total ?? 0;
	const previousTags = sumCounts(parsed.tags?.counts ?? {});

	return {
		comparedTo: parsed.generatedAt,
		totalsDelta: {
			notes: current.totals.notes - previousTotals.notes,
			words: current.totals.words - previousTotals.words,
			characters: current.totals.characters - previousTotals.characters,
			links: current.links.total - previousLinks,
			tags: sumCounts(current.tags.counts) - previousTags,
		},
	};
}

function normalizeSections(input?: string | string[]): StatsSection[] {
	if (!input) {
		return ["counts", "links", "tags", "activity", "frontmatter"];
	}
	const raw = Array.isArray(input) ? input : [input];
	const sections: StatsSection[] = [];
	for (const entry of raw) {
		const value = entry.trim().toLowerCase();
		if (value === "counts") sections.push("counts");
		else if (value === "links") sections.push("links");
		else if (value === "tags") sections.push("tags");
		else if (value === "activity") sections.push("activity");
		else if (value === "frontmatter") sections.push("frontmatter");
		else {
			throw new Error(
				`Invalid section: ${entry}. Use counts, links, tags, activity, or frontmatter.`,
			);
		}
	}
	return sections;
}

function resolveRootPath(vaultPath: string, targetPath?: string): string {
	if (!targetPath) return vaultPath;
	if (path.isAbsolute(targetPath)) return targetPath;
	return path.join(vaultPath, targetPath);
}

function resolveComparePath(
	input: string | undefined,
	vaultPath: string,
): string | null {
	if (!input) return null;
	return path.isAbsolute(input) ? input : path.join(vaultPath, input);
}

interface FileIndexes {
	pathIndex: Map<string, string[]>;
	baseIndex: Map<string, string[]>;
}

function buildFileIndexes(files: string[], vaultPath: string): FileIndexes {
	const pathIndex = new Map<string, string[]>();
	const baseIndex = new Map<string, string[]>();
	for (const filePath of files) {
		const relative = path.relative(vaultPath, filePath).replaceAll("\\", "/");
		const key = normalizePathKey(relative);
		const base = path.basename(relative, ".md").toLowerCase();
		appendIndex(pathIndex, key, filePath);
		appendIndex(baseIndex, base, filePath);
	}
	return { pathIndex, baseIndex };
}

function appendIndex(
	index: Map<string, string[]>,
	key: string,
	value: string,
): void {
	const list = index.get(key);
	if (list) {
		list.push(value);
	} else {
		index.set(key, [value]);
	}
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
	if (normalized.includes("/")) {
		const matches = indexes.pathIndex.get(normalized);
		return matches?.[0] ?? null;
	}
	const matches = indexes.baseIndex.get(normalized);
	if (!matches || matches.length === 0) return null;
	if (matches.length === 1) return matches[0];
	const relativeMatches = matches.map((match) =>
		path.relative(vaultPath, match),
	);
	relativeMatches.sort();
	return path.join(vaultPath, relativeMatches[0]);
}

function isExternalTarget(target: string): boolean {
	return /^https?:\/\//i.test(target) || /^mailto:/i.test(target);
}

function normalizeFolder(folder: string): string {
	if (!folder || folder === "." || folder === path.sep) return "(root)";
	return folder.replaceAll("\\", "/");
}

function resolveNoteType(
	frontmatter: Record<string, unknown>,
	relativePath: string,
): string {
	const typeValue = frontmatter.type;
	if (typeof typeValue === "string" && typeValue.trim()) {
		return typeValue.trim();
	}
	const parts = relativePath.replaceAll("\\", "/").split("/");
	if (parts.length > 1) return parts[0] ?? "(root)";
	return "(root)";
}

function countWords(content: string): number {
	const trimmed = content.trim();
	if (!trimmed) return 0;
	return trimmed.split(/\s+/).length;
}

function collectTags(
	frontmatter: Record<string, unknown>,
	content: string,
): Set<string> {
	const tags = new Set<string>();
	for (const tag of normalizeTags(frontmatter.tags ?? frontmatter.tag)) {
		tags.add(tag);
	}
	for (const tag of extractInlineTags(content)) {
		tags.add(tag);
	}
	return tags;
}

function normalizeTags(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.filter((tag): tag is string => typeof tag === "string")
			.map((tag) => normalizeTag(tag))
			.filter(Boolean);
	}
	if (typeof value === "string") {
		return value
			.split(/[,\s]+/)
			.map((tag) => normalizeTag(tag))
			.filter(Boolean);
	}
	return [];
}

function normalizeTag(tag: string): string {
	return tag.replace(/^#/, "").trim().toLowerCase();
}

function extractInlineTags(content: string): string[] {
	const tags: string[] = [];
	const lines = content.split("\n");
	let inFence = false;
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith("```")) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const regex = /(^|\s)#([A-Za-z0-9/_-]+)/g;
		let match = regex.exec(line);
		while (match) {
			const tag = normalizeTag(match[2]);
			if (tag) tags.push(tag);
			match = regex.exec(line);
		}
	}
	return tags;
}

function increment(map: Map<string, number>, key: string, amount = 1): void {
	map.set(key, (map.get(key) ?? 0) + amount);
}

function incrementCooccurrence(
	map: Map<string, number>,
	tags: Set<string>,
): void {
	const list = Array.from(tags).sort();
	for (let i = 0; i < list.length; i += 1) {
		for (let j = i + 1; j < list.length; j += 1) {
			const key = `${list[i]}::${list[j]}`;
			map.set(key, (map.get(key) ?? 0) + 1);
		}
	}
}

function mapToPercentList(
	map: Map<string, number>,
	total: number,
	label: "folder" | "type",
): Array<{ [K in typeof label]: string } & { count: number; percent: number }> {
	const entries = Array.from(map.entries()).map(([key, count]) => ({
		[label]: key,
		count,
		percent: total > 0 ? Math.round((count / total) * 100) : 0,
	}));
	entries.sort((a, b) => b.count - a.count);
	return entries;
}

function mapToObject(map: Map<string, number>): Record<string, number> {
	const result: Record<string, number> = {};
	for (const [key, value] of map.entries()) {
		result[key] = value;
	}
	return result;
}

function mapNestedToObject(
	map: Map<string, Map<string, number>>,
): Record<string, Record<string, number>> {
	const result: Record<string, Record<string, number>> = {};
	for (const [outerKey, innerMap] of map.entries()) {
		result[outerKey] = mapToObject(innerMap);
	}
	return result;
}

function topBacklinks(
	backlinks: Map<string, number>,
	vaultPath: string,
): Array<{ note: string; backlinks: number }> {
	const entries = Array.from(backlinks.entries())
		.map(([file, count]) => ({
			note: formatNoteLabel(file, vaultPath),
			backlinks: count,
		}))
		.sort((a, b) => b.backlinks - a.backlinks)
		.slice(0, 10);
	return entries;
}

function formatNoteLabel(filePath: string, vaultPath: string): string {
	const relative = path.relative(vaultPath, filePath).replace(/\.md$/i, "");
	return relative.replaceAll("\\", "/");
}

function formatCooccurrence(
	map: Map<string, number>,
): Array<{ pair: [string, string]; count: number }> {
	const entries = Array.from(map.entries())
		.map(([key, count]) => {
			const [first, second] = key.split("::");
			return { pair: [first, second] as [string, string], count };
		})
		.sort((a, b) => b.count - a.count)
		.slice(0, 10);
	return entries;
}

function formatWeekdayCounts(
	map: Map<string, number>,
): Array<{ day: string; count: number }> {
	return Array.from(map.entries())
		.sort((a, b) => b[1] - a[1])
		.map(([day, count]) => ({ day, count }));
}

function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function formatWeek(date: Date): string {
	const { year, week } = isoWeekFromDate(date);
	return `${year}-W${String(week).padStart(2, "0")}`;
}

function formatMonth(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	return `${year}-${month}`;
}

function formatWeekday(date: Date): string {
	return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);
}

function formatTimestamp(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	const hours = `${date.getHours()}`.padStart(2, "0");
	const minutes = `${date.getMinutes()}`.padStart(2, "0");
	return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function isoWeekFromDate(date: Date): { year: number; week: number } {
	const target = new Date(
		Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
	);
	const day = target.getUTCDay() || 7;
	target.setUTCDate(target.getUTCDate() + 4 - day);
	const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
	const week = Math.ceil(
		((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
	);
	return { year: target.getUTCFullYear(), week };
}

function differenceInDays(earlier: Date, later: Date): number {
	const start = new Date(
		earlier.getFullYear(),
		earlier.getMonth(),
		earlier.getDate(),
	);
	const end = new Date(later.getFullYear(), later.getMonth(), later.getDate());
	const diff = end.getTime() - start.getTime();
	return Math.floor(diff / 86400000);
}

function updateFrontmatterAnalysis(
	frontmatter: Record<string, unknown>,
	filePath: string,
	schemas: FrontmatterSchemas,
	vaultPath: string,
	enumDistributions: Map<string, Map<string, number>>,
	missingRequired: Map<string, Map<string, number>>,
): void {
	const matches = matchSchemas(filePath, frontmatter, schemas, vaultPath);
	if (matches.length === 0) return;

	for (const match of matches) {
		for (const [field, definition] of Object.entries(match.schema.fields)) {
			const value = frontmatter[field];
			if (value === undefined || value === null || value === "") {
				if (definition.required) {
					incrementNested(missingRequired, match.name, field);
				}
				continue;
			}
			if (definition.type === "enum" && typeof value === "string") {
				incrementNested(enumDistributions, match.name, value);
			}
		}
	}
}

function incrementNested(
	map: Map<string, Map<string, number>>,
	outerKey: string,
	innerKey: string,
): void {
	const inner = map.get(outerKey) ?? new Map<string, number>();
	inner.set(innerKey, (inner.get(innerKey) ?? 0) + 1);
	map.set(outerKey, inner);
}

interface SchemaMatchResult {
	name: string;
	schema: FrontmatterSchema;
}

function matchSchemas(
	filePath: string,
	frontmatter: Record<string, unknown>,
	schemas: FrontmatterSchemas,
	vaultPath: string,
): SchemaMatchResult[] {
	const matches: SchemaMatchResult[] = [];
	for (const [name, schema] of Object.entries(schemas)) {
		if (!schema) continue;
		if (schemaMatches(filePath, frontmatter, schema, vaultPath)) {
			matches.push({ name, schema });
		}
	}
	return matches;
}

function schemaMatches(
	filePath: string,
	frontmatter: Record<string, unknown>,
	schema: FrontmatterSchema,
	vaultPath: string,
): boolean {
	const match = schema.match;
	if (!match || Object.keys(match).length === 0) return true;

	if (match.folder) {
		const folderPath = resolveMatchFolder(match.folder, vaultPath);
		const relative = path.relative(folderPath, filePath);
		if (relative.startsWith("..") || path.isAbsolute(relative)) {
			return false;
		}
	}

	if (match.filename) {
		const regex = new RegExp(match.filename);
		if (!regex.test(path.basename(filePath))) {
			return false;
		}
	}

	if (match.frontmatter) {
		for (const [key, expected] of Object.entries(match.frontmatter)) {
			if (frontmatter[key] !== expected) {
				return false;
			}
		}
	}

	return true;
}

function resolveMatchFolder(folder: string, vaultPath: string): string {
	if (path.isAbsolute(folder)) return folder;
	return path.join(vaultPath, folder);
}

function sumCounts(counts: Record<string, number>): number {
	let total = 0;
	for (const value of Object.values(counts)) {
		total += value;
	}
	return total;
}

function renderMarkdownReport(
	result: VaultStatsResult,
	comparison: VaultStatsComparison | null,
	sections: StatsSection[],
): string {
	const lines: string[] = [];
	lines.push("# Vault Statistics", "");
	lines.push(`*Generated: ${result.generatedAt}*`, "", "## Overview");
	lines.push("| Metric | Count |");
	lines.push("|--------|-------|");
	lines.push(`| Total notes | ${result.totals.notes} |`);
	lines.push(`| Total words | ${result.totals.words} |`);
	lines.push(`| Total links | ${result.links.total} |`);
	lines.push(
		`| Avg links/note | ${result.totals.notes > 0 ? result.links.avgPerNote.toFixed(1) : "0"} |`,
	);
	lines.push("");

	if (comparison) {
		lines.push("## Comparison");
		lines.push(
			`- Notes: ${formatDelta(comparison.totalsDelta.notes)}, Words: ${formatDelta(comparison.totalsDelta.words)}, Links: ${formatDelta(comparison.totalsDelta.links)}`,
		);
		lines.push("");
	}

	if (sections.includes("counts")) {
		lines.push("## Notes by Folder", "");
		lines.push("| Folder | Count | % |");
		lines.push("|--------|-------|---|");
		for (const entry of result.countsByFolder) {
			lines.push(`| ${entry.folder} | ${entry.count} | ${entry.percent}% |`);
		}
		lines.push("", "## Notes by Type", "");
		lines.push("| Type | Count | % |");
		lines.push("|------|-------|---|");
		for (const entry of result.countsByType) {
			lines.push(`| ${entry.type} | ${entry.count} | ${entry.percent}% |`);
		}
		lines.push("");
	}

	if (sections.includes("links")) {
		lines.push("## Link Analysis", "", "### Most Linked Notes (Top 10)");
		lines.push("| Note | Backlinks |");
		lines.push("|------|-----------|");
		if (result.links.mostLinked.length === 0) {
			lines.push("| None | 0 |");
		} else {
			for (const entry of result.links.mostLinked) {
				lines.push(`| [[${entry.note}]] | ${entry.backlinks} |`);
			}
		}
		lines.push("", "### Orphan Notes (No Incoming Links)");
		lines.push(`- ${result.links.orphans.length} notes have no backlinks`);
		if (result.links.orphans.length > 0) {
			lines.push(
				`- Top orphans: ${result.links.orphans
					.slice(0, 5)
					.map((note) => `[[${note}]]`)
					.join(", ")}`,
			);
		}
		lines.push("", "### Dead Ends (No Outgoing Links)");
		lines.push(`- ${result.links.deadEnds.length} notes link to nothing`);
		lines.push("");
	}

	if (sections.includes("tags")) {
		lines.push("## Tag Analysis", "", "### Top Tags");
		lines.push("| Tag | Count |");
		lines.push("|-----|-------|");
		const tagEntries = Object.entries(result.tags.counts).sort(
			(a, b) => b[1] - a[1],
		);
		if (tagEntries.length === 0) {
			lines.push("| None | 0 |");
		} else {
			for (const [tag, count] of tagEntries.slice(0, 10)) {
				lines.push(`| #${tag} | ${count} |`);
			}
		}
		lines.push("", "### Untagged Notes");
		lines.push(`- ${result.tags.untagged} notes have no tags`);
		lines.push("");
		if (result.tags.cooccurrence.length > 0) {
			lines.push("### Tag Co-occurrence (Top 10)");
			lines.push("| Tags | Count |");
			lines.push("|------|-------|");
			for (const entry of result.tags.cooccurrence) {
				lines.push(
					`| #${entry.pair[0]} + #${entry.pair[1]} | ${entry.count} |`,
				);
			}
			lines.push("");
		}
	}

	if (sections.includes("activity")) {
		lines.push("## Activity (Last 30 Days)", "");
		lines.push(`- Notes modified last 7 days: ${result.activity.recent.last7}`);
		lines.push(
			`- Notes modified last 30 days: ${result.activity.recent.last30}`,
		);
		lines.push("");
		if (result.activity.mostActiveWeekdays.length > 0) {
			lines.push("### Most Active Days");
			let rank = 1;
			for (const entry of result.activity.mostActiveWeekdays.slice(0, 3)) {
				lines.push(`${rank}. ${entry.day} (${entry.count} notes)`);
				rank += 1;
			}
			lines.push("");
		}
	}

	if (sections.includes("frontmatter")) {
		lines.push("## Frontmatter Health", "");
		lines.push("### Field Usage");
		lines.push("| Field | Count |");
		lines.push("|-------|-------|");
		const fieldEntries = Object.entries(result.frontmatter.fieldUsage).sort(
			(a, b) => b[1] - a[1],
		);
		if (fieldEntries.length === 0) {
			lines.push("| None | 0 |");
		} else {
			for (const [field, count] of fieldEntries.slice(0, 10)) {
				lines.push(`| ${field} | ${count} |`);
			}
		}
		lines.push("");
		if (Object.keys(result.frontmatter.missingRequired).length > 0) {
			lines.push("### Missing Required Fields");
			for (const [schema, fields] of Object.entries(
				result.frontmatter.missingRequired,
			)) {
				const entries = Object.entries(fields)
					.map(([field, count]) => `${field} (${count})`)
					.join(", ");
				lines.push(`- ${schema}: ${entries}`);
			}
			lines.push("");
		}
		if (Object.keys(result.frontmatter.enumDistributions).length > 0) {
			lines.push("### Enum Distributions");
			for (const [schema, values] of Object.entries(
				result.frontmatter.enumDistributions,
			)) {
				const entries = Object.entries(values)
					.map(([value, count]) => `${value} (${count})`)
					.join(", ");
				lines.push(`- ${schema}: ${entries}`);
			}
			lines.push("");
		}
	}

	if (result.warnings.length > 0) {
		lines.push("---");
		lines.push(`Warnings: ${result.warnings.length}`);
	}

	return lines.join("\n").trimEnd();
}

function renderConsoleReport(
	result: VaultStatsResult,
	comparison: VaultStatsComparison | null,
	sections: StatsSection[],
): string {
	const lines: string[] = [];
	lines.push("Vault Statistics");
	lines.push(
		`Notes: ${result.totals.notes}, Words: ${result.totals.words}, Links: ${result.links.total}`,
	);
	if (comparison) {
		lines.push(
			`Delta notes: ${formatDelta(comparison.totalsDelta.notes)}, Delta links: ${formatDelta(comparison.totalsDelta.links)}`,
		);
	}
	if (sections.includes("links")) {
		lines.push(
			`Orphans: ${result.links.orphans.length}, Dead ends: ${result.links.deadEnds.length}`,
		);
	}
	if (sections.includes("tags")) {
		lines.push(`Untagged notes: ${result.tags.untagged}`);
	}
	if (sections.includes("activity")) {
		lines.push(
			`Recent: ${result.activity.recent.last7} (7d), ${result.activity.recent.last30} (30d)`,
		);
	}
	if (result.warnings.length > 0) {
		lines.push(`Warnings: ${result.warnings.length}`);
	}
	return lines.join("\n");
}

function formatDelta(value: number): string {
	if (value > 0) return `+${value}`;
	if (value < 0) return `${value}`;
	return "0";
}
