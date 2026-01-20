import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";

export type OutputFormat = "console" | "json" | "markdown";

export type FrontmatterFieldType = "string" | "date" | "enum" | "array";

export interface FrontmatterSchemaField {
	type: FrontmatterFieldType;
	required?: boolean;
	values?: string[];
	default?: unknown;
}

export interface FrontmatterSchemaMatch {
	folder?: string;
	filename?: string;
	frontmatter?: Record<string, unknown>;
}

export interface FrontmatterSchema {
	match?: FrontmatterSchemaMatch;
	fields: Record<string, FrontmatterSchemaField>;
}

export type FrontmatterSchemas = Record<string, FrontmatterSchema>;

export interface VaultToolsConfig {
	vault: {
		path: string;
		todosFolder: string;
		projectsFolder: string;
		dailyFolder: string;
		templatesFolder: string;
	};
	output: {
		format: OutputFormat;
		color: boolean;
		verbose: boolean;
	};
	schemas: FrontmatterSchemas;
}

export interface CliOverrides {
	vault?: string;
	verbose?: boolean;
	json?: boolean;
	output?: OutputFormat;
}

const DEFAULT_CONFIG: VaultToolsConfig = {
	vault: {
		path: ".",
		todosFolder: "6 - Atomic Notes/Todos",
		projectsFolder: "8 - Projects",
		dailyFolder: "1 - Dailies",
		templatesFolder: "5 - Templates",
	},
	output: {
		format: "console",
		color: true,
		verbose: false,
	},
	schemas: {},
};

export async function loadConfig(
	overridePath?: string,
	cliOverrides?: CliOverrides,
): Promise<VaultToolsConfig> {
	const configPath = await findConfigFile(overridePath);
	const parsed = configPath === null ? {} : await loadConfigFile(configPath);
	let config = mergeWithDefaults(parsed);
	const baseDir = configPath ? path.dirname(configPath) : process.cwd();
	config = normalizeConfigPaths(config, baseDir);
	config = applyCliOverrides(config, cliOverrides);
	await validateVaultPath(config.vault.path);
	return config;
}

export async function findConfigFile(
	overridePath?: string,
): Promise<string | null> {
	if (overridePath) {
		const resolved = resolveUserPath(overridePath, process.cwd());
		if (await fileExists(resolved)) {
			return resolved;
		}
		throw new Error(`Config file not found: ${resolved}`);
	}

	const cwdCandidate = path.resolve(process.cwd(), "vault-tools.config.yaml");
	if (await fileExists(cwdCandidate)) return cwdCandidate;

	const vaultPath = process.env.VAULT_PATH;
	if (vaultPath) {
		const resolvedVaultPath = resolveUserPath(vaultPath, process.cwd());
		const vaultCandidate = path.join(
			resolvedVaultPath,
			"vault-tools.config.yaml",
		);
		if (await fileExists(vaultCandidate)) return vaultCandidate;
	}

	const homeCandidate = path.join(
		getHomeDir(),
		".config",
		"vault-tools",
		"config.yaml",
	);
	if (await fileExists(homeCandidate)) return homeCandidate;

	return null;
}

function getHomeDir(): string {
	return process.env.HOME ?? os.homedir();
}

function expandTilde(inputPath: string): string {
	if (!inputPath.startsWith("~")) return inputPath;
	const home = getHomeDir();
	if (inputPath === "~") return home;
	if (inputPath.startsWith("~/")) return path.join(home, inputPath.slice(2));
	return inputPath;
}

function resolveUserPath(inputPath: string, baseDir: string): string {
	const expanded = expandTilde(inputPath);
	if (path.isAbsolute(expanded)) return expanded;
	return path.resolve(baseDir, expanded);
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await stat(filePath);
		return true;
	} catch {
		return false;
	}
}

async function loadConfigFile(
	configPath: string,
): Promise<Record<string, unknown>> {
	try {
		const content = await Bun.file(configPath).text();
		const parsed = parse(content);
		if (parsed && typeof parsed === "object") {
			return parsed as Record<string, unknown>;
		}
		return {};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown YAML parse error";
		throw new Error(`Invalid YAML in config file ${configPath}: ${message}`);
	}
}

function mergeWithDefaults(parsed: Record<string, unknown>): VaultToolsConfig {
	const legacy = coerceLegacyConfig(parsed);
	const vault =
		(typeof parsed.vault === "object" && parsed.vault !== null
			? parsed.vault
			: legacy.vault) ?? {};
	const output =
		(typeof parsed.output === "object" && parsed.output !== null
			? parsed.output
			: legacy.output) ?? {};
	const schemas = normalizeSchemas(parsed.schemas);

	return {
		vault: {
			path:
				typeof (vault as Record<string, unknown>).path === "string"
					? (vault as Record<string, unknown>).path
					: DEFAULT_CONFIG.vault.path,
			todosFolder:
				typeof (vault as Record<string, unknown>).todosFolder === "string"
					? (vault as Record<string, unknown>).todosFolder
					: DEFAULT_CONFIG.vault.todosFolder,
			projectsFolder:
				typeof (vault as Record<string, unknown>).projectsFolder === "string"
					? (vault as Record<string, unknown>).projectsFolder
					: DEFAULT_CONFIG.vault.projectsFolder,
			dailyFolder:
				typeof (vault as Record<string, unknown>).dailyFolder === "string"
					? (vault as Record<string, unknown>).dailyFolder
					: DEFAULT_CONFIG.vault.dailyFolder,
			templatesFolder:
				typeof (vault as Record<string, unknown>).templatesFolder === "string"
					? (vault as Record<string, unknown>).templatesFolder
					: DEFAULT_CONFIG.vault.templatesFolder,
		},
		output: {
			format: isOutputFormat((output as Record<string, unknown>).format)
				? ((output as Record<string, unknown>).format as OutputFormat)
				: DEFAULT_CONFIG.output.format,
			color:
				typeof (output as Record<string, unknown>).color === "boolean"
					? (output as Record<string, unknown>).color
					: DEFAULT_CONFIG.output.color,
			verbose:
				typeof (output as Record<string, unknown>).verbose === "boolean"
					? (output as Record<string, unknown>).verbose
					: DEFAULT_CONFIG.output.verbose,
		},
		schemas,
	};
}

