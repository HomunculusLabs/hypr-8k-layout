import path from "node:path";
import { createBunAdapter, type VaultAdapter } from "../lib/adapters";
import { createCommandRunner } from "../lib/command-runner";
import { FILENAMES, OUTPUT_FORMAT } from "../lib/constants";
import { loadConfig } from "../lib/config";
import { findMarkdownFiles, readNote, writeNote } from "../lib/markdown/files";
import { type OutputItem, type OutputOptions, output } from "../lib/output";
import type { CliOverrides, OutputFormat } from "../types";

export type StaleOutputMode = "report" | "inline" | "console";

export interface StaleCheckOptions {
	configPath?: string;
	vaultPath?: string;
	verbose?: boolean;
	json?: boolean;
	output?: OutputFormat;
	outputMode?: StaleOutputMode;
	highDays?: number;
	mediumDays?: number;
	lowDays?: number;
	blockedDays?: number;
	path?: string;
	exclude?: string[];
	noWrite?: boolean;
}

export interface StaleCheckPaths {
	adapter: VaultAdapter;
	vaultPath: string;
	todosPath: string;
	reportPath: string;
	outputMode: StaleOutputMode;
	thresholds: StaleThresholds;
	excludePatterns: string[];
	noWrite?: boolean;
	now?: Date;
}

export interface StaleCheckResult {
	totalActive: number;
	staleActive: number;
	staleBlocked: number;
	averageAge: number;
	updatedTodos: number;
	reportPath: string;
	staleTodos: StaleTodo[];
	warnings: string[];
	noWrite: boolean;
}

interface StaleThresholds {
	high: number;
	medium: number;
	low: number;
	blocked: number;
}

interface StaleTodo {
	path: string;
	title: string;
	priority: "high" | "medium" | "low";
	status: string;
	isBlocked: boolean;
	lastUpdated: Date;
	lastUpdatedLabel: string;
	daysStale: number;
	threshold: number;
	severity: "warning" | "critical";
	blocker?: string;
}

const STALE_TAG = "⚠️ STALE";
const LAST_UPDATED_PATTERN = /last updated[^0-9]*(\d{4}-\d{2}-\d{2})/i;
const REPORT_FILENAME = FILENAMES.staleTodosReport;
const DEFAULT_THRESHOLDS: StaleThresholds = {
	high: 3,
	medium: 7,
	low: 14,
	blocked: 14,
};
const SEVERITY_MULTIPLIER = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

export const runStaleCheck = createCommandRunner(
	async (options: StaleCheckOptions, { setOutputOptions }): Promise<void> => {
	const config = await loadConfig(options.configPath, {
		vault: options.vaultPath,
		verbose: options.verbose,
		json: options.json,
		output: options.output,
	} satisfies CliOverrides);

	const outputOptions = buildOutputOptions(config);
	setOutputOptions(outputOptions);
	const adapter = createBunAdapter(config.vault.path);
	const outputMode = normalizeOutputMode(options.outputMode ?? "report");
	const todosPath = options.path
		? resolveTodosPath(config.vault.path, options.path)
		: config.vault.todosFolder;
	const reportPath = path.join(config.vault.path, REPORT_FILENAME);

	const result = await checkStaleTodos({
		adapter,
		vaultPath: config.vault.path,
		todosPath,
		reportPath,
		outputMode,
		thresholds: normalizeThresholds(options),
		excludePatterns: normalizeExcludePatterns(options.exclude),
		noWrite: options.noWrite,
	});

	if (outputMode === OUTPUT_FORMAT.console) {
		const consoleLines = buildConsoleLines(result);
		console.log(consoleLines.join("\n"));
		return;
	}

	output(buildOutputItems(result, outputMode), outputOptions);
},
);

