import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { coerceBool, coerceDate } from "./coerce";
import { readNote } from "./markdown/files";
import { parseSections } from "./markdown/sections";
import { parseWikilinks } from "./markdown/wikilinks";

export interface ProjectHealthPaths {
	projectsPath: string;
	todosPath: string;
	statusFilter?: string;
	sort?: string;
	now?: Date;
}

export interface ProjectHealthResult {
	generated: string;
	summary: ProjectHealthSummary;
	projects: ProjectHealthProject[];
	groups: ProjectHealthGroups;
	recommendations: ProjectHealthRecommendations;
}

export interface ProjectHealthSummary {
	total: number;
	active: number;
	healthy: number;
	warning: number;
	critical: number;
	blocked: number;
}

export interface ProjectHealthGroups {
	critical: ProjectHealthProject[];
	warning: ProjectHealthProject[];
	healthy: ProjectHealthProject[];
	paused: ProjectHealthProject[];
}

export interface ProjectHealthRecommendations {
	shipIt: ProjectHealthProject[];
	needsAttention: ProjectHealthProject[];
	considerArchiving: ProjectHealthProject[];
}

export interface ProjectHealthProject {
	name: string;
	path?: string;
	folder?: string;
	status: string;
	lastTouched?: Date | null;
	lastTouchedLabel: string;
	stalenessDays?: number | null;
	hasNextAction: boolean;
	blockers: number;
	openTasks: number;
	incomePotential: boolean;
	healthScore: number;
	healthCategory: "healthy" | "warning" | "critical" | "paused";
	priority: "high" | "medium" | "low";
	issues: string[];
}

interface ProjectCandidateNote {
	path: string;
	folder: string;
}

interface ProjectCandidatePlan {
	path: string;
	folder: string;
}

interface NoteIndex {
	byName: Map<string, string>;
	byRelative: Map<string, string>;
}

const STALE_DAYS_THRESHOLD = 30;
const PLAN_FILENAME = "IMPLEMENTATION_PLAN.md";
const DASHBOARD_TITLE = "Projects Health Dashboard";

export async function buildProjectHealth(
	paths: ProjectHealthPaths,
): Promise<ProjectHealthResult> {
	const now = paths.now ?? new Date();
	const { notes, plans } = await discoverProjectCandidates(paths.projectsPath);
	const planByFolder = new Map<string, ProjectCandidatePlan>();
	for (const plan of plans) {
		planByFolder.set(plan.folder, plan);
	}
	const todoIndex = await buildNoteIndex(paths.todosPath);
	const projects: ProjectHealthProject[] = [];

	for (const note of notes) {
		const parsed = await readNote(note.path);
		const fileStats = await stat(note.path);
		const status = resolveStatus(parsed.frontmatter);
		const name = resolveProjectName(note.path, parsed.frontmatter);
		const lastTouched = resolveLastTouched(parsed.frontmatter, fileStats);
		const stalenessDays = lastTouched ? daysBetween(now, lastTouched) : null;
		const lastTouchedLabel = formatLastTouched(lastTouched, stalenessDays);
		const hasNextAction = resolveHasNextAction(
			parsed.frontmatter,
			parsed.content,
		);
		const priority = resolvePriority(parsed.frontmatter);
		const incomePotential = resolveIncomePotential(parsed.frontmatter);

		const linkedTodos = await analyzeLinkedTodos(parsed.content, todoIndex);

		const frontmatterBlockers = resolveBlockerCount(parsed.frontmatter);
		const blockers = frontmatterBlockers + linkedTodos.blockedCount;

		let openTasks = resolveOpenTasks(parsed.frontmatter);
		const plan = planByFolder.get(note.folder);
		if (plan) {
			const planOpenTasks = await countOpenTasksInPlan(plan.path);
			if (planOpenTasks > 0 || openTasks === null) {
				openTasks = planOpenTasks;
			}
			planByFolder.delete(note.folder);
		}
		if (openTasks === null) {
			openTasks = linkedTodos.openCount;
		}

		const { score, category, issues } = scoreProject({
			status,
			stalenessDays,
			hasNextAction,
			blockers,
			lastTouched,
		});

		projects.push({
			name,
			path: note.path,
			folder: note.folder,
			status,
			lastTouched,
			lastTouchedLabel,
			stalenessDays,
			hasNextAction,
			blockers,
			openTasks: openTasks ?? 0,
			incomePotential,
			healthScore: score,
			healthCategory: category,
			priority,
			issues,
		});
	}

	for (const plan of planByFolder.values()) {
		const fileStats = await stat(plan.path);
		const name = path.basename(plan.folder);
		const status = "active";
		const lastTouched = resolveLastTouched({}, fileStats);
		const stalenessDays = lastTouched ? daysBetween(now, lastTouched) : null;
		const lastTouchedLabel = formatLastTouched(lastTouched, stalenessDays);
		const openTasks = await countOpenTasksInPlan(plan.path);
		const { score, category, issues } = scoreProject({
			status,
			stalenessDays,
			hasNextAction: false,
			blockers: 0,
			lastTouched,
		});

		projects.push({
			name,
			folder: plan.folder,
			status,
			lastTouched,
			lastTouchedLabel,
			stalenessDays,
			hasNextAction: false,
			blockers: 0,
			openTasks,
			incomePotential: false,
			healthScore: score,
			healthCategory: category,
			priority: "medium",
			issues,
		});
	}

	const filtered = applyStatusFilter(projects, paths.statusFilter);
	const sorted = sortProjects(filtered, paths.sort);
	const groups = groupProjects(sorted);
	const summary = buildSummary(groups, sorted);
	const recommendations = buildRecommendations(sorted);

	return {
		generated: formatDate(now),
		summary,
		projects: sorted,
		groups,
		recommendations,
	};
}