function coerceLegacyConfig(
	parsed: Record<string, unknown>,
): Partial<VaultToolsConfig> {
	const legacy: Partial<VaultToolsConfig> = {};
	if (typeof parsed.vault_path === "string") {
		legacy.vault = { ...(legacy.vault ?? {}), path: parsed.vault_path };
	}
	if (typeof parsed.todos_path === "string") {
		legacy.vault = {
			...(legacy.vault ?? {}),
			todosFolder: parsed.todos_path,
		};
	}
	if (typeof parsed.projects_path === "string") {
		legacy.vault = {
			...(legacy.vault ?? {}),
			projectsFolder: parsed.projects_path,
		};
	}
	if (typeof parsed.daily_notes_path === "string") {
		legacy.vault = {
			...(legacy.vault ?? {}),
			dailyFolder: parsed.daily_notes_path,
		};
	}
	if (typeof parsed.templates_path === "string") {
		legacy.vault = {
			...(legacy.vault ?? {}),
			templatesFolder: parsed.templates_path,
		};
	}
	return legacy;
}

function normalizeConfigPaths(
	config: VaultToolsConfig,
	baseDir: string,
): VaultToolsConfig {
	return {
		...config,
		vault: {
			...config.vault,
			path: resolveUserPath(config.vault.path, baseDir),
			todosFolder: resolveUserPath(config.vault.todosFolder, baseDir),
			projectsFolder: resolveUserPath(config.vault.projectsFolder, baseDir),
			dailyFolder: resolveUserPath(config.vault.dailyFolder, baseDir),
			templatesFolder: resolveUserPath(config.vault.templatesFolder, baseDir),
		},
	};
}

function applyCliOverrides(
	config: VaultToolsConfig,
	cliOverrides?: CliOverrides,
): VaultToolsConfig {
	if (!cliOverrides) return config;
	const next = {
		...config,
		vault: { ...config.vault },
		output: { ...config.output },
	};

	if (cliOverrides.vault) {
		next.vault.path = resolveUserPath(cliOverrides.vault, process.cwd());
	}
	if (cliOverrides.verbose) {
		next.output.verbose = true;
	}
	if (cliOverrides.output) {
		next.output.format = cliOverrides.output;
	}
	if (cliOverrides.json) {
		next.output.format = "json";
	}
	return next;
}

function isOutputFormat(value: unknown): value is OutputFormat {
	return value === "console" || value === "json" || value === "markdown";
}

function normalizeSchemas(raw: unknown): FrontmatterSchemas {
	if (!raw || typeof raw !== "object") {
		return {};
	}

	const schemas: FrontmatterSchemas = {};
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		if (!value || typeof value !== "object") continue;
		const schema = value as Record<string, unknown>;
		const fields: Record<string, FrontmatterSchemaField> = {};
		const fieldsRaw =
			typeof schema.fields === "object" && schema.fields !== null
				? (schema.fields as Record<string, unknown>)
				: {};

		for (const [fieldName, fieldValue] of Object.entries(fieldsRaw)) {
			if (!fieldValue || typeof fieldValue !== "object") continue;
			const field = fieldValue as Record<string, unknown>;
			if (!isFrontmatterFieldType(field.type)) continue;
			const values = Array.isArray(field.values)
				? field.values.filter(
						(item): item is string => typeof item === "string",
					)
				: undefined;
			fields[fieldName] = {
				type: field.type,
				required: field.required === true,
				values,
				default: field.default,
			};
		}

		if (Object.keys(fields).length === 0) continue;

		schemas[key] = {
			match: normalizeSchemaMatch(schema.match),
			fields,
		};
	}

	return schemas;
}

function normalizeSchemaMatch(
	raw: unknown,
): FrontmatterSchemaMatch | undefined {
	if (!raw || typeof raw !== "object") return undefined;
	const match = raw as Record<string, unknown>;
	const frontmatter =
		typeof match.frontmatter === "object" && match.frontmatter !== null
			? (match.frontmatter as Record<string, unknown>)
			: undefined;

	return {
		folder: typeof match.folder === "string" ? match.folder : undefined,
		filename: typeof match.filename === "string" ? match.filename : undefined,
		frontmatter,
	};
}

function isFrontmatterFieldType(value: unknown): value is FrontmatterFieldType {
	return (
		value === "string" ||
		value === "date" ||
		value === "enum" ||
		value === "array"
	);
}

async function validateVaultPath(vaultPath: string): Promise<void> {
	if (!(await fileExists(vaultPath))) {
		throw new Error(`Vault path does not exist: ${vaultPath}`);
	}
}
