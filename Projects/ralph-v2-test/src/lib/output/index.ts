import { formatConsole } from "./console";
import { formatJson } from "./json";
import { formatMarkdown } from "./markdown";
import type { OutputItem, OutputOptions } from "./types";

export type { OutputItem, OutputOptions } from "./types";

export function output(items: OutputItem[], options: OutputOptions): void {
	const formatted =
		options.format === "json"
			? formatJson(items)
			: options.format === "markdown"
				? formatMarkdown(items)
				: formatConsole(items, options);

	if (formatted) {
		console.log(formatted);
	}
}
