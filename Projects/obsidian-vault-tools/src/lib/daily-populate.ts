import path from "node:path";
import type { VaultAdapter } from "./adapters";
import { MARKDOWN } from "./constants";
import { parseCheckboxes } from "./markdown/checkboxes";
import { findMarkdownFiles, readNote, writeNote } from "./markdown/files";
import { getSection, parseSections } from "./markdown/sections";

export interface DailyPopulatePaths {
	adapter: VaultAdapter;
	vaultPath: string;
	todosPath: string;
	projectsPath: string;
	dailyPath: string;
	templatePath: string;
	date: string;
	create?: boolean;
	dryRun?: boolean;
	skip?: Set<string>;
}

export interface DailyPopulateResult {
	notePath: string;
	focusItems: number;
	blockedItems: number;
	rolloverItems: number;
	ralphItems: number;
	created: boolean;
	updated: boolean;
	warnings: string[];
	dryRun: boolean;
}

interface ScheduledTodo {
	title: string;
	due: string;
	overdue: boolean;
}

interface BlockedTodo {
	title: string;
	reason?: string;
}

interface RalphTask {
	project: string;
	task: string;
}

const CHECKBOX_PATTERN = /^(\s*)([-*])\s+\[( |x|X)\]\s*(.*)$/;
const SECTION_FOCUS = "Today's Focus";
const SECTION_TASKS = "Tasks";
const SECTION_RALPH = "Ralph Status";
const SECTION_BLOCKED = "Blocked";
const FOCUS_PLACEHOLDER = "- Nothing scheduled";
const ROLLOVER_INTRO = "<!-- Rolled over from yesterday -->";

export async function populateDailyNote(
	paths: DailyPopulatePaths,
): Promise<DailyPopulateResult> {
	const warnings: string[] = [];
	const targetDate = normalizeDateInput(paths.date);
	if (!targetDate) {
		throw new Error(`Invalid date: ${paths.date}`);
	}

	const notePath = path.join(paths.dailyPath, `${targetDate}.md`);
	const { note, created } = await loadDailyNote({
		adapter: paths.adapter,
		notePath,
		templatePath: paths.templatePath,
		targetDate,
		create: paths.create,
	});

	const todos = await findScheduledTodos(
		paths.adapter,
		paths.todosPath,
		targetDate,
		warnings,
	);
	const blocked = await findBlockedTodos(paths.adapter, paths.todosPath);
	const ralphTasks = await findRalphTasks(paths.adapter, paths.projectsPath);

	const rollover =
		paths.skip?.has("rollover") || paths.skip?.has("tasks")
			? []
			: await findRolloverTasks(
					paths.adapter,
					paths.dailyPath,
					targetDate,
				);

	const lines = note.content.split("\n");
	let updated = false;
	let focusCount = 0;
	let blockedCount = 0;
	let rolloverCount = 0;
	let ralphCount = 0;

	if (!paths.skip?.has("focus")) {
		const focusLines = buildFocusLines(todos);
		focusCount = focusLines.length;
		const merged = mergeSection(lines, SECTION_FOCUS, focusLines, {
			placeholder: FOCUS_PLACEHOLDER,
		});
		if (merged.updated) updated = true;
		lines.splice(0, lines.length, ...merged.lines);
	}

	if (!paths.skip?.has("blocked")) {
		const blockedLines = buildBlockedLines(blocked);
		blockedCount = blockedLines.length;
		const merged = mergeSection(lines, SECTION_BLOCKED, blockedLines);
		if (merged.updated) updated = true;
		lines.splice(0, lines.length, ...merged.lines);
	}

	if (!paths.skip?.has("ralph")) {
		const ralphLines = buildRalphLines(ralphTasks);
		ralphCount = ralphLines.length;
		const merged = mergeSection(lines, SECTION_RALPH, ralphLines);
		if (merged.updated) updated = true;
		lines.splice(0, lines.length, ...merged.lines);
	}

	if (!paths.skip?.has("tasks")) {
		const taskLines = buildRolloverLines(rollover);
		rolloverCount = taskLines.length;
		const merged = mergeSection(lines, SECTION_TASKS, taskLines, {
			intro: ROLLOVER_INTRO,
		});
		if (merged.updated) updated = true;
		lines.splice(0, lines.length, ...merged.lines);
	}

	if ((updated || created) && !paths.dryRun) {
		note.content = lines.join("\n");
		await writeNote(paths.adapter, notePath, note);
	}

	return {
		notePath,
		focusItems: focusCount,
		blockedItems: blockedCount,
		rolloverItems: rolloverCount,
		ralphItems: ralphCount,
		created,
		updated,
		warnings,
		dryRun: Boolean(paths.dryRun),
	};
}

export function normalizeDateInput(input?: string): string | null {
	if (!input) return null;
	const trimmed = input.trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
	return trimmed;
}