export async function checkStaleTodos(
	paths: StaleCheckPaths,
): Promise<StaleCheckResult> {
	const now = paths.now ?? new Date();
	const todoFiles = await findMarkdownFiles(paths.adapter, paths.todosPath);
	const staleTodos: StaleTodo[] = [];
	const warnings: string[] = [];
	let totalActive = 0;
	let totalAge = 0;
	let totalAgeCount = 0;
	let updatedTodos = 0;

	for (const todoPath of todoFiles) {
		const note = await readNote(paths.adapter, todoPath);
		const status =
			coerceString(note.frontmatter.status)?.toLowerCase() ?? "active";
		if (status === "completed") {
			continue;
		}

		const title = resolveTodoTitle(todoPath, note.frontmatter);
		if (matchesExclude(title, todoPath, paths.excludePatterns)) {
			continue;
		}

		const isBlocked = status === "blocked";
		if (!isBlocked) {
			totalActive += 1;
		}

		const fileStats = await paths.adapter.getFileStats(todoPath);
		const lastUpdated = resolveLastUpdated(note, fileStats);
		const daysStale = daysBetween(now, lastUpdated);

		if (!isBlocked) {
			totalAge += daysStale;
			totalAgeCount += 1;
		}

		const priority = resolvePriority(note.frontmatter.priority);
		const threshold = isBlocked
			? paths.thresholds.blocked
			: paths.thresholds[priority];
		if (daysStale < threshold) {
			continue;
		}

		const severity =
			daysStale >= threshold * SEVERITY_MULTIPLIER ? "critical" : "warning";

		staleTodos.push({
			path: todoPath,
			title,
			priority,
			status,
			isBlocked,
			lastUpdated,
			lastUpdatedLabel: formatDate(lastUpdated),
			daysStale,
			threshold,
			severity,
			blocker: resolveBlockerReason(note.frontmatter) ?? undefined,
		});
	}

	staleTodos.sort((a, b) => b.daysStale - a.daysStale);

	const staleActive = staleTodos.filter((todo) => !todo.isBlocked).length;
	const staleBlocked = staleTodos.filter((todo) => todo.isBlocked).length;
	const averageAge = totalAgeCount > 0 ? totalAge / totalAgeCount : 0;

	const report = buildStaleReport({
		staleTodos,
		now,
		totalActive,
		staleActive,
		staleBlocked,
		averageAge,
	});

	if (paths.outputMode === "report" && !paths.noWrite) {
		await paths.adapter.writeFile(paths.reportPath, report);
	}

	if (paths.outputMode === "inline" && !paths.noWrite) {
		for (const todo of staleTodos) {
			const note = await readNote(paths.adapter, todo.path);
			const updated = addStaleTag(note.frontmatter);
			if (!updated) continue;
			await writeNote(paths.adapter, todo.path, note);
			updatedTodos += 1;
		}
	}

	if (paths.outputMode === "inline" && paths.noWrite) {
		updatedTodos = staleTodos.length;
	}

	return {
		totalActive,
		staleActive,
		staleBlocked,
		averageAge,
		updatedTodos,
		reportPath: paths.reportPath,
		staleTodos,
		warnings,
		noWrite: paths.noWrite ?? false,
	};
}

function buildOutputOptions(config: {
	output: { format: string; color: boolean; verbose: boolean };
}): OutputOptions {
	return {
		format: config.output.format,
		color: config.output.color,
		verbose: config.output.verbose,
		quiet: false,
	};
}

function buildOutputItems(
	result: StaleCheckResult,
	outputMode: StaleOutputMode,
): OutputItem[] {
	const items: OutputItem[] = [];
	for (const warning of result.warnings) {
		items.push({ type: "warning", message: warning });
	}

	items.push({
		type: "success",
		message: resolveOutputMessage(outputMode),
		details: buildSummary(result),
	});

	if (outputMode === "report") {
		items.push({
			type: "info",
			message: `Report path: ${result.reportPath}`,
		});
	}

	if (outputMode === "inline" && result.updatedTodos === 0) {
		items.push({ type: "info", message: "No stale todos to tag" });
	}

	return items;
}

