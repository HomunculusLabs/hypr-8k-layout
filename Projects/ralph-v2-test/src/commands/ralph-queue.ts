import { stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { type CliOverrides, loadConfig } from "../lib/config";
import { parseCheckboxes } from "../lib/markdown/checkboxes";
import { findMarkdownFiles, readNote } from "../lib/markdown/files";
import { parseSections } from "../lib/markdown/sections";
import { parseWikilinks } from "../lib/markdown/wikilinks";
import { type OutputItem, type OutputOptions, output } from "../lib/output";

export type RalphQueueOutputMode = "console" | "queue" | "json";

export interface RalphQueueOptions {
	configPath?: string;
	vaultPath?: string;
	verbose?: boolean;
	json?: boolean;
	output?: RalphQueueOutputMode;
	maxTasks?: number;
	timeBudget?: string;
	project?: string;
	includeLowPriority?: boolean;
	explain?: boolean;
}

export interface RalphQueuePaths {
	vaultPath: string;
	todosPath: string;
	projectsPath: string;
	maxTasks: number;
	timeBudgetHours?: number;
	projectFilter?: string;
	includeLowPriority: boolean;
	now?: Date;
}

export interface RalphQueueTask {
	title: string;
	todoPath: string;
	priority: "high" | "medium" | "low";
	project?: RalphProjectInfo;
	specPath?: string;
	score: number;
	scoreReasons: string[];
	dueDate?: string;
	incomePotential: boolean;
	estimate: RalphEstimate;
}

export interface RalphEstimate {
	minHours: number;
	maxHours: number;
	averageHours: number;
	label: string;
}

export interface RalphProjectInfo {
	name: string;
	linkTarget: string;
	projectNotePath?: string;
	repoPath?: string;
}

export interface RalphQueueSkipped {
	title: string;
	reason: string;
	todoPath: string;
	project?: string;
}

export interface RalphQueueResult {
	tasks: RalphQueueTask[];
	skipped: RalphQueueSkipped[];
	warnings: string[];
	stats: RalphQueueStats;
}

export interface RalphQueueStats {
	totalCandidates: number;
	queued: number;
	blockedSkipped: number;
	noRalphSupportSkipped: number;
	totalEstimateHours: number;
	timeBudgetHours?: number;
}

interface CandidateData {
	todoPath: string;
	title: string;
	priority: "high" | "medium" | "low";
	project?: RalphProjectInfo;
	dueDate?: string;
	incomePotential: boolean;
	specPath?: string;
	hasSpec: boolean;
	estimate: RalphEstimate;
	score: number;
	scoreReasons: string[];
}

interface ProjectIndex {
	byName: Map<string, string>;
	byRelative: Map<string, string>;
}

const EXCLUDED_TAGS = new Set(["manual", "no-ralph"]);
const CHECKBOX_PATTERN = /^\s*[-*]\s+\[( |x|X)\]\s+/;

export async function runRalphQueue(options: RalphQueueOptions): Promise<void> {
	const config = await loadConfig(options.configPath, {
		vault: options.vaultPath,
		verbose: options.verbose,
		json: options.json,
	} satisfies CliOverrides);

	const outputOptions: OutputOptions = {
		format: config.output.format,
		color: config.output.color,
		verbose: config.output.verbose,
		quiet: false,
	};

	const outputMode = normalizeOutputMode(
		options.output ?? (options.json ? "json" : "console"),
		config.output.format,
	);

	const maxTasks = normalizeMaxTasks(options.maxTasks);
	const timeBudgetHours = parseTimeBudget(options.timeBudget);

	try {
		const result = await buildRalphQueue({
			vaultPath: config.vault.path,
			todosPath: config.vault.todosFolder,
			projectsPath: config.vault.projectsFolder,
			maxTasks,
			timeBudgetHours: timeBudgetHours ?? undefined,
			projectFilter: options.project,
			includeLowPriority: options.includeLowPriority ?? false,
		});

		if (outputMode === "json") {
			console.log(JSON.stringify(result, null, 2));
			return;
		}

		if (outputMode === "queue") {
			const queuePath = path.join(config.vault.path, "Ralph Queue.md");
			const queueText = formatQueueMarkdown(result, {
				generated: new Date(),
				timeBudgetHours: timeBudgetHours ?? undefined,
				explain: options.explain ?? false,
			});
			await writeFile(queuePath, queueText, "utf8");
			const items: OutputItem[] = result.warnings.map((warning) => ({
				type: "warning",
				message: warning,
			}));
			items.push({
				type: "success",
				message: "Ralph queue generated",
				details: `Queued ${result.stats.queued} task(s)`,
			});
			items.push({ type: "info", message: `Queue path: ${queuePath}` });
			output(items, { ...outputOptions, format: "console" });
			return;
		}

		const lines = formatQueueConsole(result, {
			explain: options.explain ?? false,
		});
		console.log(lines.join("\n"));
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		output([{ type: "error", message }], {
			...outputOptions,
			format: "console",
		});
		process.exitCode = 1;
	}
}

export async function buildRalphQueue(
	paths: RalphQueuePaths,
): Promise<RalphQueueResult> {
	const now = paths.now ?? new Date();
	const todoFiles = await findMarkdownFiles(paths.todosPath);
	const projectIndex = await buildProjectIndex(paths.projectsPath);

	const candidates: CandidateData[] = [];
	const skipped: RalphQueueSkipped[] = [];
	const warnings: string[] = [];

	for (const todoPath of todoFiles) {
		const note = await readNote(todoPath);
		const title = resolveTodoTitle(todoPath, note.frontmatter);

		if (isExcluded(note.frontmatter, note.content)) {
			skipped.push({
				title,
				todoPath,
				reason: "excluded by tag",
			});
			continue;
		}

		const status =
			coerceString(note.frontmatter.status)?.toLowerCase() ?? "active";
		if (status !== "active") {
			skipped.push({
				title,
				todoPath,
				reason: `status ${status}`,
			});
			continue;
		}

		const priority = resolvePriority(note.frontmatter.priority);
		if (priority === "low" && !paths.includeLowPriority) {
			skipped.push({
				title,
				todoPath,
				reason: "low priority",
			});
			continue;
		}

		const hasTasks = parseCheckboxes(note.content).some((box) =>
			CHECKBOX_PATTERN.test(box.raw),
		);
		if (!hasTasks) {
			skipped.push({
				title,
				todoPath,
				reason: "no tasks",
			});
			continue;
		}

		const project = extractProjectInfo(
			note.content,
			paths.projectsPath,
			projectIndex,
		);
		if (!project) {
			skipped.push({
				title,
				todoPath,
				reason: "missing project",
			});
			continue;
		}

		if (
			paths.projectFilter &&
			!matchesProjectFilter(project.name, paths.projectFilter)
		) {
			skipped.push({
				title,
				todoPath,
				reason: "project filter mismatch",
				project: project.name,
			});
			continue;
		}

		const projectNote = project.projectNotePath
			? await readNote(project.projectNotePath)
			: null;
		if (projectNote) {
			project.repoPath = resolveRepoPath(
				projectNote.frontmatter,
				project.projectNotePath,
			);
		}

		const repoPath = project.repoPath;
		if (!repoPath) {
			skipped.push({
				title,
				todoPath,
				reason: "missing repo path",
				project: project.name,
			});
			continue;
		}

		if (!(await fileExists(repoPath))) {
			skipped.push({
				title,
				todoPath,
				reason: "repo not found",
				project: project.name,
			});
			continue;
		}

		const agentsPath = path.join(repoPath, "AGENTS.md");
		if (!(await fileExists(agentsPath))) {
			skipped.push({
				title,
				todoPath,
				reason: "missing AGENTS.md",
				project: project.name,
			});
			continue;
		}

		const incomePotential = resolveIncomePotential(
			note.frontmatter,
			projectNote?.frontmatter,
		);

		const { specPath, hasSpec, specWarning } = await resolveSpecInfo(repoPath);
		if (specWarning) {
			warnings.push(specWarning);
		}

		const dueDate = coerceDateInput(
			note.frontmatter.due ?? note.frontmatter.due_date,
		);
		const estimate = resolveEstimate(note.frontmatter, priority);
		const { score, reasons } = scoreCandidate({
			priority,
			dueDate,
			incomePotential,
			hasSpec,
			now,
		});

		candidates.push({
			todoPath,
			title,
			priority,
			project,
			dueDate,
			incomePotential,
			specPath,
			hasSpec,
			estimate,
			score,
			scoreReasons: reasons,
		});
	}

	candidates.sort((a, b) => b.score - a.score);

	const tasks: RalphQueueTask[] = [];
	let totalEstimateHours = 0;
	for (const candidate of candidates) {
		if (tasks.length >= paths.maxTasks) break;
		const nextTotal = totalEstimateHours + candidate.estimate.averageHours;
		if (
			paths.timeBudgetHours !== undefined &&
			nextTotal > paths.timeBudgetHours
		) {
			continue;
		}
		totalEstimateHours = nextTotal;
		tasks.push({
			title: candidate.title,
			todoPath: candidate.todoPath,
			priority: candidate.priority,
			project: candidate.project,
			specPath: candidate.specPath,
			score: candidate.score,
			scoreReasons: candidate.scoreReasons,
			dueDate: candidate.dueDate ?? undefined,
			incomePotential: candidate.incomePotential,
			estimate: candidate.estimate,
		});
	}

	const stats = buildStats({
		totalCandidates: candidates.length,
		queued: tasks.length,
		skipped,
		totalEstimateHours,
		timeBudgetHours: paths.timeBudgetHours,
	});

	return { tasks, skipped, warnings, stats };
}

function normalizeOutputMode(
	value: RalphQueueOutputMode,
	defaultFormat: "console" | "json" | "markdown",
): RalphQueueOutputMode {
	if (value === "queue" || value === "json" || value === "console") {
		return value;
	}
	return defaultFormat === "json" ? "json" : "console";
}

function normalizeMaxTasks(maxTasks?: number): number {
	if (!maxTasks || Number.isNaN(maxTasks) || maxTasks <= 0) {
		return 5;
	}
	return Math.floor(maxTasks);
}

async function buildProjectIndex(projectsPath: string): Promise<ProjectIndex> {
	const projectFiles = await findMarkdownFiles(projectsPath);
	const byName = new Map<string, string>();
	const byRelative = new Map<string, string>();
	for (const file of projectFiles) {
		const name = path.basename(file, ".md");
		if (!byName.has(name.toLowerCase())) {
			byName.set(name.toLowerCase(), file);
		}
		const relative = path.relative(projectsPath, file).replace(/\\/g, "/");
		byRelative.set(relative.toLowerCase(), file);
	}
	return { byName, byRelative };
}

function extractProjectInfo(
	content: string,
	projectsPath: string,
	index: ProjectIndex,
): RalphProjectInfo | null {
	const section = findSection(content, "Project");
	if (!section) return null;
	const links = parseWikilinks(section.content);
	if (links.length === 0) return null;
	const link = links[0];
	const target = link.target.trim();
	if (!target) return null;

	const notePath = resolveProjectNotePath(target, projectsPath, index);
	const name = path.basename(target);

	return {
		name,
		linkTarget: target,
		projectNotePath: notePath ?? undefined,
	};
}

function resolveProjectNotePath(
	target: string,
	projectsPath: string,
	index: ProjectIndex,
): string | null {
	const normalized = target.replace(/\\/g, "/");
	if (normalized.includes("/")) {
		const relative = normalized.replace(/^\//, "");
		const direct = path.resolve(projectsPath, `${relative}.md`);
		if (index.byRelative.has(`${relative.toLowerCase()}.md`)) {
			return index.byRelative.get(`${relative.toLowerCase()}.md`) ?? null;
		}
		return direct;
	}

	return index.byName.get(normalized.toLowerCase()) ?? null;
}

function resolveRepoPath(
	frontmatter: Record<string, unknown>,
	projectNotePath: string,
): string | null {
	const candidate =
		coerceString(frontmatter.repo) ??
		coerceString(frontmatter.repo_path) ??
		coerceString(frontmatter.repoPath) ??
		coerceString(frontmatter.path) ??
		coerceString(frontmatter.repoPath) ??
		null;

	if (!candidate) return null;
	if (path.isAbsolute(candidate)) return candidate;
	return path.resolve(path.dirname(projectNotePath), candidate);
}

function resolveIncomePotential(
	todoFrontmatter: Record<string, unknown>,
	projectFrontmatter?: Record<string, unknown>,
): boolean {
	const todoValue =
		todoFrontmatter.income ??
		todoFrontmatter.income_potential ??
		todoFrontmatter.incomePotential;
	if (typeof todoValue === "boolean") return todoValue;
	const projectValue =
		projectFrontmatter?.income ??
		projectFrontmatter?.income_potential ??
		projectFrontmatter?.incomePotential;
	if (typeof projectValue === "boolean") return projectValue;
	return false;
}

async function resolveSpecInfo(
	repoPath: string,
): Promise<{ specPath?: string; hasSpec: boolean; specWarning?: string }> {
	const specsDir = path.join(repoPath, "specs");
	const planPath = path.join(repoPath, "IMPLEMENTATION_PLAN.md");
	const hasSpecsDir = await fileExists(specsDir);
	if (!hasSpecsDir) {
		return { hasSpec: false };
	}

	if (!(await fileExists(planPath))) {
		return { hasSpec: false };
	}

	try {
		const content = await Bun.file(planPath).text();
		const specName = findFirstUnimplementedSpec(content);
		if (!specName) {
			return { hasSpec: false };
		}
		const specPath = path.join(specsDir, specName);
		if (!(await fileExists(specPath))) {
			return { hasSpec: false };
		}
		return { hasSpec: true, specPath };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return {
			hasSpec: false,
			specWarning: `Unable to read plan at ${planPath}: ${message}`,
		};
	}
}

function findFirstUnimplementedSpec(plan: string): string | null {
	const lines = plan.split("\n");
	for (const line of lines) {
		const match = /^\s*-\s*\[ \]\s+.*\[([^\]]+\.md)\]/.exec(line);
		if (match) return match[1];
	}
	return null;
}

function resolveEstimate(
	frontmatter: Record<string, unknown>,
	priority: "high" | "medium" | "low",
): RalphEstimate {
	const estimateRaw =
		frontmatter.estimate ??
		frontmatter.est ??
		frontmatter.estimated_hours ??
		frontmatter.hours ??
		frontmatter.complexity;
	const parsed = parseEstimate(estimateRaw);
	if (parsed) return parsed;
	return defaultEstimate(priority);
}

function parseEstimate(raw: unknown): RalphEstimate | null {
	if (typeof raw === "number" && raw > 0) {
		return buildEstimate(raw, raw);
	}
	if (typeof raw !== "string") return null;
	const trimmed = raw.trim().toLowerCase();
	if (!trimmed) return null;

	const rangeMatch =
		/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)?$/.exec(
			trimmed,
		);
	if (rangeMatch) {
		const min = Number.parseFloat(rangeMatch[1]);
		const max = Number.parseFloat(rangeMatch[2]);
		const unit = rangeMatch[3] ?? "h";
		return buildEstimate(convertToHours(min, unit), convertToHours(max, unit));
	}

	const singleMatch =
		/^(\d+(?:\.\d+)?)(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)?$/.exec(
			trimmed,
		);
	if (singleMatch) {
		const value = Number.parseFloat(singleMatch[1]);
		const unit = singleMatch[2] ?? "h";
		const hours = convertToHours(value, unit);
		return buildEstimate(hours, hours);
	}

	return null;
}

