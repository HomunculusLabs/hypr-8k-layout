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

export interface OutputOptions {
	format: OutputFormat;
	color: boolean;
	verbose: boolean;
	quiet: boolean;
}

export interface OutputItem {
	type: "info" | "success" | "warning" | "error";
	message: string;
	details?: string;
	file?: string;
	line?: number;
}