export function formatDashboardMarkdown(result: ProjectHealthResult): string {
	const lines: string[] = [];
	lines.push(`# ${DASHBOARD_TITLE}`, "");
	lines.push(`*Generated: ${result.generated}*`, "");
	lines.push("## Summary");
	lines.push(`- Total projects: ${result.summary.total}`);
	lines.push(`- Active: ${result.summary.active}`);
	lines.push(
		`- Healthy: ${result.summary.healthy} | Warning: ${result.summary.warning} | Critical: ${result.summary.critical}`,
	);
	lines.push(`- Blocked: ${result.summary.blocked}`, "");

	lines.push("## Critical (Needs Immediate Attention)");
	lines.push(...formatProjectTable(result.groups.critical, "issues"));
	lines.push("");

	lines.push("## Warning");
	lines.push(...formatProjectTable(result.groups.warning, "issues"));
	lines.push("");

	lines.push("## Healthy");
	lines.push(...formatProjectTable(result.groups.healthy, "health"));
	lines.push("");

	lines.push("## Paused/Archived");
	if (result.groups.paused.length === 0) {
		lines.push("- None", "");
	} else {
		for (const project of result.groups.paused) {
			lines.push(`- ${formatProjectLink(project)} - ${project.status}`);
		}
		lines.push("");
	}

	lines.push("## Recommendations", "");
	lines.push("### Ship It! (Ready to go)");
	lines.push(...formatRecommendationList(result.recommendations.shipIt));
	lines.push("");
	lines.push("### Needs Attention");
	lines.push(
		...formatRecommendationList(result.recommendations.needsAttention),
	);
	lines.push("");
	lines.push("### Consider Archiving");
	lines.push(
		...formatRecommendationList(result.recommendations.considerArchiving),
	);
	lines.push("");
	lines.push("---");
	lines.push("*Health scores: healthy >70 | warning 40-70 | critical <40*");

	return lines.join("\n");
}

async function discoverProjectCandidates(projectsPath: string): Promise<{
	notes: ProjectCandidateNote[];
	plans: ProjectCandidatePlan[];
}> {
	const notes: ProjectCandidateNote[] = [];
	const plans: ProjectCandidatePlan[] = [];
	const visited = new Set<string>();

	async function walk(dir: string): Promise<void> {
		let realDir: string;
		try {
			realDir = await Bun.realpath(dir);
		} catch {
			realDir = dir;
		}
		if (visited.has(realDir)) return;
		visited.add(realDir);

		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const entryPath = path.join(dir, entry.name);
			let statInfo: {
				isDirectory: () => boolean;
				isFile: () => boolean;
			} | null = null;
			if (entry.isSymbolicLink()) {
				try {
					const linked = await stat(entryPath);
					statInfo = linked;
				} catch {
					statInfo = null;
				}
			}
			const isDir = entry.isDirectory() || statInfo?.isDirectory();
			const isFile = entry.isFile() || statInfo?.isFile();

			if (isDir) {
				await walk(entryPath);
				continue;
			}
			if (!isFile) continue;
			if (path.extname(entry.name).toLowerCase() !== ".md") continue;

			if (entry.name === PLAN_FILENAME) {
				plans.push({ path: entryPath, folder: path.dirname(entryPath) });
				continue;
			}

			notes.push({ path: entryPath, folder: path.dirname(entryPath) });
		}
	}

	await walk(projectsPath);
	return { notes, plans };
}