function convertToHours(value: number, unit: string): number {
	if (unit.startsWith("m")) {
		return value / 60;
	}
	return value;
}

function buildEstimate(minHours: number, maxHours: number): RalphEstimate {
	const min = Math.max(minHours, 0.1);
	const max = Math.max(maxHours, min);
	const average = (min + max) / 2;
	return {
		minHours: min,
		maxHours: max,
		averageHours: average,
		label: formatEstimateLabel(min, max),
	};
}

function defaultEstimate(priority: "high" | "medium" | "low"): RalphEstimate {
	if (priority === "high") return buildEstimate(2, 4);
	if (priority === "medium") return buildEstimate(1, 2);
	return buildEstimate(0.5, 1);
}

function formatEstimateLabel(min: number, max: number): string {
	const format = (value: number): string => {
		if (Number.isInteger(value)) return String(value);
		return value.toFixed(1).replace(/\.0$/, "");
	};
	if (Math.abs(min - max) < 0.05) {
		return `${format(min)} hour${min === 1 ? "" : "s"}`;
	}
	return `${format(min)}-${format(max)} hours`;
}

function scoreCandidate(input: {
	priority: "high" | "medium" | "low";
	dueDate?: string | null;
	incomePotential: boolean;
	hasSpec: boolean;
	now: Date;
}): { score: number; reasons: string[] } {
	let score = 0;
	const reasons: string[] = [];
	const priorityWeight =
		input.priority === "high" ? 3 : input.priority === "medium" ? 2 : 1;
	const priorityLabel = `${input.priority} priority`;
	score += priorityWeight;
	reasons.push(priorityLabel);

	const dueStatus = resolveDueStatus(input.dueDate, input.now);
	if (dueStatus === "overdue") {
		score += 2;
		reasons.push("overdue");
	} else if (dueStatus === "today") {
		score += 1;
		reasons.push("due today");
	}

	if (input.hasSpec) {
		score += 1;
		reasons.push("has spec");
	}
	if (input.incomePotential) {
		score += 1;
		reasons.push("income potential");
	}

	return { score, reasons };
}

