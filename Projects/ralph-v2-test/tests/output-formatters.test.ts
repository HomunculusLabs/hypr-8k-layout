import { describe, expect, test } from "bun:test";
import { formatConsole } from "../src/lib/output/console";
import { formatJson } from "../src/lib/output/json";
import { formatMarkdown } from "../src/lib/output/markdown";
import { createProgress } from "../src/lib/output/progress";
import type { OutputItem, OutputOptions } from "../src/lib/output/types";

describe("formatConsole", () => {
	const baseOptions: OutputOptions = {
		format: "console",
		color: false,
		verbose: false,
		quiet: false,
	};

	test("filters output when quiet", () => {
		const items: OutputItem[] = [
			{ type: "info", message: "Info" },
			{ type: "error", message: "Error" },
		];
		const output = formatConsole(items, { ...baseOptions, quiet: true });
		expect(output).toContain("ERROR Error");
		expect(output).not.toContain("INFO Info");
	});

	test("includes details when verbose", () => {
		const items: OutputItem[] = [
			{ type: "warning", message: "Warn", details: "Extra" },
		];
		const output = formatConsole(items, { ...baseOptions, verbose: true });
		expect(output).toContain("WARNING Warn");
		expect(output).toContain("Extra");
	});

	test("handles empty input", () => {
		const output = formatConsole([], baseOptions);
		expect(output).toBe("");
	});
});

describe("formatJson", () => {
	test("returns summary with success", () => {
		const items: OutputItem[] = [
			{ type: "success", message: "Ok" },
			{ type: "warning", message: "Warn" },
		];
		const parsed = JSON.parse(formatJson(items));
		expect(parsed.summary.total).toBe(2);
		expect(parsed.summary.warnings).toBe(1);
		expect(parsed.summary.errors).toBe(0);
		expect(parsed.success).toBe(true);
	});

	test("marks success false when errors exist", () => {
		const items: OutputItem[] = [{ type: "error", message: "Oops" }];
		const parsed = JSON.parse(formatJson(items));
		expect(parsed.success).toBe(false);
	});
});

describe("formatMarkdown", () => {
	test("includes summary and details", () => {
		const items: OutputItem[] = [
			{ type: "info", message: "Note", file: "file.md", line: 2 },
		];
		const output = formatMarkdown(items, "Report");
		expect(output).toContain("# Report");
		expect(output).toContain("## Summary");
		expect(output).toContain("## Details");
		expect(output).toContain("file.md:2");
	});

	test("handles empty input", () => {
		const output = formatMarkdown([]);
		expect(output).toContain("Total: 0");
		expect(output).toContain("No items.");
	});
});

describe("createProgress", () => {
	test("tracks progress without throwing", () => {
		const logs: string[] = [];
		const errors: string[] = [];
		const originalLog = console.log;
		const originalError = console.error;
		console.log = (message?: unknown) => {
			if (typeof message === "string") logs.push(message);
		};
		console.error = (message?: unknown) => {
			if (typeof message === "string") errors.push(message);
		};

		const progress = createProgress(2, "Test");
		progress.increment();
		progress.increment();
		progress.complete();
		progress.fail("boom");

		console.log = originalLog;
		console.error = originalError;

		expect(logs.length).toBeGreaterThan(0);
		expect(errors.length).toBe(0);
	});
});
