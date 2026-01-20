import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	type CliOverrides,
	type FrontmatterSchema,
	type FrontmatterSchemaField,
	type FrontmatterSchemas,
	type OutputFormat,
	loadConfig,
} from "../lib/config";
import { findMarkdownFiles, writeNote } from "../lib/markdown/files";
import { parseNote } from "../lib/markdown/frontmatter";
import { type OutputItem, type OutputOptions, output } from "../lib/output";

export type LintOutputMode = "console" | "report" | "json";

export interface FrontmatterLintOptions {
	configPath?: string;
	vaultPath?: string;
	verbose?: boolean;
	json?: boolean;
	output?: OutputFormat;
	outputMode?: LintOutputMode;
	path?: string;
	fix?: boolean;
	dryRun?: boolean;
}

export interface FrontmatterLintPaths {
	vaultPath: string;
	rootPath: string;
	reportPath: string;
	outputMode: LintOutputMode;
	fix: boolean;
	dryRun: boolean;
	schemas: FrontmatterSchemas;
}

export interface FrontmatterLintIssue {
	severity: "error" | "warning" | "info";
	filePath: string;
	noteType?: string;
	field?: string;
	message: string;
	expected?: string;
	actual?: string;
}

export interface FrontmatterLintResult {
	filesScanned: number;
	filesMatched: number;
	filesWithErrors: number;
	totalErrors: number;
	totalWarnings: number;
	totalInfos: number;
	issues: FrontmatterLintIssue[];
	reportPath: string;
	fixedFiles: number;
}

