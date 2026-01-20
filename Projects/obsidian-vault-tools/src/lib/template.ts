import { spawn } from "node:child_process";
import path from "node:path";
import type { VaultAdapter } from "./adapters";
import { findMarkdownFiles } from "./markdown/files";
import { parseNote, serializeNote } from "./markdown/frontmatter";

export interface TemplateInfo {
	key: string;
	name: string;
	path: string;
	defaultOutput?: string;
	description?: string;
	variables?: string[];
}

export interface TemplateListResult {
	templates: TemplateInfo[];
}

export interface TemplateCreateResult {
	outputPath: string;
	created: boolean;
	overwritten: boolean;
	dryRun: boolean;
	canceled: boolean;
}

interface TemplateVariableDef {
	name: string;
	type: "string" | "enum";
	values?: string[];
	default?: string;
	required: boolean;
}

interface TemplateMetadata {
	templateName?: string;
	defaultOutput?: string;
	variables: TemplateVariableDef[];
}

interface TemplateCreateContext {
	title: string;
	vars: Record<string, string>;
	now: Date;
}

export async function listTemplates(
	adapter: VaultAdapter,
	templatesPath: string,
): Promise<TemplateListResult> {
	await ensurePathExists(adapter, templatesPath, "Templates folder");
	const templateFiles = await findMarkdownFiles(adapter, templatesPath);
	const templates: TemplateInfo[] = [];

	for (const filePath of templateFiles) {
		const content = await adapter.readFile(filePath);
		const note = parseNote(content);
		const metadata = parseTemplateMetadata(note.frontmatter);
		const key = toTemplateKey(templatesPath, filePath);
		const description =
			typeof note.frontmatter.description === "string"
				? note.frontmatter.description.trim()
				: undefined;
		const variables = extractTemplateVariables(content, metadata);
		templates.push({
			key,
			name: metadata.templateName ?? key,
			path: filePath,
			defaultOutput: metadata.defaultOutput,
			description,
			variables,
		});
	}

	templates.sort((a, b) => a.key.localeCompare(b.key));
	return { templates };
}

export async function createFromTemplate(options: {
	adapter: VaultAdapter;
	vaultPath: string;
	templatesPath: string;
	templateKey: string;
	title: string;
	vars: Record<string, string>;
	outputPath?: string;
	interactive?: boolean;
	dryRun?: boolean;
	open?: boolean;
	postCommand?: string;
	gitAdd?: boolean;
	prompt?: (question: string) => Promise<string>;
	confirm?: (question: string) => Promise<boolean>;
	now?: Date;
}): Promise<TemplateCreateResult> {
	const template = await resolveTemplate(
		options.adapter,
		options.templatesPath,
		options.templateKey,
	);
	const raw = await options.adapter.readFile(template.path);
	const parsed = parseNote(raw);
	const metadata = parseTemplateMetadata(parsed.frontmatter);
	const cleanedFrontmatter = stripTemplateMetadata(parsed.frontmatter);

	const now = options.now ?? new Date();
	const vars = { ...options.vars };
	const context: TemplateCreateContext = {
		title: options.title,
		vars,
		now,
	};

	const inputFields = collectInputFields(raw);
	const definitions = metadata.variables;
	applyDefaults(definitions, vars);
	validateEnumValues(definitions, vars);

	const missing = findMissingVariables(definitions, inputFields, vars);
	if (missing.length > 0) {
		if (!options.interactive || !options.prompt) {
			throw new Error(`Missing required variables: ${missing.join(", ")}`);
		}
		for (const name of missing) {
			const definition = definitions.find((variable) => variable.name === name);
			const value = await promptForVariable(options.prompt, definition);
			vars[name] = value;
		}
	}

	validateEnumValues(definitions, vars);

	const resolvedOutput = resolveOutputPath({
		vaultPath: options.vaultPath,
		outputPath: options.outputPath,
		defaultOutput: metadata.defaultOutput,
		title: options.title,
		context,
	});

	const outputPathExists = await fileExists(options.adapter, resolvedOutput);
	let overwritten = false;
	let finalOutputPath = resolvedOutput;

	if (outputPathExists) {
		if (!options.interactive || !options.confirm || !options.prompt) {
			throw new Error(`Output file already exists: ${resolvedOutput}`);
		}
		const overwrite = await options.confirm(
			`File exists at ${resolvedOutput}. Overwrite? (y/N) `,
		);
		if (!overwrite) {
			const replacement = await options.prompt(
				"Enter new filename (without extension): ",
			);
			if (!replacement.trim()) {
				return {
					outputPath: resolvedOutput,
					created: false,
					overwritten: false,
					dryRun: Boolean(options.dryRun),
					canceled: true,
				};
			}
			finalOutputPath = path.join(
				path.dirname(resolvedOutput),
				`${sanitizeFilename(replacement)}.md`,
			);
			if (await fileExists(options.adapter, finalOutputPath)) {
				throw new Error(`Output file already exists: ${finalOutputPath}`);
			}
		} else {
			overwritten = true;
		}
	}

	if (options.interactive && options.confirm) {
		const confirmed = await options.confirm(
			`Create note at ${finalOutputPath}? (y/N) `,
		);
		if (!confirmed) {
			return {
				outputPath: finalOutputPath,
				created: false,
				overwritten,
				dryRun: Boolean(options.dryRun),
				canceled: true,
			};
		}
	}

	const serialized = serializeNote({
		frontmatter: cleanedFrontmatter,
		content: parsed.content,
	});
	const substituted = applyTemplateVariables(serialized, context);

	if (options.interactive) {
		console.log("--- Template Preview ---");
		console.log(substituted);
		console.log("--- End Preview ---");
		if (options.confirm) {
			const confirmed = await options.confirm("Create this note? (y/N) ");
			if (!confirmed) {
				return {
					outputPath: finalOutputPath,
					created: false,
					overwritten,
					dryRun: Boolean(options.dryRun),
					canceled: true,
				};
			}
		}
	}

	if (!options.dryRun) {
		await options.adapter.writeFile(finalOutputPath, substituted);
		await runPostCreationHooks(finalOutputPath, {
			open: options.open,
			postCommand: options.postCommand,
			gitAdd: options.gitAdd,
		});
	}

	return {
		outputPath: finalOutputPath,
		created: !options.dryRun,
		overwritten,
		dryRun: Boolean(options.dryRun),
		canceled: false,
	};
}

