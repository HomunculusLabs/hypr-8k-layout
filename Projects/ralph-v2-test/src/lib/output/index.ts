import type { OutputItem, OutputOptions } from "../../types";
import { OUTPUT_FORMAT } from "../constants";
import { formatConsole } from "./console";
import { formatJson } from "./json";
import { formatMarkdown } from "./markdown";

export type { OutputItem, OutputOptions } from "../../types";

export function output(items: OutputItem[], options: OutputOptions): void {
	const formatted =
		options.format === OUTPUT_FORMAT.json
			? formatJson(items)
			: options.format === OUTPUT_FORMAT.markdown
				? formatMarkdown(items)
				: formatConsole(items, options);

	if (formatted) {
		console.log(formatted);
	}
}

export function reportError(error: unknown, options: OutputOptions): void {
	const message = error instanceof Error ? error.message : "Unknown error";
	output([{ type: "error", message }], {
		...options,
		format: OUTPUT_FORMAT.console,
	});
}