function resolveDueStatus(
	dueDate?: string | null,
	now?: Date,
): "overdue" | "today" | null {
	if (!dueDate) return null;
	const date = parseDate(dueDate);
	if (!date) return null;
	const current = startOfDay(now ?? new Date());
	const dueDay = startOfDay(date);
	if (dueDay.getTime() < current.getTime()) return "overdue";
	if (dueDay.getTime() === current.getTime()) return "today";
	return null;
}

function parseDate(value: string): Date | null {
	const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
	if (!match) return null;
	const [year, month, day] = match[1].split("-").map(Number);
	if (!year || !month || !day) return null;
	return new Date(year, month - 1, day);
}

function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function buildStats(input: {
	totalCandidates: number;
	queued: number;
	skipped: RalphQueueSkipped[];
	totalEstimateHours: number;
	timeBudgetHours?: number;
}): RalphQueueStats {
	const blockedSkipped = input.skipped.filter((item) =>
		item.reason.includes("status blocked"),
	).length;
	const noRalphSupportSkipped = input.skipped.filter(
		(item) => item.reason.includes("AGENTS") || item.reason.includes("repo"),
	).length;

	return {
		totalCandidates: input.totalCandidates,
		queued: input.queued,
		blockedSkipped,
		noRalphSupportSkipped,
		totalEstimateHours: input.totalEstimateHours,
		timeBudgetHours: input.timeBudgetHours,
	};
}