async function buildNoteIndex(rootPath: string): Promise<NoteIndex> {
	const files: string[] = [];
	const visited = new Set<string>();

	async function walk(dir: string): Promise<void> {
		let realDir: string;
		try {
			realDir = await Bun.realpath(dir);
		} catch {
			realDir = dir;
		}
		if (visited.has(realDir)) return;
		visited.add(realDir);

		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const entryPath = path.join(dir, entry.name);
			let statInfo: {
				isDirectory: () => boolean;
				isFile: () => boolean;
			} | null = null;
			if (entry.isSymbolicLink()) {
				try {
					const linked = await stat(entryPath);
					statInfo = linked;
				} catch {
					statInfo = null;
				}
			}
			const isDir = entry.isDirectory() || statInfo?.isDirectory();
			const isFile = entry.isFile() || statInfo?.isFile();
			if (isDir) {
				await walk(entryPath);
				continue;
			}
			if (!isFile) continue;
			if (path.extname(entry.name).toLowerCase() !== ".md") continue;
			files.push(entryPath);
		}
	}

	await walk(rootPath);
	const byName = new Map<string, string>();
	const byRelative = new Map<string, string>();
	for (const file of files) {
		const name = path.basename(file, ".md").toLowerCase();
		if (!byName.has(name)) {
			byName.set(name, file);
		}
		const relative = path
			.relative(rootPath, file)
			.replace(/\\/g, "/")
			.toLowerCase();
		byRelative.set(relative, file);
	}
	return { byName, byRelative };
}

