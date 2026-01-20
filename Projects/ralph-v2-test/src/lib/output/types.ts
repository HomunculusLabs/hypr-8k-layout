export interface OutputOptions {
	format: "console" | "json" | "markdown";
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
