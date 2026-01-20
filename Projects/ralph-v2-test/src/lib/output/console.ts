import type { OutputItem, OutputOptions } from "./types";

const COLORS = {
	reset: "\u001b[0m",
	green: "\u001b[32m",
	yellow: "\u001b[33m",
	red: "\u001b[31m",
	blue: "\u001b[34m",
};

const TYPE_COLOR: Record<OutputItem["type"], string> = {
	info: COLORS.blue,
	success: COLORS.green,
	warning: COLORS.yellow,
	error: COLORS.red,
};

function colorize(
	text: string,
	type: OutputItem["type"],
	enabled: boolean,
): string {
	if (!enabled) return text;
	return `${TYPE_COLOR[type]}${text}${COLORS.reset}`;
}

function formatItem(item: OutputItem, options: OutputOptions): string[] {
	const label = item.type.toUpperCase();
	const header = `${colorize(label, item.type, options.color)} ${item.message}`;
	const lines = [header];
	if (options.verbose) {
		if (item.details) {
			lines.push(`  ${item.details}`);
		}
		if (item.file) {
			const line = typeof item.line === "number" ? `:${item.line}` : "";
			lines.push(`  at ${item.file}${line}`);
		}
	}
	return lines;
}

export function formatConsole(
	items: OutputItem[],
	options: OutputOptions,
): string {
	if (items.length === 0) return "";
	const filtered = options.quiet
		? items.filter((item) => item.type === "error")
		: items;
	if (filtered.length === 0) return "";
	return filtered.flatMap((item) => formatItem(item, options)).join("\n");
}

export function log(message: string, type: OutputItem["type"] = "info"): void {
	const output = formatConsole([{ type, message }], {
		format: "console",
		color: true,
		verbose: false,
		quiet: false,
	});
	if (output) console.log(output);
}

export function success(message: string): void {
	log(message, "success");
}

export function warn(message: string): void {
	log(message, "warning");
}

export function error(message: string): void {
	log(message, "error");
}