function formatQueueMarkdown(
	result: RalphQueueResult,
	options: { generated: Date; timeBudgetHours?: number; explain: boolean },
): string {
	const lines: string[] = [];
	lines.push("# Ralph Queue", "");
	lines.push(`*Generated: ${formatDate(options.generated)}*`);
	if (options.timeBudgetHours !== undefined) {
		lines.push(`*Time Budget: ${options.timeBudgetHours} hours*`);
	}
	lines.push("", "## Next Up", "");

	if (result.tasks.length === 0) {
		lines.push("No queued tasks.", "");
	} else {
		result.tasks.forEach((task, index) => {
			lines.push(`### ${index + 1}. ${task.title}`);
			if (task.project) {
				lines.push(`- **Project**: [[${task.project.linkTarget}]]`);
			}
			if (task.project?.repoPath) {
				lines.push(`- **Repo**: \`${task.project.repoPath}\``);
			}
			const scoreReason = options.explain
				? ` (${task.scoreReasons.join(" + ")})`
				: "";
			lines.push(`- **Score**: ${task.score}${scoreReason}`);
			if (task.specPath) {
				lines.push(`- **Spec**: \`${task.specPath}\``);
			}
			lines.push(`- **Est. Time**: ${task.estimate.label}`, "");
		});
	}

	if (result.skipped.length > 0) {
		lines.push("## Skipped", "");
		for (const item of result.skipped) {
			const label = item.project
				? `[[${item.title}]] (${item.project})`
				: `[[${item.title}]]`;
			lines.push(`- ${label} - ${item.reason}`);
		}
		lines.push("");
	}

	lines.push("## Queue Stats", "");
	lines.push(`- Total candidates: ${result.stats.totalCandidates}`);
	lines.push(`- Queued: ${result.stats.queued}`);
	lines.push(`- Skipped (blocked): ${result.stats.blockedSkipped}`);
	lines.push(
		`- Skipped (no Ralph support): ${result.stats.noRalphSupportSkipped}`,
	);
	lines.push(
		`- Estimated total time: ${result.stats.totalEstimateHours.toFixed(1)} hours`,
	);

	return lines.join("\n");
}