function resolveOutputMessage(outputMode: StaleOutputMode): string {
	if (outputMode === "inline") return "Stale todos tagged";
	if (outputMode === OUTPUT_FORMAT.console) return "Stale todo summary";
	return "Stale todo report generated";
}

function buildSummary(result: StaleCheckResult): string {
	return [
		`Active todos: ${result.totalActive}`,
		`Stale: ${result.staleActive}`,
		`Blocked stale: ${result.staleBlocked}`,
	].join(", ");
}

function resolveTodosPath(vaultPath: string, overridePath?: string): string {
	if (!overridePath) return vaultPath;
	if (path.isAbsolute(overridePath)) return overridePath;
	return path.resolve(vaultPath, overridePath);
}

function normalizeThresholds(options: StaleCheckOptions): StaleThresholds {
	return {
		high: clampDays(resolveDays(options.highDays, DEFAULT_THRESHOLDS.high)),
		medium: clampDays(
			resolveDays(options.mediumDays, DEFAULT_THRESHOLDS.medium),
		),
		low: clampDays(resolveDays(options.lowDays, DEFAULT_THRESHOLDS.low)),
		blocked: clampDays(
			resolveDays(options.blockedDays, DEFAULT_THRESHOLDS.blocked),
		),
	};
}

function resolveDays(value: number | undefined, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return value;
}

function clampDays(value: number): number {
	if (!Number.isFinite(value) || value <= 0) return 1;
	return Math.round(value);
}

function normalizeExcludePatterns(patterns?: string[]): string[] {
	if (!patterns) return [];
	return patterns.map((pattern) => pattern.trim()).filter(Boolean);
}

function normalizeOutputMode(value: string): StaleOutputMode {
	if (value === "inline" || value === OUTPUT_FORMAT.console || value === "report") {
		return value;
	}
	throw new Error(`Invalid output mode: ${value}`);
}

function matchesExclude(
	title: string,
	filePath: string,
	patterns: string[],
): boolean {
	if (patterns.length === 0) return false;
	const haystack = `${title} ${filePath}`.toLowerCase();
	return patterns.some((pattern) => haystack.includes(pattern.toLowerCase()));
}

function coerceString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function resolvePriority(value: unknown): "high" | "medium" | "low" {
	if (typeof value !== "string") return "medium";
	const normalized = value.toLowerCase();
	if (normalized === "high") return "high";
	if (normalized === "low") return "low";
	return "medium";
}

function resolveTodoTitle(
	notePath: string,
	frontmatter: Record<string, unknown>,
): string {
	if (typeof frontmatter.title === "string" && frontmatter.title.trim()) {
		return frontmatter.title.trim();
	}
	return path.basename(notePath, ".md");
}

function resolveBlockerReason(
	frontmatter: Record<string, unknown>,
): string | null {
	const candidates = [
		frontmatter.blocker,
		frontmatter.blocker_reason,
		frontmatter.blocked_reason,
		frontmatter.blockedReason,
	];
	for (const value of candidates) {
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}
	return null;
}

function resolveCreatedDate(
	frontmatter: Record<string, unknown>,
	stats: { birthtime: Date; mtime: Date },
): Date {
	const created = coerceDateInput(frontmatter.created);
	if (created) return dateFromYmd(created);
	return (
		resolveFileDate(stats.birthtime) ??
		resolveFileDate(stats.mtime) ??
		new Date()
	);
}

function resolveLastUpdated(
	note: { frontmatter: Record<string, unknown>; content: string },
	stats: { birthtime: Date; mtime: Date },
): Date {
	const created = resolveCreatedDate(note.frontmatter, stats);
	return (
		extractLastUpdated(note.content) ?? resolveFileDate(stats.mtime) ?? created
	);
}

function resolveFileDate(value: Date | undefined): Date | null {
	if (!value) return null;
	return Number.isNaN(value.getTime()) ? null : value;
}

function extractLastUpdated(content: string): Date | null {
	const match = LAST_UPDATED_PATTERN.exec(content);
	if (!match) return null;
	const date = match[1];
	return date ? dateFromYmd(date) : null;
}