export function formatDate(date: Date): string {
	const pad = (value: number): string => String(value).padStart(2, "0");
	const year = date.getFullYear();
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());
	return `${year}-${month}-${day}`;
}

async function loadDailyNote(options: {
	adapter: VaultAdapter;
	notePath: string;
	templatePath: string;
	targetDate: string;
	create?: boolean;
}): Promise<{
	note: { frontmatter: Record<string, unknown>; content: string };
	created: boolean;
}> {
	const exists = await options.adapter.fileExists(options.notePath);
	if (exists) {
		const note = await readNote(options.adapter, options.notePath);
		return { note, created: false };
	}

	if (!options.create) {
		throw new Error(`Daily note not found: ${options.notePath}`);
	}

	const template = await readOptionalFile(
		options.adapter,
		options.templatePath,
	);
	const content = template
		? applyTemplate(template, options.targetDate)
		: buildDefaultTemplate(options.targetDate);
	const note = { frontmatter: {}, content };
	return { note, created: true };
}

async function findScheduledTodos(
	adapter: VaultAdapter,
	todosPath: string,
	targetDate: string,
	warnings: string[],
): Promise<ScheduledTodo[]> {
	const todoFiles = await findMarkdownFiles(adapter, todosPath);
	const items: ScheduledTodo[] = [];
	const targetValue = dateValue(targetDate);

	for (const todoPath of todoFiles) {
		const note = await readNote(adapter, todoPath);
		const dueRaw = note.frontmatter.due;
		const due = coerceDateInput(dueRaw);
		if (!due) {
			if (dueRaw !== undefined && dueRaw !== null && String(dueRaw).trim()) {
				warnings.push(`Invalid due date in ${todoPath}`);
			}
			continue;
		}

		const dueValue = dateValue(due);
		if (dueValue > targetValue) {
			continue;
		}

		const title = resolveTodoTitle(todoPath, note.frontmatter);
		items.push({
			title,
			due,
			overdue: dueValue < targetValue,
		});
	}

	items.sort((a, b) => {
		if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
		return a.due.localeCompare(b.due);
	});

	return items;
}

async function findBlockedTodos(
	adapter: VaultAdapter,
	todosPath: string,
): Promise<BlockedTodo[]> {
	const todoFiles = await findMarkdownFiles(adapter, todosPath);
	const blocked: BlockedTodo[] = [];

	for (const todoPath of todoFiles) {
		const note = await readNote(adapter, todoPath);
		const status = note.frontmatter.status;
		if (typeof status !== "string" || status.toLowerCase() !== "blocked") {
			continue;
		}

		const reason =
			resolveBlockerReason(note.frontmatter) ??
			resolveBlockerReasonFromContent(note.content);

		blocked.push({
			title: resolveTodoTitle(todoPath, note.frontmatter),
			reason: reason ?? undefined,
		});
	}

	return blocked;
}

async function findRolloverTasks(
	adapter: VaultAdapter,
	dailyPath: string,
	targetDate: string,
): Promise<string[]> {
	const previousDate = formatDate(addDays(dateFromYmd(targetDate), -1));
	const previousPath = path.join(dailyPath, `${previousDate}.md`);
	if (!(await adapter.fileExists(previousPath))) {
		return [];
	}

	const previousNote = await readNote(adapter, previousPath);
	const section = getSection(previousNote.content, SECTION_TASKS);
	if (!section) {
		return [];
	}

	const checkboxes = parseCheckboxes(section.content);
	const lines = section.content.split("\n");
	const rollover: string[] = [];
	for (const checkbox of checkboxes) {
		if (checkbox.checked) continue;
		const line = lines[checkbox.line - 1]?.trimEnd();
		if (line) {
			rollover.push(line);
		}
	}

	return rollover;
}

async function findRalphTasks(
	adapter: VaultAdapter,
	projectsPath: string,
): Promise<RalphTask[]> {
	const projectFiles = await findMarkdownFiles(adapter, projectsPath);
	const planFiles = projectFiles.filter(
		(file) => path.basename(file) === "IMPLEMENTATION_PLAN.md",
	);
	const tasks: RalphTask[] = [];

	for (const planPath of planFiles) {
		const content = await adapter.readFile(planPath);
		const lines = content.split("\n");
		const project = path.basename(path.dirname(planPath));

		for (const line of lines) {
			if (!CHECKBOX_PATTERN.test(line)) continue;
			const match = CHECKBOX_PATTERN.exec(line);
			if (!match) continue;
			const checked = match[3].toLowerCase() === "x";
			if (checked) continue;
			const task = (match[4] ?? "").trim();
			if (!task) continue;
			tasks.push({ project, task });
		}
	}

	return tasks;
}