export async function runFrontmatterLint(
	options: FrontmatterLintOptions,
): Promise<void> {
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

	const outputMode = normalizeOutputMode(
		options.outputMode ?? (options.json ? "json" : "report"),
	);
	const rootPath = resolveRootPath(
		config.vault.path,
		options.path ?? config.vault.path,
	);
	const reportPath = path.join(config.vault.path, "Frontmatter Lint Report.md");

	try {
		const result = await lintFrontmatter({
			vaultPath: config.vault.path,
			rootPath,
			reportPath,
			outputMode,
			fix: Boolean(options.fix),
			dryRun: Boolean(options.dryRun),
			schemas: config.schemas ?? {},
		});

		if (outputMode === "json") {
			console.log(JSON.stringify(result, null, 2));
			if (result.totalErrors > 0) {
				process.exitCode = 1;
			}
			return;
		}

		if (outputMode === "console") {
			console.log(buildConsoleLines(result).join("\n"));
			if (result.totalErrors > 0) {
				process.exitCode = 1;
			}
			return;
		}

		const report = buildReport(result);
		await writeFile(reportPath, report, "utf8");

		const items: OutputItem[] = [
			{
				type: result.totalErrors > 0 ? "warning" : "success",
				message:
					result.totalErrors > 0
						? "Frontmatter lint report generated"
						: "No frontmatter issues found",
				details: buildSummary(result),
			},
			{ type: "info", message: `Report path: ${result.reportPath}` },
		];

		if (result.fixedFiles > 0) {
			items.push({
				type: "info",
				message: `Files updated: ${result.fixedFiles}`,
			});
		}

		output(items, outputOptions);
		if (result.totalErrors > 0) {
			process.exitCode = 1;
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		output([{ type: "error", message }], {
			...outputOptions,
			format: "console",
		});
		process.exitCode = 1;
	}
}

export async function lintFrontmatter(
	paths: FrontmatterLintPaths,
): Promise<FrontmatterLintResult> {
	const markdownFiles = await findMarkdownFiles(paths.rootPath);
	const issues: FrontmatterLintIssue[] = [];
	let filesMatched = 0;
	let fixedFiles = 0;

	for (const filePath of markdownFiles) {
		const content = await readFile(filePath, "utf8");
		let note;
		try {
			note = parseNote(content);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown YAML parse error";
			issues.push({
				severity: "error",
				filePath,
				message: `Invalid frontmatter YAML: ${message}`,
			});
			continue;
		}

		const frontmatter = note.frontmatter;
		if (!isFrontmatterObject(frontmatter)) {
			issues.push({
				severity: "error",
				filePath,
				message: "Frontmatter must be a YAML object",
			});
			continue;
		}

		const match = matchSchema(
			filePath,
			frontmatter,
			paths.schemas,
			paths.vaultPath,
		);
		if (!match) {
			continue;
		}
		filesMatched += 1;

		if (match.duplicates.length > 0) {
			issues.push({
				severity: "warning",
				filePath,
				noteType: match.name,
				message: `Matches multiple schemas (${match.duplicates.join(", ")})`,
			});
		}

		const result = validateFrontmatter(
			filePath,
			match.name,
			frontmatter,
			match.schema,
			paths.fix,
		);
		issues.push(...result.issues);

		if (paths.fix && result.updated) {
			if (!paths.dryRun) {
				note.frontmatter = frontmatter;
				await writeNote(filePath, note);
			}
			fixedFiles += 1;
		}
	}

	const summary = summarizeIssues(issues);

	return {
		filesScanned: markdownFiles.length,
		filesMatched,
		filesWithErrors: summary.filesWithErrors,
		totalErrors: summary.totalErrors,
		totalWarnings: summary.totalWarnings,
		totalInfos: summary.totalInfos,
		issues,
		reportPath: paths.reportPath,
		fixedFiles,
	};
}

interface SchemaMatchResult {
	name: string;
	schema: FrontmatterSchema;
	duplicates: string[];
}

function matchSchema(
	filePath: string,
	frontmatter: Record<string, unknown>,
	schemas: FrontmatterSchemas,
	vaultPath: string,
): SchemaMatchResult | null {
	const matches: SchemaMatchResult[] = [];
	for (const [name, schema] of Object.entries(schemas)) {
		if (!schema) continue;
		if (schemaMatches(filePath, frontmatter, schema, vaultPath)) {
			matches.push({ name, schema, duplicates: [] });
		}
	}

	if (matches.length === 0) {
		return null;
	}

	const [first, ...rest] = matches;
	first.duplicates = rest.map((match) => match.name);
	return first;
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

interface ValidationResult {
	issues: FrontmatterLintIssue[];
	updated: boolean;
}

function validateFrontmatter(
	filePath: string,
	noteType: string,
	frontmatter: Record<string, unknown>,
	schema: FrontmatterSchema,
	allowFix: boolean,
): ValidationResult {
	const issues: FrontmatterLintIssue[] = [];
	let updated = false;

	const allowedFields = new Set(Object.keys(schema.fields));
	if (schema.match?.frontmatter) {
		for (const key of Object.keys(schema.match.frontmatter)) {
			allowedFields.add(key);
		}
	}

	for (const [field, definition] of Object.entries(schema.fields)) {
		const value = frontmatter[field];
		if (isMissingValue(value)) {
			if (definition.required) {
				const defaultValue = definition.default;
				const hasDefault = defaultValue !== undefined;
				if (allowFix && hasDefault) {
					frontmatter[field] = defaultValue;
					updated = true;
					issues.push({
						severity: "info",
						filePath,
						noteType,
						field,
						message: "Added missing required field",
						expected: `default: ${formatValue(defaultValue)}`,
					});
				} else {
					issues.push({
						severity: "error",
						filePath,
						noteType,
						field,
						message: "Missing required field",
						expected: hasDefault
							? `default: ${formatValue(defaultValue)}`
							: undefined,
					});
				}
			}
			continue;
		}

		const validation = validateFieldValue(definition, value, allowFix);
		if (validation.issue) {
			issues.push({
				...validation.issue,
				filePath,
				noteType,
				field,
			});
		}
		if (validation.updated) {
			frontmatter[field] = validation.updated;
			updated = true;
			issues.push({
				severity: "info",
				filePath,
				noteType,
				field,
				message: "Normalized field value",
				actual: formatValue(validation.updated),
			});
		}
	}

	for (const key of Object.keys(frontmatter)) {
		if (!allowedFields.has(key)) {
			issues.push({
				severity: "warning",
				filePath,
				noteType,
				field: key,
				message: "Unknown field",
			});
		}
	}

	return { issues, updated };
}

function validateFieldValue(
	definition: FrontmatterSchemaField,
	value: unknown,
	allowFix: boolean,
): { issue?: Omit<FrontmatterLintIssue, "filePath" | "noteType" | "field">; updated?: unknown } {
	if (definition.type === "string") {
		if (typeof value !== "string") {
			return {
				issue: {
					severity: "error",
					message: "Invalid type",
					expected: "string",
					actual: formatValue(value),
				},
			};
		}
		return {};
	}

	if (definition.type === "array") {
		if (!Array.isArray(value)) {
			return {
				issue: {
					severity: "error",
					message: "Invalid type",
					expected: "array",
					actual: formatValue(value),
				},
			};
		}
		return {};
	}

	if (definition.type === "enum") {
		if (typeof value !== "string") {
			return {
				issue: {
					severity: "error",
					message: "Invalid type",
					expected: "string",
					actual: formatValue(value),
				},
			};
		}
		const values = definition.values ?? [];
		if (!values.includes(value)) {
			const closest = allowFix ? findClosestValue(value, values) : null;
			if (closest) {
				return { updated: closest };
			}
			return {
				issue: {
					severity: "error",
					message: "Invalid enum value",
					expected: values.join("|"),
					actual: value,
				},
			};
		}
		return {};
	}

	if (definition.type === "date") {
		const parsed = parseDateValue(value);
		if (!parsed.valid) {
			return {
				issue: {
					severity: "error",
					message: "Invalid date",
					expected: "YYYY-MM-DD",
					actual: formatValue(value),
				},
			};
		}
		if (!parsed.isNormalized && allowFix && parsed.normalized) {
			return { updated: parsed.normalized };
		}
		if (!parsed.isNormalized) {
			return {
				issue: {
					severity: "error",
					message: "Invalid date format",
					expected: "YYYY-MM-DD",
					actual: formatValue(value),
				},
			};
		}
	}

	return {};
}

function parseDateValue(value: unknown): {
	valid: boolean;
	normalized?: string;
	isNormalized: boolean;
} {
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) {
			return { valid: false, isNormalized: false };
		}
		return {
			valid: true,
			normalized: formatDate(value),
			isNormalized: false,
		};
	}

	if (typeof value !== "string") {
		return { valid: false, isNormalized: false };
	}

	if (isIsoDate(value)) {
		return { valid: true, normalized: value, isNormalized: true };
	}

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return { valid: false, isNormalized: false };
	}

	return { valid: true, normalized: formatDate(parsed), isNormalized: false };
}