function addStaleTag(frontmatter: Record<string, unknown>): boolean {
	const existing = frontmatter.tags;
	const tags = normalizeTags(existing);
	if (tags.includes(STALE_TAG)) return false;
	tags.push(STALE_TAG);
	frontmatter.tags = tags;
	return true;
}

function normalizeTags(value: unknown): string[] {
	if (!value) return [];
	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === "string");
	}
	if (typeof value === "string") {
		return value.trim() ? [value.trim()] : [];
	}
	return [];
}

function buildStaleReport(data: {
	staleTodos: StaleTodo[];
	now: Date;
	totalActive: number;
	staleActive: number;
	staleBlocked: number;
	averageAge: number;
}): string {
	const lines: string[] = [
		"# Stale Todos Report",
		"",
		`*Generated: ${formatDate(data.now)}*`,
		"",
	];

	if (data.staleTodos.length === 0) {
		lines.push("All clear!", "");
	}

	const critical = data.staleTodos.filter(
		(todo) => todo.severity === "critical",
	);
	const warning = data.staleTodos.filter((todo) => todo.severity === "warning");

	lines.push("## Critical (>2x threshold)");
	lines.push(...formatTable(critical));
	lines.push("");

	lines.push("## Warning (>1x threshold)");
	lines.push(...formatTable(warning));
	lines.push("");

	lines.push("## Summary");
	lines.push(`- Total active todos: ${data.totalActive}`);
	const stalePercent =
		data.totalActive > 0
			? ((data.staleActive / data.totalActive) * 100).toFixed(0)
			: "0";
	lines.push(`- Stale todos: ${data.staleActive} (${stalePercent}%)`);
	if (data.staleBlocked > 0) {
		lines.push(`- Blocked stale todos: ${data.staleBlocked}`);
	}
	lines.push(`- Average age: ${data.averageAge.toFixed(1)} days`);

	return lines.join("\n");
}

function formatTable(items: StaleTodo[]): string[] {
	const lines: string[] = [
		"| Todo | Priority | Days Stale | Last Updated |",
		"|------|----------|------------|--------------|",
	];
	if (items.length === 0) {
		lines.push("| _None_ | - | - | - |");
		return lines;
	}

	for (const item of items) {
		const title = formatTodoTitle(item);
		lines.push(
			`| ${title} | ${item.priority} | ${item.daysStale} | ${item.lastUpdatedLabel} |`,
		);
	}

	return lines;
}

function formatTodoTitle(item: StaleTodo): string {
	const base = `[[${escapeTable(item.title)}]]`;
	if (item.isBlocked && item.blocker) {
		return `${base} (blocked: ${escapeTable(item.blocker)})`;
	}
	return base;
}

function escapeTable(value: string): string {
	return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function buildConsoleLines(result: StaleCheckResult): string[] {
	const lines: string[] = [];
	lines.push(`Active todos: ${result.totalActive}`);
	lines.push(`Stale todos: ${result.staleActive}`);
	if (result.staleBlocked > 0) {
		lines.push(`Blocked stale todos: ${result.staleBlocked}`);
	}
	lines.push(`Average age: ${result.averageAge.toFixed(1)} days`);
	return lines;
}

function coerceDateInput(value: unknown): string | null {
	if (!value) return null;
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return formatDate(value);
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
			return trimmed;
		}
		const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
		return match ? match[1] : null;
	}
	return null;
}

function dateFromYmd(value: string): Date {
	const [year, month, day] = value.split("-").map(Number);
	return new Date(year, month - 1, day);
}

function formatDate(date: Date): string {
	const pad = (value: number): string => String(value).padStart(2, "0");
	const year = date.getFullYear();
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());
	return `${year}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(left: Date, right: Date): number {
	const leftStart = startOfDay(left).getTime();
	const rightStart = startOfDay(right).getTime();
	const diff = Math.floor((leftStart - rightStart) / DAY_MS);
	return diff < 0 ? 0 : diff;
}