function formatQueueConsole(
	result: RalphQueueResult,
	options: { explain: boolean },
): string[] {
	const lines: string[] = [];
	if (result.tasks.length === 0) {
		lines.push("No queued tasks found.");
	} else {
		lines.push("Ralph queue:");
		for (const [index, task] of result.tasks.entries()) {
			const project = task.project?.name ?? "Unknown project";
			const scoreReason = options.explain
				? ` (${task.scoreReasons.join(" + ")})`
				: "";
			lines.push(
				`${index + 1}. ${task.title} [${project}] score ${task.score}${scoreReason}`,
			);
			if (task.specPath) {
				lines.push(`   spec: ${task.specPath}`);
			}
			lines.push(`   est: ${task.estimate.label}`);
		}
	}

	if (result.skipped.length > 0) {
		lines.push("", "Skipped:");
		for (const item of result.skipped) {
			lines.push(`- ${item.title}: ${item.reason}`);
		}
	}

	lines.push("", "Stats:");
	lines.push(`- candidates: ${result.stats.totalCandidates}`);
	lines.push(`- queued: ${result.stats.queued}`);
	lines.push(
		`- total est hours: ${result.stats.totalEstimateHours.toFixed(1)}`,
	);
	return lines;
}

function findSection(content: string, heading: string) {
	const sections = parseSections(content);
	return sections.find(
		(section) => section.heading.toLowerCase() === heading.toLowerCase(),
	);
}