function resolveNotePath(target: string, index: NoteIndex): string | null {
	const normalized = target.replace(/\\/g, "/").trim();
	if (!normalized) return null;
	if (normalized.includes("/")) {
		const relative = normalized.replace(/^\//, "");
		const key = `${relative.toLowerCase()}.md`;
		return index.byRelative.get(key) ?? null;
	}
	return index.byName.get(normalized.toLowerCase()) ?? null;
}

async function analyzeLinkedTodos(
	content: string,
	index: NoteIndex,
): Promise<{ blockedCount: number; openCount: number }> {
	const links = parseWikilinks(content);
	const seen = new Set<string>();
	let blockedCount = 0;
	let openCount = 0;
	for (const link of links) {
		const target = link.target.trim();
		if (!target) continue;
		const todoPath = resolveNotePath(target, index);
		if (!todoPath || seen.has(todoPath)) continue;
		seen.add(todoPath);
		const note = await readNote(todoPath);
		const status =
			coerceString(note.frontmatter.status)?.toLowerCase() ?? "active";
		if (status !== "completed") {
			openCount += 1;
		}
		if (status === "blocked") {
			blockedCount += 1;
		}
	}
	return { blockedCount, openCount };
}

async function countOpenTasksInPlan(planPath: string): Promise<number> {
	const content = await Bun.file(planPath).text();
	return content.split("\n").filter((line) => /^\s*-\s*\[ \]/.test(line))
		.length;
}

function resolveProjectName(
	notePath: string,
	frontmatter: Record<string, unknown>,
): string {
	const title = coerceString(frontmatter.title);
	if (title) return title;
	return path.basename(notePath, ".md");
}

function resolveStatus(frontmatter: Record<string, unknown>): string {
	const status =
		coerceString(frontmatter.status) ??
		coerceString(frontmatter.state) ??
		coerceString(frontmatter.project_status);
	return status?.toLowerCase() ?? "active";
}

function resolveLastTouched(
	frontmatter: Record<string, unknown>,
	stats: { mtime: Date },
): Date | null {
	const candidates = [
		frontmatter.last_touched,
		frontmatter.lastTouched,
		frontmatter.last_touched_date,
		frontmatter.updated,
		frontmatter.last_updated,
		frontmatter.modified,
		frontmatter.touched,
	];
	for (const value of candidates) {
		const dateValue = coerceDateInput(value);
		if (dateValue) return dateValue;
	}

	if (!stats.mtime || Number.isNaN(stats.mtime.getTime())) return null;
	return stats.mtime;
}

function resolveHasNextAction(
	frontmatter: Record<string, unknown>,
	content: string,
): boolean {
	const candidates = [
		frontmatter.next_action,
		frontmatter.nextAction,
		frontmatter.next,
	];
	for (const value of candidates) {
		if (typeof value === "string" && value.trim()) return true;
		if (typeof value === "boolean") return value;
	}

	const sections = parseSections(content);
	const section = sections.find((item) =>
		item.heading.toLowerCase().includes("next action"),
	);
	if (!section) return false;
	return hasMeaningfulContent(section.content);
}

function hasMeaningfulContent(content: string): boolean {
	return content
		.split("\n")
		.map((line) => line.trim())
		.some((line) => line.length > 0 && line !== "-");
}

function resolveBlockerCount(frontmatter: Record<string, unknown>): number {
	const raw =
		frontmatter.blockers ??
		frontmatter.blocker_count ??
		frontmatter.blocked_count ??
		frontmatter.blockerCount ??
		frontmatter.blockedCount;
	if (typeof raw === "number" && Number.isFinite(raw)) {
		return Math.max(0, Math.floor(raw));
	}
	if (Array.isArray(raw)) {
		return raw.filter((item) => typeof item === "string").length;
	}
	if (typeof raw === "string" && raw.trim()) {
		return 1;
	}
	return 0;
}

function resolveOpenTasks(frontmatter: Record<string, unknown>): number | null {
	const raw =
		frontmatter.open_tasks ??
		frontmatter.openTasks ??
		frontmatter.task_count ??
		frontmatter.taskCount;
	if (typeof raw === "number" && Number.isFinite(raw)) {
		return Math.max(0, Math.floor(raw));
	}
	return null;
}

function resolvePriority(
	frontmatter: Record<string, unknown>,
): "high" | "medium" | "low" {
	const raw =
		coerceString(frontmatter.priority) ?? coerceString(frontmatter.importance);
	if (raw === "high" || raw === "medium" || raw === "low") {
		return raw;
	}
	return "medium";
}

function resolveIncomePotential(frontmatter: Record<string, unknown>): boolean {
	const value =
		frontmatter.income ??
		frontmatter.income_potential ??
		frontmatter.incomePotential;
	return coerceBool(value);
}

function scoreProject(input: {
	status: string;
	stalenessDays: number | null;
	hasNextAction: boolean;
	blockers: number;
	lastTouched: Date | null | undefined;
}): {
	score: number;
	category: ProjectHealthProject["healthCategory"];
	issues: string[];
} {
	const status = input.status.toLowerCase();
	if (isPausedStatus(status)) {
		return { score: 100, category: "paused", issues: [] };
	}

	const weights = {
		recency: 50,
		nextAction: 20,
		blockers: 20,
		status: 10,
	};

	let score = 0;
	const issues: string[] = [];
	if (input.stalenessDays !== null && input.stalenessDays !== undefined) {
		const recencyFactor = Math.max(
			0,
			1 - Math.min(input.stalenessDays / STALE_DAYS_THRESHOLD, 1),
		);
		score += recencyFactor * weights.recency;
		if (input.stalenessDays >= STALE_DAYS_THRESHOLD) {
			issues.push("Stale");
		}
	} else {
		issues.push("Missing last touched");
	}

	if (input.hasNextAction) {
		score += weights.nextAction;
	} else {
		issues.push("No next action");
	}

	if (input.blockers === 0) {
		score += weights.blockers;
	} else {
		issues.push(`Blocked (${input.blockers})`);
	}

	if (status === "active" || status === "in-progress") {
		score += weights.status;
	}

	const category =
		score >= 70 ? "healthy" : score >= 40 ? "warning" : "critical";
	return { score: Math.round(score), category, issues };
}

function applyStatusFilter(
	projects: ProjectHealthProject[],
	statusFilter?: string,
): ProjectHealthProject[] {
	if (!statusFilter) return projects;
	const normalized = statusFilter.toLowerCase();
	return projects.filter(
		(project) => project.status.toLowerCase() === normalized,
	);
}

function sortProjects(
	projects: ProjectHealthProject[],
	sort?: string,
): ProjectHealthProject[] {
	if (!sort) return [...projects];
	const normalized = sort.toLowerCase();
	const sorted = [...projects];
	if (normalized === "health") {
		sorted.sort((a, b) => b.healthScore - a.healthScore);
		return sorted;
	}
	if (normalized === "last-touched") {
		sorted.sort((a, b) => {
			const left = a.lastTouched?.getTime() ?? 0;
			const right = b.lastTouched?.getTime() ?? 0;
			return right - left;
		});
		return sorted;
	}
	if (normalized === "priority") {
		sorted.sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority));
		return sorted;
	}
	return sorted;
}