function isIsoDate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00Z`);
	if (Number.isNaN(parsed.getTime())) return false;
	return formatDate(parsed) === value;
}

function formatDate(date: Date): string {
	const year = date.getUTCFullYear();
	const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
	const day = `${date.getUTCDate()}`.padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function findClosestValue(input: string, values: string[]): string | null {
	let best: { value: string; distance: number } | null = null;
	for (const value of values) {
		const distance = levenshteinDistance(input.toLowerCase(), value.toLowerCase());
		if (!best || distance < best.distance) {
			best = { value, distance };
		}
	}
	if (!best) return null;
	return best.distance <= 2 ? best.value : null;
}

function levenshteinDistance(a: string, b: string): number {
	const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
		Array.from({ length: b.length + 1 }, () => 0),
	);

	for (let i = 0; i <= a.length; i += 1) {
		matrix[i][0] = i;
	}
	for (let j = 0; j <= b.length; j += 1) {
		matrix[0][j] = j;
	}

	for (let i = 1; i <= a.length; i += 1) {
		for (let j = 1; j <= b.length; j += 1) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			matrix[i][j] = Math.min(
				matrix[i - 1][j] + 1,
				matrix[i][j - 1] + 1,
				matrix[i - 1][j - 1] + cost,
			);
		}
	}

	return matrix[a.length][b.length];
}

function isMissingValue(value: unknown): boolean {
	if (value === null || value === undefined) return true;
	if (typeof value === "string" && value.trim() === "") return true;
	return false;
}

function isFrontmatterObject(
	value: Record<string, unknown>,
): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatValue(value: unknown): string {
	if (typeof value === "string") return value;
	if (value === undefined) return "undefined";
	if (value === null) return "null";
	if (Array.isArray(value)) return `[${value.map((item) => String(item)).join(", ")}]`;
	return String(value);
}

function summarizeIssues(issues: FrontmatterLintIssue[]): {
	filesWithErrors: number;
	totalErrors: number;
	totalWarnings: number;
	totalInfos: number;
} {
	const errorFiles = new Set<string>();
	let totalErrors = 0;
	let totalWarnings = 0;
	let totalInfos = 0;

	for (const issue of issues) {
		if (issue.severity === "error") {
			totalErrors += 1;
			errorFiles.add(issue.filePath);
		}
		if (issue.severity === "warning") {
			totalWarnings += 1;
		}
		if (issue.severity === "info") {
			totalInfos += 1;
		}
	}

	return {
		filesWithErrors: errorFiles.size,
		totalErrors,
		totalWarnings,
		totalInfos,
	};
}

function buildSummary(result: FrontmatterLintResult): string {
	return [
		`Files scanned: ${result.filesScanned}`,
		`Errors: ${result.totalErrors}`,
		`Warnings: ${result.totalWarnings}`,
	].join(", ");
}

function buildConsoleLines(result: FrontmatterLintResult): string[] {
	const lines = [buildSummary(result)];
	for (const issue of result.issues) {
		const severity = issue.severity.toUpperCase();
		const file = path.relative(process.cwd(), issue.filePath);
		const field = issue.field ? ` ${issue.field}` : "";
		const detailParts = [];
		if (issue.expected) detailParts.push(`expected: ${issue.expected}`);
		if (issue.actual) detailParts.push(`actual: ${issue.actual}`);
		const detail = detailParts.length > 0 ? ` (${detailParts.join(", ")})` : "";
		lines.push(`${severity}: ${file}${field} - ${issue.message}${detail}`);
	}
	return lines;
}

function buildReport(result: FrontmatterLintResult): string {
	const lines: string[] = [];
	const now = formatDate(new Date());
	lines.push("# Frontmatter Lint Report");
	lines.push("");
	lines.push(`*Generated: ${now}*`);
	lines.push("");
	lines.push("## Summary");
	lines.push(`- Files scanned: ${result.filesScanned}`);
	lines.push(`- Files with errors: ${result.filesWithErrors}`);
	lines.push(`- Total errors: ${result.totalErrors}`);
	lines.push(`- Total warnings: ${result.totalWarnings}`);
	if (result.totalInfos > 0) {
		lines.push(`- Total info: ${result.totalInfos}`);
	}

	lines.push("");
	lines.push("## Errors");
	appendIssueSection(lines, result, "error");
	lines.push("");
	lines.push("## Warnings");
	appendIssueSection(lines, result, "warning");

	return lines.join("\n");
}

function appendIssueSection(
	lines: string[],
	result: FrontmatterLintResult,
	severity: "error" | "warning",
): void {
	const grouped = groupIssuesByFile(
		result.issues.filter((issue) => issue.severity === severity),
	);
	if (grouped.size === 0) {
		lines.push("- None");
		return;
	}

	for (const [filePath, issues] of grouped) {
		const noteType = issues[0]?.noteType ? ` (${issues[0].noteType})` : "";
		lines.push(`### [[${path.basename(filePath)}]]${noteType}`);
		for (const issue of issues) {
			const label = issue.field ? `\`${issue.field}\`` : "frontmatter";
			const detailParts = [];
			if (issue.expected) detailParts.push(`expected: ${issue.expected}`);
			if (issue.actual) detailParts.push(`actual: ${issue.actual}`);
			const detail =
				detailParts.length > 0 ? ` (${detailParts.join(", ")})` : "";
			lines.push(`- ${label}: ${issue.message}${detail}`);
		}
		lines.push("");
	}

	if (lines[lines.length - 1] === "") {
		lines.pop();
	}
}

function groupIssuesByFile(
	issues: FrontmatterLintIssue[],
): Map<string, FrontmatterLintIssue[]> {
	const grouped = new Map<string, FrontmatterLintIssue[]>();
	for (const issue of issues) {
		const list = grouped.get(issue.filePath) ?? [];
		list.push(issue);
		grouped.set(issue.filePath, list);
	}
	return grouped;
}

function normalizeOutputMode(value: string): LintOutputMode {
	if (value === "json" || value === "console" || value === "report") {
		return value;
	}
	return "report";
}

function resolveRootPath(vaultPath: string, targetPath: string): string {
	if (path.isAbsolute(targetPath)) return targetPath;
	return path.join(vaultPath, targetPath);
}
