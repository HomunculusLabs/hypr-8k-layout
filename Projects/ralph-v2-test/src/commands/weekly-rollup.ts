import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	type CliOverrides,
	type OutputFormat,
	loadConfig,
} from "../lib/config";
import { parseCheckboxes } from "../lib/markdown/checkboxes";
import { findMarkdownFiles, readNote } from "../lib/markdown/files";
import { parseSections } from "../lib/markdown/sections";
import { createWikilink, parseWikilinks } from "../lib/markdown/wikilinks";
import { type OutputItem, type OutputOptions, output } from "../lib/output";

export interface WeeklyRollupOptions {
	configPath?: string;
	vaultPath?: string;
	verbose?: boolean;
	json?: boolean;
	output?: OutputFormat;
	week?: string;
	start?: string;
	end?: string;
	outputPath?: string;
}

export interface WeeklyRollupPaths {
	vaultPath: string;
	todosPath: string;
	dailyPath: string;
	outputPath: string;
	startDate: string;
	endDate: string;
	now?: Date;
}

export interface WeeklyRollupResult {
	reportPath: string;
	markdown: string;
	startDate: string;
	endDate: string;
	label: string;
	completedCount: number;
	lastWeekCompletedCount: number;
	activeDays: number;
	missingDays: string[];
	projectsTouched: number;
	dailyStreak: number;
	lastWeekStreak: number;
	lastWeekProjectsTouched: number;
	totalDays: number;
}

interface CompletionItem {
	text: string;
	normalized: string;
	date: string;
	project?: string;
	category?: string;
	source: "daily" | "todo";
	link?: string;
}

interface DailyScanResult {
	items: CompletionItem[];
	activeDays: Set<string>;
	missingDays: string[];
}

interface CompletionRangeResult {
	items: CompletionItem[];
	activeDays: Set<string>;
	missingDays: string[];
}

const DONE_MARKER = /^\*\*done:\*\*/i;
const HEADING_MARKER = /^#{1,6}\s/;
const EMPHASIS_MARKER = /^\*\*.+\*\*$/;
const CHECKBOX_PATTERN = /^(\s*)([-*])\s+\[( |x|X)\]\s*(.*)$/;