export async function createFromTemplateFile(
	adapter: VaultAdapter,
	options: {
		templatePath: string;
		title: string;
		outputFolder: string;
		variables?: Record<string, string>;
		now?: Date;
	},
): Promise<string> {
	const templateContent = await adapter.readFile(options.templatePath);
	const parsed = parseNote(templateContent);
	const metadata = parseTemplateMetadata(parsed.frontmatter);
	const cleanedFrontmatter = stripTemplateMetadata(parsed.frontmatter);

	const now = options.now ?? new Date();
	const context: TemplateCreateContext = {
		title: options.title,
		vars: options.variables ?? {},
		now,
	};

	const serialized = serializeNote({
		frontmatter: cleanedFrontmatter,
		content: parsed.content,
	});
	const substituted = applyTemplateVariables(serialized, context);
	const outputPath = path.join(
		options.outputFolder,
		`${sanitizeFilename(options.title)}.md`,
	);

	await adapter.createFile(outputPath, substituted);
	return outputPath;
}

function parseTemplateMetadata(
	frontmatter: Record<string, unknown>,
): TemplateMetadata {
	const metadata: TemplateMetadata = { variables: [] };
	if (typeof frontmatter.template_name === "string") {
		metadata.templateName = frontmatter.template_name.trim();
	}
	if (typeof frontmatter.default_output === "string") {
		metadata.defaultOutput = frontmatter.default_output.trim();
	}
	if (Array.isArray(frontmatter.variables)) {
		for (const entry of frontmatter.variables) {
			if (!entry || typeof entry !== "object") continue;
			const record = entry as Record<string, unknown>;
			if (typeof record.name !== "string" || !record.name.trim()) continue;
			const type =
				record.type === "enum" || record.type === "string"
					? record.type
					: "string";
			const values = Array.isArray(record.values)
				? record.values.filter(
						(value): value is string => typeof value === "string",
					)
				: undefined;
			const required =
				typeof record.required === "boolean" ? record.required : true;
			const variable: TemplateVariableDef = {
				name: record.name.trim(),
				type,
				values,
				required,
			};
			if (typeof record.default === "string") {
				variable.default = record.default;
			}
			metadata.variables.push(variable);
		}
	}
	return metadata;
}