function resolveTodoTitle(
	todoPath: string,
	frontmatter: Record<string, unknown>,
): string {
	const frontmatterTitle = coerceString(frontmatter.title);
	if (frontmatterTitle) return frontmatterTitle;
	return path.basename(todoPath, path.extname(todoPath));
}

function resolvePriority(value: unknown): "high" | "medium" | "low" {
	const normalized = coerceString(value)?.toLowerCase();
	if (
		normalized === "high" ||
		normalized === "medium" ||
		normalized === "low"
	) {
		return normalized;
	}
	return "low";
}

function coerceString(value: unknown): string | null {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length ? trimmed : null;
	}
	return null;
}

function isExcluded(
	frontmatter: Record<string, unknown>,
	content: string,
): boolean {
	const tags = normalizeTags(frontmatter.tags);
	if ([...tags].some((tag) => EXCLUDED_TAGS.has(tag))) return true;
	return /#(manual|no-ralph)\b/i.test(content);
}

function normalizeTags(raw: unknown): Set<string> {
	const tags = new Set<string>();
	if (Array.isArray(raw)) {
		for (const tag of raw) {
			if (typeof tag === "string") tags.add(tag.toLowerCase());
		}
		return tags;
	}
	if (typeof raw === "string") {
		for (const tag of raw.split(/[,\s]+/)) {
			const trimmed = tag.trim();
			if (!trimmed) continue;
			tags.add(trimmed.toLowerCase());
		}
	}
	return tags;
}

function matchesProjectFilter(name: string, filter: string): boolean {
	const normalized = name.toLowerCase();
	return normalized.includes(filter.toLowerCase());
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

function formatDate(date: Date): string {
	const pad = (value: number): string => String(value).padStart(2, "0");
	const year = date.getFullYear();
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());
	return `${year}-${month}-${day}`;
}

function parseTimeBudget(value?: string): number | null {
	if (!value) return null;
	const trimmed = value.trim().toLowerCase();
	if (!trimmed) return null;

	const match =
		/^(\d+(?:\.\d+)?)(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)?$/.exec(
			trimmed,
		);
	if (!match) return null;
	const amount = Number.parseFloat(match[1]);
	const unit = match[2] ?? "h";
	if (unit.startsWith("m")) return amount / 60;
	return amount;
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await stat(filePath);
		return true;
	} catch {
		return false;
	}
}