export async function runWeeklyRollup(
	options: WeeklyRollupOptions,
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

	try {
		const range = resolveRollupRange({
			week: options.week,
			start: options.start,
			end: options.end,
		});
		const outputPath = resolveOutputPath(options.outputPath, config.vault.path);

		const result = await buildWeeklyRollup({
			vaultPath: config.vault.path,
			todosPath: config.vault.todosFolder,
			dailyPath: config.vault.dailyFolder,
			outputPath,
			startDate: range.startDate,
			endDate: range.endDate,
		});

		if (config.output.format === "json") {
			console.log(JSON.stringify(result, null, 2));
			return;
		}

		const items: OutputItem[] = [];
		if (result.missingDays.length > 0) {
			items.push({
				type: "warning",
				message: `Missing daily notes: ${result.missingDays.join(", ")}`,
			});
		}

		items.push({
			type: "success",
			message: "Weekly rollup generated",
			details: result.reportPath,
		});

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

export async function buildWeeklyRollup(
	paths: WeeklyRollupPaths,
): Promise<WeeklyRollupResult> {
	const now = paths.now ?? new Date();
	const label = resolveLabel(paths.startDate, paths.endDate);
	const rangeDates = enumerateDates(paths.startDate, paths.endDate);
	const reportName = `Weekly Rollup - ${label}.md`;
	const outputPathIsFile = paths.outputPath.toLowerCase().endsWith(".md");
	const outputDir = outputPathIsFile
		? path.dirname(paths.outputPath)
		: paths.outputPath;
	await mkdir(outputDir, { recursive: true });
	const reportPath = outputPathIsFile
		? paths.outputPath
		: path.join(outputDir, reportName);

	const current = await collectCompletions({
		dailyPath: paths.dailyPath,
		todosPath: paths.todosPath,
		startDate: paths.startDate,
		endDate: paths.endDate,
	});

	const previousWeek = previousWeekRange(paths.startDate, paths.endDate);
	const previous = await collectCompletions({
		dailyPath: paths.dailyPath,
		todosPath: paths.todosPath,
		startDate: previousWeek.startDate,
		endDate: previousWeek.endDate,
	});

	const completions = current.items;
	const byProject = groupByProject(completions);
	const byCategory = groupByCategory(completions);
	const byDay = groupByDay(completions);

	const completedCount = completions.length;
	const lastWeekCompletedCount = previous.items.length;
	const activeDays = current.activeDays.size;
	const projectsTouched = new Set(
		completions
			.map((item) => item.project)
			.filter((value): value is string => Boolean(value)),
	).size;
	const lastWeekProjectsTouched = new Set(
		previous.items
			.map((item) => item.project)
			.filter((value): value is string => Boolean(value)),
	).size;
	const dailyStreak = calculateStreak(rangeDates, current.activeDays);
	const lastWeekDates = enumerateDates(
		previousWeek.startDate,
		previousWeek.endDate,
	);
	const lastWeekStreak = calculateStreak(lastWeekDates, previous.activeDays);

	const markdown = renderWeeklyRollup({
		label,
		startDate: paths.startDate,
		endDate: paths.endDate,
		totalDays: rangeDates.length,
		completedCount,
		lastWeekCompletedCount,
		activeDays,
		missingDays: current.missingDays,
		projectsTouched,
		lastWeekProjectsTouched,
		dailyStreak,
		lastWeekStreak,
		byProject,
		byCategory,
		byDay,
		now,
	});

	await writeFile(reportPath, markdown, "utf8");

	return {
		reportPath,
		markdown,
		startDate: paths.startDate,
		endDate: paths.endDate,
		label,
		completedCount,
		lastWeekCompletedCount,
		activeDays,
		missingDays: current.missingDays,
		projectsTouched,
		dailyStreak,
		lastWeekStreak,
		lastWeekProjectsTouched,
		totalDays: rangeDates.length,
	};
}

function resolveRollupRange(options: {
	week?: string;
	start?: string;
	end?: string;
}): { startDate: string; endDate: string } {
	if (options.start || options.end) {
		if (!options.start || !options.end) {
			throw new Error("Both --start and --end are required for date ranges.");
		}
		const start = normalizeDateInput(options.start);
		const end = normalizeDateInput(options.end);
		if (!start || !end) {
			throw new Error("Invalid date range. Use YYYY-MM-DD.");
		}
		if (dateFromYmd(start) > dateFromYmd(end)) {
			throw new Error("Start date must be before end date.");
		}
		return { startDate: start, endDate: end };
	}

	if (options.week) {
		const { year, week } = parseIsoWeek(options.week);
		const start = startOfIsoWeek(year, week);
		const end = addDays(start, 6);
		return { startDate: formatDate(start), endDate: formatDate(end) };
	}

	const today = new Date();
	const { year, week } = isoWeekFromDate(today);
	const start = startOfIsoWeek(year, week);
	const end = addDays(start, 6);
	return { startDate: formatDate(start), endDate: formatDate(end) };
}

function resolveOutputPath(outputPath: string | undefined, vaultPath: string) {
	const defaultPath = path.join(vaultPath, "1 - Rough Notes", "Weekly");
	if (!outputPath) {
		return defaultPath;
	}
	return path.isAbsolute(outputPath)
		? outputPath
		: path.join(vaultPath, outputPath);
}

function resolveLabel(startDate: string, endDate: string): string {
	const start = dateFromYmd(startDate);
	const end = dateFromYmd(endDate);
	const startWeek = isoWeekFromDate(start);
	const endWeek = isoWeekFromDate(end);
	const isFullWeek =
		startWeek.year === endWeek.year &&
		startWeek.week === endWeek.week &&
		formatDate(addDays(start, 6)) === endDate &&
		start.getDay() === 1;

	if (isFullWeek) {
		return `${startWeek.year}-W${String(startWeek.week).padStart(2, "0")}`;
	}

	return `${startDate} to ${endDate}`;
}

function parseIsoWeek(value: string): { year: number; week: number } {
	const match = /^(\d{4})-W(\d{2})$/.exec(value.trim());
	if (!match) {
		throw new Error("Invalid week format. Use YYYY-WXX.");
	}
	const year = Number.parseInt(match[1], 10);
	const week = Number.parseInt(match[2], 10);
	if (!year || week < 1 || week > 53) {
		throw new Error("Invalid week format. Use YYYY-WXX.");
	}
	return { year, week };
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

function startOfIsoWeek(year: number, week: number): Date {
	const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
	const day = simple.getUTCDay();
	const start = new Date(simple);
	if (day <= 4) {
		start.setUTCDate(simple.getUTCDate() - day + 1);
	} else {
		start.setUTCDate(simple.getUTCDate() + 8 - day);
	}
	return new Date(
		start.getUTCFullYear(),
		start.getUTCMonth(),
		start.getUTCDate(),
	);
}

function normalizeDateInput(input?: string): string | null {
	if (!input) return null;
	const trimmed = input.trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
	return trimmed;
}

function dateFromYmd(value: string): Date {
	const [year, month, day] = value.split("-").map(Number);
	return new Date(year, month - 1, day);
}

function formatDate(date: Date): string {
	const pad = (value: number): string => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: Date, days: number): Date {
	const copy = new Date(date);
	copy.setDate(copy.getDate() + days);
	return copy;
}

function enumerateDates(startDate: string, endDate: string): string[] {
	const dates: string[] = [];
	let current = dateFromYmd(startDate);
	const end = dateFromYmd(endDate);
	while (current <= end) {
		dates.push(formatDate(current));
		current = addDays(current, 1);
	}
	return dates;
}

function previousWeekRange(
	startDate: string,
	endDate: string,
): {
	startDate: string;
	endDate: string;
} {
	const start = addDays(dateFromYmd(startDate), -7);
	const end = addDays(dateFromYmd(endDate), -7);
	return { startDate: formatDate(start), endDate: formatDate(end) };
}

async function collectCompletions(options: {
	dailyPath: string;
	todosPath: string;
	startDate: string;
	endDate: string;
}): Promise<CompletionRangeResult> {
	const daily = await collectDailyCompletions(
		options.dailyPath,
		options.startDate,
		options.endDate,
	);
	const todos = await collectCompletedTodos(
		options.todosPath,
		options.startDate,
		options.endDate,
	);
	const combined = mergeCompletions(daily.items, todos);
	return {
		items: combined,
		activeDays: daily.activeDays,
		missingDays: daily.missingDays,
	};
}

async function collectDailyCompletions(
	dailyPath: string,
	startDate: string,
	endDate: string,
): Promise<DailyScanResult> {
	const dates = enumerateDates(startDate, endDate);
	const items: CompletionItem[] = [];
	const activeDays = new Set<string>();
	const missingDays: string[] = [];

	for (const date of dates) {
		const notePath = path.join(dailyPath, `${date}.md`);
		let content: string | null = null;
		try {
			content = await readFile(notePath, "utf8");
		} catch {
			missingDays.push(formatDayLabel(date));
			continue;
		}

		const dayItems: CompletionItem[] = [];
		const doneEntries = extractDoneEntries(content);
		for (const entry of doneEntries) {
			dayItems.push({
				text: entry,
				normalized: normalizeCompletionText(entry),
				date,
				source: "daily",
			});
		}

		const checked = parseCheckboxes(content).filter((box) => box.checked);
		for (const checkbox of checked) {
			const text = checkbox.text.trim();
			if (!text) continue;
			dayItems.push({
				text,
				normalized: normalizeCompletionText(text),
				date,
				source: "daily",
			});
		}

		const deduped = mergeCompletions([], dayItems);
		if (deduped.length > 0) {
			activeDays.add(date);
			items.push(...deduped);
		}
	}

	return { items, activeDays, missingDays };
}

async function collectCompletedTodos(
	todosPath: string,
	startDate: string,
	endDate: string,
): Promise<CompletionItem[]> {
	const todoFiles = await findMarkdownFiles(todosPath);
	const items: CompletionItem[] = [];
	const start = dateFromYmd(startDate);
	const end = dateFromYmd(endDate);

	for (const todoPath of todoFiles) {
		const note = await readNote(todoPath);
		const status =
			coerceString(note.frontmatter.status)?.toLowerCase() ?? "active";
		if (status !== "completed") continue;

		const completedDate =
			resolveCompletionDate(note.frontmatter, note.content) ??
			(await resolveFileDate(todoPath));
		if (!completedDate) continue;

		const completed = dateFromYmd(completedDate);
		if (completed < start || completed > end) continue;

		const title = resolveTodoTitle(todoPath, note.frontmatter);
		const project = resolveProject(note.content);
		const category = resolveCategory(note.frontmatter);
		items.push({
			text: title,
			normalized: normalizeCompletionText(title),
			date: completedDate,
			project,
			category,
			source: "todo",
			link: createWikilink(title),
		});
	}

	return items;
}

function mergeCompletions(
	base: CompletionItem[],
	added: CompletionItem[],
): CompletionItem[] {
	const byKey = new Map<string, CompletionItem>();
	for (const item of base) {
		byKey.set(completionKey(item), { ...item });
	}
	for (const item of added) {
		const key = completionKey(item);
		const existing = byKey.get(key);
		if (!existing) {
			byKey.set(key, { ...item });
			continue;
		}
		if (!existing.project && item.project) existing.project = item.project;
		if (!existing.category && item.category) existing.category = item.category;
		if (!existing.link && item.link) existing.link = item.link;
		if (existing.source === "daily" && item.source === "todo") {
			existing.source = "todo";
			existing.date = item.date;
		}
	}
	return Array.from(byKey.values());
}

function extractDoneEntries(content: string): string[] {
	const lines = content.split("\n");
	const index = lines.findIndex((line) => DONE_MARKER.test(line.trim()));
	if (index === -1) return [];
	const entries: string[] = [];
	for (let i = index + 1; i < lines.length; i += 1) {
		const raw = lines[i];
		const trimmed = raw.trim();
		if (!trimmed) continue;
		if (HEADING_MARKER.test(trimmed) || EMPHASIS_MARKER.test(trimmed)) break;

		const checkboxMatch = CHECKBOX_PATTERN.exec(raw);
		if (checkboxMatch) {
			const checked = checkboxMatch[3].toLowerCase() === "x";
			const text = checkboxMatch[4]?.trim() ?? "";
			if (checked && text) entries.push(text);
			continue;
		}

		const bulletMatch = /^[-*]\s+(.*)$/.exec(trimmed);
		if (bulletMatch) {
			const text = bulletMatch[1].trim();
			if (text) entries.push(text);
			continue;
		}

		entries.push(trimmed);
	}
	return entries;
}

function resolveCompletionDate(
	frontmatter: Record<string, unknown>,
	content: string,
): string | null {
	const candidates = [
		frontmatter.completed,
		frontmatter.completed_at,
		frontmatter.completedAt,
		frontmatter.completed_on,
		frontmatter.completedOn,
		frontmatter.completion_date,
		frontmatter.completionDate,
		frontmatter.done,
		frontmatter.done_at,
		frontmatter.doneAt,
		frontmatter.closed,
		frontmatter.closed_at,
		frontmatter.closedAt,
		frontmatter.finished,
		frontmatter.finished_at,
		frontmatter.finishedAt,
	];

	for (const candidate of candidates) {
		const date = coerceDateInput(candidate);
		if (date) return date;
	}

	const match = /completed\s*[:=]\s*(\d{4}-\d{2}-\d{2})/i.exec(content);
	return match ? match[1] : null;
}

async function resolveFileDate(filePath: string): Promise<string | null> {
	try {
		const stats = await stat(filePath);
		if (Number.isNaN(stats.mtime.getTime())) return null;
		return formatDate(stats.mtime);
	} catch {
		return null;
	}
}

function resolveTodoTitle(
	todoPath: string,
	frontmatter: Record<string, unknown>,
): string {
	if (typeof frontmatter.title === "string" && frontmatter.title.trim()) {
		return frontmatter.title.trim();
	}
	return path.basename(todoPath, path.extname(todoPath));
}

function resolveProject(content: string): string | undefined {
	const sections = parseSections(content);
	const projectSection = sections.find((section) =>
		["project", "projects"].includes(section.heading.toLowerCase()),
	);
	if (!projectSection) return undefined;
	const links = parseWikilinks(projectSection.content);
	if (links.length === 0) return undefined;
	return links[0].target;
}

function resolveCategory(
	frontmatter: Record<string, unknown>,
): string | undefined {
	const candidates = [
		frontmatter.category,
		frontmatter.area,
		frontmatter.context,
	];
	for (const candidate of candidates) {
		if (typeof candidate === "string") {
			const normalized = candidate.trim().toLowerCase();
			if (["work", "home", "personal"].includes(normalized)) {
				return normalized;
			}
		}
	}

	const tags = normalizeTags(frontmatter.tags);
	for (const tag of tags) {
		if (["work", "home", "personal"].includes(tag)) {
			return tag;
		}
	}

	return undefined;
}

function normalizeTags(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.filter((tag): tag is string => typeof tag === "string")
			.map((tag) => tag.replace(/^#/, "").trim().toLowerCase())
			.filter(Boolean);
	}
	if (typeof value === "string") {
		return value
			.split(/[,\s]+/)
			.map((tag) => tag.replace(/^#/, "").trim().toLowerCase())
			.filter(Boolean);
	}
	return [];
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

function coerceString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function normalizeCompletionText(value: string): string {
	return value
		.replace(/\[\[([^\]]+)\]\]/g, "$1")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

function completionKey(item: CompletionItem): string {
	return `${item.normalized}::${item.date}`;
}

function groupByProject(
	items: CompletionItem[],
): Map<string, CompletionItem[]> {
	const groups = new Map<string, CompletionItem[]>();
	for (const item of items) {
		const label = item.project
			? createWikilink(item.project)
			: item.category
				? titleCase(item.category)
				: "General";
		if (!groups.has(label)) groups.set(label, []);
		groups.get(label)?.push(item);
	}
	return groups;
}

function groupByCategory(
	items: CompletionItem[],
): Map<string, CompletionItem[]> {
	const groups = new Map<string, CompletionItem[]>();
	for (const item of items) {
		const category = item.category ? titleCase(item.category) : "General";
		if (!groups.has(category)) groups.set(category, []);
		groups.get(category)?.push(item);
	}
	return groups;
}

function groupByDay(items: CompletionItem[]): Map<string, CompletionItem[]> {
	const groups = new Map<string, CompletionItem[]>();
	for (const item of items) {
		if (!groups.has(item.date)) groups.set(item.date, []);
		groups.get(item.date)?.push(item);
	}
	return groups;
}

function calculateStreak(dates: string[], activeDays: Set<string>): number {
	let current = 0;
	let best = 0;
	for (const date of dates) {
		if (activeDays.has(date)) {
			current += 1;
			if (current > best) best = current;
		} else {
			current = 0;
		}
	}
	return best;
}

function renderWeeklyRollup(options: {
	label: string;
	startDate: string;
	endDate: string;
	totalDays: number;
	completedCount: number;
	lastWeekCompletedCount: number;
	activeDays: number;
	missingDays: string[];
	projectsTouched: number;
	lastWeekProjectsTouched: number;
	dailyStreak: number;
	lastWeekStreak: number;
	byProject: Map<string, CompletionItem[]>;
	byCategory: Map<string, CompletionItem[]>;
	byDay: Map<string, CompletionItem[]>;
	now: Date;
}): string {
	const lines: string[] = [];
	lines.push(`# Weekly Rollup - ${options.label}`, "");
	lines.push(
		`*Week of ${formatWeekRange(options.startDate, options.endDate)}*`,
		"",
	);

	lines.push("## Summary");
	lines.push(`- Completed: ${options.completedCount} todos`);
	lines.push(`- Active days: ${options.activeDays}/${options.totalDays}`);
	lines.push(
		`- vs last week: ${formatDelta(options.completedCount - options.lastWeekCompletedCount)} todos`,
	);
	if (options.missingDays.length > 0) {
		lines.push(`- Missing daily notes: ${options.missingDays.join(", ")}`);
	}
	lines.push("");

	lines.push("## By Project", "");
	appendGroupedItems(lines, options.byProject, "No completions recorded");
	lines.push("");

	lines.push("## By Category", "");
	appendGroupedItems(lines, options.byCategory, "No completions recorded");
	lines.push("");

	lines.push("## By Day", "");
	appendGroupedItemsByDay(lines, options.byDay, "No completions recorded");
	lines.push("");

	lines.push("## Metrics");
	lines.push("| Metric | This Week | Last Week | Change |");
	lines.push("|--------|-----------|-----------|--------|");
	lines.push(
		`| Todos completed | ${options.completedCount} | ${options.lastWeekCompletedCount} | ${formatPercentChange(options.completedCount, options.lastWeekCompletedCount)} |`,
	);
	lines.push(
		`| Projects touched | ${options.projectsTouched} | ${options.lastWeekProjectsTouched} | ${formatDelta(options.projectsTouched - options.lastWeekProjectsTouched)} |`,
	);
	lines.push(
		`| Daily streak | ${options.dailyStreak} | ${options.lastWeekStreak} | ${formatDelta(options.dailyStreak - options.lastWeekStreak)} |`,
	);
	lines.push("");

	lines.push("---");
	lines.push(`*Generated: ${formatTimestamp(options.now)}*`);
	lines.push("");

	return lines.join("\n");
}

function appendGroupedItems(
	lines: string[],
	groups: Map<string, CompletionItem[]>,
	emptyMessage: string,
): void {
	if (groups.size === 0) {
		lines.push(`- ${emptyMessage}`);
		return;
	}

	for (const [label, items] of groups) {
		lines.push(`### ${label}`);
		for (const item of items) {
			const text = item.link ?? item.text;
			const prefix = item.source === "todo" ? "- [x]" : "-";
			lines.push(`${prefix} ${text}`);
		}
		lines.push("");
	}
	if (lines[lines.length - 1] === "") {
		lines.pop();
	}
}

function appendGroupedItemsByDay(
	lines: string[],
	groups: Map<string, CompletionItem[]>,
	emptyMessage: string,
): void {
	if (groups.size === 0) {
		lines.push(`- ${emptyMessage}`);
		return;
	}

	const dates = Array.from(groups.keys()).sort();
	for (const date of dates) {
		const label = formatDayLabel(date);
		const items = groups.get(date) ?? [];
		lines.push(`### ${label}`);
		for (const item of items) {
			const text = item.link ?? item.text;
			const prefix = item.source === "todo" ? "- [x]" : "-";
			lines.push(`${prefix} ${text}`);
		}
		lines.push("");
	}
	if (lines[lines.length - 1] === "") {
		lines.pop();
	}
}

function formatWeekRange(startDate: string, endDate: string): string {
	const start = dateFromYmd(startDate);
	const end = dateFromYmd(endDate);
	const formatter = new Intl.DateTimeFormat("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
	});
	const startLabel = formatter.format(start);
	const endLabel = formatter.format(end);
	return `${startLabel} - ${endLabel}`;
}

function formatDayLabel(date: string): string {
	const day = dateFromYmd(date);
	const formatter = new Intl.DateTimeFormat("en-US", {
		weekday: "long",
		month: "short",
		day: "numeric",
	});
	return `${formatter.format(day)} (${formatDate(day)})`;
}

function formatTimestamp(date: Date): string {
	const pad = (value: number): string => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDelta(value: number): string {
	if (value > 0) return `+${value}`;
	if (value < 0) return `${value}`;
	return "0";
}

function formatPercentChange(current: number, previous: number): string {
	if (previous === 0) {
		return current === 0 ? "0%" : "n/a";
	}
	const change = ((current - previous) / previous) * 100;
	const rounded = Math.round(change);
	return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function titleCase(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}