function extractTemplateVariables(
	content: string,
	metadata: TemplateMetadata,
): string[] {
	const variables = new Set<string>();
	for (const variable of metadata.variables) {
		if (variable.name) variables.add(variable.name);
	}
	for (const field of collectInputFields(content)) {
		variables.add(field);
	}
	variables.delete("title");
	variables.delete("date");
	return Array.from(variables).sort((a, b) => a.localeCompare(b));
}

function stripTemplateMetadata(
	frontmatter: Record<string, unknown>,
): Record<string, unknown> {
	const { template_name, default_output, variables, ...rest } = frontmatter;
	void template_name;
	void default_output;
	void variables;
	return rest;
}

async function resolveTemplate(
	adapter: VaultAdapter,
	templatesPath: string,
	templateKey: string,
): Promise<TemplateInfo> {
	const list = await listTemplates(adapter, templatesPath);
	const normalized = normalizeTemplateKey(templateKey);
	const match = list.templates.find(
		(template) => normalizeTemplateKey(template.key) === normalized,
	);
	if (match) return match;
	const suggestions = list.templates
		.map((template) => template.key)
		.filter((key) => key.toLowerCase().includes(normalized));
	const suggestionText =
		suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : "";
	throw new Error(`Template not found: ${templateKey}.${suggestionText}`);
}

function toTemplateKey(templatesPath: string, filePath: string): string {
	const relative = path.relative(templatesPath, filePath);
	const noExt = relative.replace(/\.md$/i, "");
	return noExt.split(path.sep).join("/");
}

function normalizeTemplateKey(input: string): string {
	return input.trim().replace(/\.md$/i, "").replace(/\\/g, "/").toLowerCase();
}

function collectInputFields(content: string): string[] {
	const fields: string[] = [];
	const regex = /\{\{\s*input:([^}]+)\s*\}\}/g;
	let match = regex.exec(content);
	while (match) {
		const name = match[1]?.trim();
		if (name && !fields.includes(name)) {
			fields.push(name);
		}
		match = regex.exec(content);
	}
	return fields;
}

function applyDefaults(
	definitions: TemplateVariableDef[],
	vars: Record<string, string>,
): void {
	for (const variable of definitions) {
		if (vars[variable.name] !== undefined && vars[variable.name] !== "") {
			continue;
		}
		if (variable.default !== undefined) {
			vars[variable.name] = variable.default;
		}
	}
}

function validateEnumValues(
	definitions: TemplateVariableDef[],
	vars: Record<string, string>,
): void {
	for (const variable of definitions) {
		if (variable.type !== "enum" || !variable.values) continue;
		const value = vars[variable.name];
		if (value === undefined) continue;
		if (!variable.values.includes(value)) {
			throw new Error(
				`Invalid value for ${variable.name}. Expected: ${variable.values.join(
					", ",
				)}`,
			);
		}
	}
}

function findMissingVariables(
	definitions: TemplateVariableDef[],
	inputFields: string[],
	vars: Record<string, string>,
): string[] {
	const missing = new Set<string>();
	for (const variable of definitions) {
		if (!variable.required) continue;
		if (vars[variable.name] === undefined || vars[variable.name] === "") {
			missing.add(variable.name);
		}
	}
	for (const field of inputFields) {
		if (vars[field] === undefined || vars[field] === "") missing.add(field);
	}
	return Array.from(missing);
}

async function promptForVariable(
	prompt: (question: string) => Promise<string>,
	definition?: TemplateVariableDef,
): Promise<string> {
	const name = definition?.name ?? "value";
	const defaultValue = definition?.default;
	if (definition?.type === "enum" && definition.values) {
		const values = definition.values.join(", ");
		const suffix = defaultValue ? ` [default: ${defaultValue}]` : "";
		const answer = await prompt(`Enter ${name} (${values})${suffix}: `);
		const trimmed = answer.trim();
		if (!trimmed && defaultValue) return defaultValue;
		if (!definition.values.includes(trimmed)) {
			throw new Error(`Invalid value for ${name}. Expected: ${values}`);
		}
		return trimmed;
	}
	const suffix = defaultValue ? ` [default: ${defaultValue}]` : "";
	const answer = await prompt(`Enter ${name}${suffix}: `);
	const trimmed = answer.trim();
	return trimmed || defaultValue || "";
}