function priorityRank(priority: "high" | "medium" | "low"): number {
	if (priority === "high") return 3;
	if (priority === "medium") return 2;
	return 1;
}

function groupProjects(projects: ProjectHealthProject[]): ProjectHealthGroups {
	const groups: ProjectHealthGroups = {
		critical: [],
		warning: [],
		healthy: [],
		paused: [],
	};
	for (const project of projects) {
		if (project.healthCategory === "paused") {
			groups.paused.push(project);
			continue;
		}
		if (project.healthCategory === "critical") {
			groups.critical.push(project);
			continue;
		}
		if (project.healthCategory === "warning") {
			groups.warning.push(project);
			continue;
		}
		groups.healthy.push(project);
	}
	return groups;
}

function buildSummary(
	groups: ProjectHealthGroups,
	projects: ProjectHealthProject[],
): ProjectHealthSummary {
	const active = projects.filter(
		(project) => project.healthCategory !== "paused",
	).length;
	const blocked = projects.filter((project) => project.blockers > 0).length;
	return {
		total: projects.length,
		active,
		healthy: groups.healthy.length,
		warning: groups.warning.length,
		critical: groups.critical.length,
		blocked,
	};
}

function buildRecommendations(
	projects: ProjectHealthProject[],
): ProjectHealthRecommendations {
	const shipIt: ProjectHealthProject[] = [];
	const needsAttention: ProjectHealthProject[] = [];
	const considerArchiving: ProjectHealthProject[] = [];

	for (const project of projects) {
		if (project.healthCategory === "paused") continue;
		if (project.blockers === 0 && project.hasNextAction) {
			shipIt.push(project);
		}
		if (!project.hasNextAction || project.blockers > 0) {
			needsAttention.push(project);
		}
		if (
			project.stalenessDays !== null &&
			project.stalenessDays !== undefined &&
			project.stalenessDays >= STALE_DAYS_THRESHOLD &&
			!project.hasNextAction
		) {
			considerArchiving.push(project);
		}
	}

	return { shipIt, needsAttention, considerArchiving };
}

function formatProjectTable(
	projects: ProjectHealthProject[],
	mode: "issues" | "health",
): string[] {
	const lines: string[] = [
		"| Project | Status | Last Touched | Issues |",
		"|---------|--------|--------------|--------|",
	];
	if (projects.length === 0) {
		lines.push("| _None_ | - | - | - |");
		return lines;
	}

	for (const project of projects) {
		const issues =
			mode === "health"
				? `${project.healthScore}/100`
				: project.issues.length
					? project.issues.join(", ")
					: "None";
		lines.push(
			`| ${formatProjectLink(project)} | ${project.status} | ${project.lastTouchedLabel} | ${issues} |`,
		);
	}
	return lines;
}

function formatProjectLink(project: ProjectHealthProject): string {
	return `[[${escapeTable(project.name)}]]`;
}

function formatRecommendationList(projects: ProjectHealthProject[]): string[] {
	if (projects.length === 0) {
		return ["- None"];
	}
	return projects.map(
		(project) =>
			`- **${formatProjectLink(project)}**: ${formatIssues(project)}`,
	);
}

function formatIssues(project: ProjectHealthProject): string {
	if (project.issues.length === 0) return "Healthy";
	return project.issues.join(", ");
}

function formatLastTouched(
	date: Date | null | undefined,
	stalenessDays: number | null,
): string {
	if (!date) return "unknown";
	if (stalenessDays === null || stalenessDays === undefined) return "unknown";
	if (stalenessDays === 0) return "today";
	if (stalenessDays === 1) return "1 day ago";
	return `${stalenessDays} days ago`;
}

function coerceString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length ? trimmed : null;
}

function coerceDateInput(value: unknown): Date | null {
	if (!value) return null;
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
	if (typeof value === "string") {
		const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
		if (!match) return null;
		return coerceDate(match[1]);
	}
	return null;
}

function formatDate(date: Date): string {
	const pad = (value: number): string => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function escapeTable(value: string): string {
	return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function isPausedStatus(status: string): boolean {
	return ["paused", "archived", "completed", "inactive"].includes(status);
}

function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(left: Date, right: Date): number {
	const leftStart = startOfDay(left).getTime();
	const rightStart = startOfDay(right).getTime();
	const diff = Math.floor((leftStart - rightStart) / (24 * 60 * 60 * 1000));
	return diff < 0 ? 0 : diff;
}