function buildFocusLines(todos: ScheduledTodo[]): string[] {
	if (todos.length === 0) return [];
	return todos.map((todo) => `- [ ] [[${todo.title}]] (due: ${todo.due})`);
}

function buildBlockedLines(blocked: BlockedTodo[]): string[] {
	return blocked.map((todo) =>
		todo.reason
			? `- [[${todo.title}]] - ${todo.reason}`
			: `- [[${todo.title}]]`,
	);
}

function buildRalphLines(tasks: RalphTask[]): string[] {
	return tasks.map((task) => `- \`${task.project}\`: ${task.task}`);
}

function buildRolloverLines(rollover: string[]): string[] {
	return rollover.map((line) => line.trimEnd());
}

function mergeSection(
	lines: string[],
	heading: string,
	newLines: string[],
	options?: { placeholder?: string; intro?: string },
): { lines: string[]; updated: boolean } {
	const content = lines.join("\n");
	const sections = parseSections(content);
	const existing = sections.find((section) => section.heading === heading);
	const normalizedNew = newLines.filter((line) => line.trim().length > 0);
	let updated = false;

	if (!existing) {
		const appended = [...lines];
		if (appended.length > 0 && appended[appended.length - 1] !== "") {
			appended.push("");
		}
		appended.push(`## ${heading}`, "");
		if (normalizedNew.length > 0) {
			appended.push(...normalizedNew);
		} else if (options?.placeholder) {
			appended.push(options.placeholder);
		}
		updated = normalizedNew.length > 0 || Boolean(options?.placeholder);
		return { lines: appended, updated };
	}

	const startIndex = existing.startLine;
	const endExclusive =
		existing.content.length > 0 ? existing.endLine + 1 : existing.startLine;
	const existingLines = lines.slice(startIndex, endExclusive);
	const existingTrimmed = new Set(
		existingLines.map((line) => line.trim()).filter(Boolean),
	);
	const toAdd = normalizedNew.filter(
		(line) => !existingTrimmed.has(line.trim()),
	);

	if (toAdd.length === 0 && !options?.placeholder) {
		return { lines, updated: false };
	}

	const merged = [...existingLines];
	const hasContent = merged.some((line) => line.trim().length > 0);

	if (!hasContent && toAdd.length === 0 && options?.placeholder) {
		merged.push(options.placeholder);
		updated = true;
	} else if (toAdd.length > 0) {
		const intro = options?.intro;
		if (intro && !existingTrimmed.has(intro)) {
			if (hasContent && merged[merged.length - 1]?.trim().length > 0) {
				merged.push("");
			}
			merged.push(intro);
		}

		if (merged.length > 0 && merged[merged.length - 1]?.trim().length > 0) {
			merged.push("");
		}
		merged.push(...toAdd);
		updated = true;
	}

	const updatedLines = [...lines];
	updatedLines.splice(startIndex, endExclusive - startIndex, ...merged);
	return { lines: updatedLines, updated };
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

function resolveBlockerReasonFromContent(content: string): string | null {
	const section = getSection(content, SECTION_BLOCKED);
	if (!section) return null;
	const lines = section.content
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	return lines.length > 0 ? lines[0] : null;
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

function dateValue(value: string): number {
	return dateFromYmd(value).getTime();
}

function formatTimestamp(date: Date): string {
	const pad = (value: number): string => String(value).padStart(2, "0");
	const year = date.getFullYear();
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());
	const hours = pad(date.getHours());
	const minutes = pad(date.getMinutes());
	return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function addDays(date: Date, days: number): Date {
	const copy = new Date(date);
	copy.setDate(copy.getDate() + days);
	return copy;
}

function applyTemplate(template: string, date: string): string {
	return template.replaceAll("{{date}}", date).replaceAll("{{title}}", date);
}

function buildDefaultTemplate(date: string): string {
	return [
		MARKDOWN.frontmatterDelimiter,
		`created: ${formatTimestamp(new Date())}`,
		"tags: [daily-note]",
		MARKDOWN.frontmatterDelimiter,
		"",
		`# ${date}`,
		"",
		`## ${SECTION_FOCUS}`,
		"",
		`## ${SECTION_TASKS}`,
		"",
		`## ${SECTION_RALPH}`,
		"",
		`## ${SECTION_BLOCKED}`,
		"",
		"## Habits",
		"- [ ] Morning mantra/meditation",
		"- [ ] Reading session",
		"- [ ] Exercise",
		"",
		"## Evening",
		"**Done:**",
		"-",
		"",
		"**Tomorrow:**",
		"-",
		"",
		"**Notes:**",
		"",
	].join("\n");
}

async function readOptionalFile(
	adapter: VaultAdapter,
	filePath: string,
): Promise<string | null> {
	if (!(await adapter.fileExists(filePath))) return null;
	try {
		return await adapter.readFile(filePath);
	} catch {
		return null;
	}
}