function resolveOutputPath(options: {
	vaultPath: string;
	outputPath?: string;
	defaultOutput?: string;
	title: string;
	context: TemplateCreateContext;
}): string {
	const baseOutput = options.outputPath ?? options.defaultOutput;
	const renderedBase = baseOutput
		? applyTemplateVariables(baseOutput, options.context)
		: "";

	if (renderedBase) {
		const resolved = resolveUserPath(renderedBase, options.vaultPath);
		if (isDirectoryPath(renderedBase)) {
			return path.join(resolved, `${sanitizeFilename(options.title)}.md`);
		}
		return resolved;
	}

	return path.join(options.vaultPath, `${sanitizeFilename(options.title)}.md`);
}

function isDirectoryPath(candidate: string): boolean {
	if (candidate.endsWith(path.sep) || candidate.endsWith("/")) return true;
	return path.extname(candidate) === "";
}

function sanitizeFilename(name: string): string {
	return name.replace(/[\\/]/g, "-").trim();
}

function applyTemplateVariables(
	content: string,
	context: TemplateCreateContext,
): string {
	const datePattern = /{{\s*date(?::([^}]+))?\s*}}/g;
	const inputPattern = /{{\s*input:([^}]+)\s*}}/g;
	const simplePattern = /{{\s*([a-zA-Z0-9_-]+)\s*}}/g;
	const titlePattern = /{{\s*title\s*}}/g;
	const now = context.now;

	let updated = content.replace(datePattern, (_match, format) => {
		const pattern =
			typeof format === "string" && format.trim()
				? format.trim()
				: "YYYY-MM-DD";
		return formatDate(now, pattern);
	});
	updated = updated.replace(titlePattern, context.title);
	updated = updated.replace(inputPattern, (_match, name) => {
		const key = String(name).trim();
		return context.vars[key] ?? "";
	});
	updated = updated.replace(simplePattern, (match, name) => {
		const key = String(name).trim();
		if (key === "date" || key === "title") return match;
		const value = context.vars[key];
		return value !== undefined ? value : match;
	});
	return updated;
}

function formatDate(date: Date, pattern: string): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	const replacements: Record<string, string> = {
		YYYY: String(date.getFullYear()),
		YY: String(date.getFullYear()).slice(-2),
		MM: pad(date.getMonth() + 1),
		DD: pad(date.getDate()),
		HH: pad(date.getHours()),
		mm: pad(date.getMinutes()),
		ss: pad(date.getSeconds()),
	};
	return pattern.replace(/YYYY|YY|MM|DD|HH|mm|ss/g, (token) => {
		return replacements[token] ?? token;
	});
}

function resolveUserPath(inputPath: string, baseDir: string): string {
	if (path.isAbsolute(inputPath)) return inputPath;
	return path.resolve(baseDir, inputPath);
}

async function ensurePathExists(
	adapter: VaultAdapter,
	pathToCheck: string,
	label: string,
): Promise<void> {
	const exists = await adapter.fileExists(pathToCheck);
	if (!exists) {
		throw new Error(`${label} not found: ${pathToCheck}`);
	}
}

async function fileExists(
	adapter: VaultAdapter,
	filePath: string,
): Promise<boolean> {
	try {
		return await adapter.fileExists(filePath);
	} catch {
		return false;
	}
}

async function runPostCreationHooks(
	filePath: string,
	options: { open?: boolean; postCommand?: string; gitAdd?: boolean },
): Promise<void> {
	if (options.gitAdd) {
		await execCommand("git", ["add", filePath]);
	}
	if (options.postCommand) {
		const command = options.postCommand.replaceAll("{{path}}", filePath);
		await execCommand(command, [], true);
	}
	if (options.open) {
		await openInEditor(filePath);
	}
}

async function execCommand(
	command: string,
	args: string[],
	useShell = false,
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, {
			shell: useShell,
			stdio: "inherit",
		});
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Command failed: ${command}`));
			}
		});
	});
}

async function openInEditor(filePath: string): Promise<void> {
	const editor = process.env.VISUAL ?? process.env.EDITOR;
	if (editor) {
		await execCommand(editor, [filePath]);
		return;
	}
	const platform = process.platform;
	if (platform === "darwin") {
		await execCommand("open", [filePath]);
	} else if (platform === "win32") {
		await execCommand("cmd", ["/c", "start", "", filePath], true);
	} else {
		await execCommand("xdg-open", [filePath]);
	}
}
