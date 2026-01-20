import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";

import type {
	CliOverrides,
	FrontmatterFieldType,
	FrontmatterSchemaField,
	FrontmatterSchemaMatch,
	FrontmatterSchemas,
	OutputFormat,
	VaultToolsConfig,
} from "../types";

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
	const baseDir = configPath ? path.dirname(configPath) : process.cwd();
	const config = applyCliOverrides(
		normalizeConfigPaths(mergeWithDefaults(parsed), baseDir),
		cliOverrides,
	);
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
	const vault = asRecord(parsed.vault) ?? legacy.vault ?? {};
	const output = asRecord(parsed.output) ?? legacy.output ?? {};
	const schemas = normalizeSchemas(parsed.schemas);

	return {
		vault: {
			path: readString(vault, "path", DEFAULT_CONFIG.vault.path),
			todosFolder: readString(
				vault,
				"todosFolder",
				DEFAULT_CONFIG.vault.todosFolder,
			),
			projectsFolder: readString(
				vault,
				"projectsFolder",
				DEFAULT_CONFIG.vault.projectsFolder,
			),
			dailyFolder: readString(
				vault,
				"dailyFolder",
				DEFAULT_CONFIG.vault.dailyFolder,
			),
			templatesFolder: readString(
				vault,
				"templatesFolder",
				DEFAULT_CONFIG.vault.templatesFolder,
			),
		},
		output: {
			format: isOutputFormat(output.format)
				? (output.format as OutputFormat)
				: DEFAULT_CONFIG.output.format,
			color: readBoolean(output, "color", DEFAULT_CONFIG.output.color),
			verbose: readBoolean(output, "verbose", DEFAULT_CONFIG.output.verbose),
		},
		schemas,
	};
}

function coerceLegacyConfig(
	parsed: Record<string, unknown>,
): Partial<VaultToolsConfig> {
	const legacy: Partial<VaultToolsConfig> = {};
	const mappings = [
		["vault_path", "path"],
		["todos_path", "todosFolder"],
		["projects_path", "projectsFolder"],
		["daily_notes_path", "dailyFolder"],
		["templates_path", "templatesFolder"],
	] as const;

	for (const [legacyKey, modernKey] of mappings) {
		const value = parsed[legacyKey];
		if (typeof value !== "string") continue;
		legacy.vault = { ...(legacy.vault ?? {}), [modernKey]: value };
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
	const schemasRaw = asRecord(raw);
	if (!schemasRaw) return {};
	const schemas: FrontmatterSchemas = {};
	for (const [key, value] of Object.entries(schemasRaw)) {
		const schema = asRecord(value);
		if (!schema) continue;
		const fields: Record<string, FrontmatterSchemaField> = {};
		const fieldsRaw = asRecord(schema.fields) ?? {};

		for (const [fieldName, fieldValue] of Object.entries(fieldsRaw)) {
			const field = asRecord(fieldValue);
			if (!field || !isFrontmatterFieldType(field.type)) continue;
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
	const match = asRecord(raw);
	if (!match) return undefined;
	const frontmatter = asRecord(match.frontmatter) ?? undefined;

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

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== "object") return undefined;
	return value as Record<string, unknown>;
}

function readString(
	record: Record<string, unknown>,
	key: string,
	fallback: string,
): string {
	const value = record[key];
	return typeof value === "string" ? value : fallback;
}

function readBoolean(
	record: Record<string, unknown>,
	key: string,
	fallback: boolean,
): boolean {
	const value = record[key];
	return typeof value === "boolean" ? value : fallback;
}
