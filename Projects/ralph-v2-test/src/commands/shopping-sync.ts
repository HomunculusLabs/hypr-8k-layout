import { watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
	type CliOverrides,
	type OutputFormat,
	loadConfig,
} from "../lib/config";
import { setCheckboxState } from "../lib/markdown/checkboxes";
import { findMarkdownFiles, readNote, writeNote } from "../lib/markdown/files";
import { type Section, parseSections } from "../lib/markdown/sections";
import { type OutputItem, type OutputOptions, output } from "../lib/output";

export interface ShoppingSyncOptions {
	configPath?: string;
	vaultPath?: string;
	verbose?: boolean;
	json?: boolean;
	output?: OutputFormat;
	dryRun?: boolean;
	watch?: boolean;
}

export interface ShoppingSyncPaths {
	vaultPath: string;
	todosPath: string;
	shoppingListPath: string;
	dryRun?: boolean;
}

export interface ShoppingSyncResult {
	items: number;
	categories: number;
	todoFilesUpdated: number;
	shoppingListUpdated: boolean;
	warnings: string[];
	dryRun: boolean;
}

interface ShoppingItem {
	key: string;
	text: string;
	checked: boolean;
	category: string;
	sources: Set<string>;
}

interface ItemOccurrence {
	key: string;
	lineIndex: number;
	checked: boolean;
}

interface TodoSectionData {
	path: string;
	noteContent: string;
	section: Section;
	occurrences: ItemOccurrence[];
}

const CHECKBOX_PATTERN = /^(\s*)([-*])\s+\[( |x|X)\]\s*(.*)$/;
const CATEGORY_PATTERN = /^#{3,6}\s+(.*)$/;
const SOURCE_LINKS_PATTERN =
	/\s*\(\s*(\[\[[^\]]+\]\]\s*(,\s*\[\[[^\]]+\]\]\s*)*)\)\s*$/;

export async function runShoppingSync(
	options: ShoppingSyncOptions,
): Promise<void> {
	const config = await loadConfig(options.configPath, {
		vault: options.vaultPath,
		verbose: options.verbose,
		json: options.json,
		output: options.output,
	} satisfies CliOverrides);

	const outputOptions: OutputOptions = {
		format: config.output.format,
		color: config.output.color,
		verbose: config.output.verbose,
		quiet: false,
	};

	const todosPath = config.vault.todosFolder;
	const shoppingListPath = path.join(config.vault.path, "Shopping List.md");

	const performSync = async (): Promise<void> => {
		const result = await syncShoppingList({
			vaultPath: config.vault.path,
			todosPath,
			shoppingListPath,
			dryRun: options.dryRun,
		});

		const items: OutputItem[] = [];
		if (result.warnings.length > 0) {
			for (const warning of result.warnings) {
				items.push({ type: "warning", message: warning });
			}
		}

		const summary = `Items: ${result.items}, Categories: ${result.categories}, Todo updates: ${result.todoFilesUpdated}`;
		items.push({
			type: "success",
			message: result.dryRun
				? "Shopping list dry run complete"
				: "Shopping list synced",
			details: summary,
		});

		if (!result.shoppingListUpdated) {
			items.push({
				type: "info",
				message: "Shopping list already up to date",
			});
		}

		output(items, outputOptions);
	};

	try {
		await performSync();
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		output([{ type: "error", message }], {
			...outputOptions,
			format: "console",
		});
		process.exitCode = 1;
		return;
	}

	if (options.watch) {
		const debounceMs = 200;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let running = false;

		const schedule = (): void => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(async () => {
				if (running) return;
				running = true;
				try {
					await performSync();
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Unknown error";
					output([{ type: "error", message }], {
						...outputOptions,
						format: "console",
					});
				} finally {
					running = false;
				}
			}, debounceMs);
		};

		const watchers = [watch(todosPath, { recursive: true }, schedule)];
		watchers.push(watch(shoppingListPath, schedule));

		output(
			[{ type: "info", message: "Watching for shopping list changes..." }],
			outputOptions,
		);
	}
}

export async function syncShoppingList(
	paths: ShoppingSyncPaths,
): Promise<ShoppingSyncResult> {
	const todoFiles = await findMarkdownFiles(paths.todosPath);
	const itemsByKey = new Map<string, ShoppingItem>();
	const categoryOrder: string[] = [];
	const todoSections: TodoSectionData[] = [];
	const warnings: string[] = [];

	for (const todoPath of todoFiles) {
		const note = await readNote(todoPath);
		const section = findShoppingSection(note.content);
		if (!section || section.content.trim().length === 0) {
			continue;
		}

		const sourceName = path.basename(todoPath, ".md");
		const contentLines = note.content.split("\n");
		const occurrences: ItemOccurrence[] = [];
		let currentCategory = "Uncategorized";
		let inFence = false;

		const sectionLines = section.content.split("\n");
		for (let index = 0; index < sectionLines.length; index += 1) {
			const line = sectionLines[index];
			const trimmed = line.trim();
			if (trimmed.startsWith("```")) {
				inFence = !inFence;
				continue;
			}
			if (inFence) continue;

			const categoryMatch = CATEGORY_PATTERN.exec(line);
			if (categoryMatch) {
				const category = categoryMatch[1]?.trim();
				if (category) {
					currentCategory = category;
					if (!categoryOrder.includes(category)) {
						categoryOrder.push(category);
					}
				}
				continue;
			}

			const checkboxMatch = CHECKBOX_PATTERN.exec(line);
			if (!checkboxMatch) {
				if (trimmed.startsWith("- [")) {
					warnings.push(
						`Malformed checkbox in ${todoPath}:${section.startLine + index + 1}`,
					);
				}
				continue;
			}

			const itemText = checkboxMatch[4] ?? "";
			const normalized = normalizeItemText(itemText);
			if (!normalized) {
				warnings.push(
					`Empty checkbox in ${todoPath}:${section.startLine + index + 1}`,
				);
				continue;
			}

			const checked = checkboxMatch[3].toLowerCase() === "x";
			const key = normalized;
			const occurrenceLineIndex = section.startLine + index;
			occurrences.push({ key, lineIndex: occurrenceLineIndex, checked });

			const existing = itemsByKey.get(key);
			if (existing) {
				existing.checked = existing.checked || checked;
				existing.sources.add(sourceName);
				if (
					existing.category === "Uncategorized" &&
					currentCategory !== "Uncategorized"
				) {
					existing.category = currentCategory;
				}
			} else {
				itemsByKey.set(key, {
					key,
					text: itemText.trimEnd(),
					checked,
					category: currentCategory,
					sources: new Set([sourceName]),
				});
				if (
					currentCategory !== "Uncategorized" &&
					!categoryOrder.includes(currentCategory)
				) {
					categoryOrder.push(currentCategory);
				}
			}
		}

		if (occurrences.length > 0) {
			todoSections.push({
				path: todoPath,
				noteContent: note.content,
				section,
				occurrences,
			});
		}
	}

	const listChecked = await readShoppingListCheckedState(
		paths.shoppingListPath,
	);
	for (const item of itemsByKey.values()) {
		const listState = listChecked.get(item.key) ?? false;
		item.checked = item.checked || listState;
	}

	const updatedItems = Array.from(itemsByKey.values());
	const shoppingListContent = renderShoppingList(updatedItems, categoryOrder);

	let shoppingListUpdated = false;
	const existingList = await readOptionalFile(paths.shoppingListPath);
	if (existingList !== shoppingListContent) {
		shoppingListUpdated = true;
		if (!paths.dryRun) {
			await Bun.write(paths.shoppingListPath, shoppingListContent);
		}
	}

	let todoFilesUpdated = 0;
	for (const sectionData of todoSections) {
		const lines = sectionData.noteContent.split("\n");
		let changed = false;

		for (const occurrence of sectionData.occurrences) {
			const item = itemsByKey.get(occurrence.key);
			if (!item) continue;
			const desired = item.checked;
			const currentLine = lines[occurrence.lineIndex] ?? "";
			const updatedLine = setCheckboxState(currentLine, desired);
			if (updatedLine !== currentLine) {
				lines[occurrence.lineIndex] = updatedLine;
				changed = true;
			}
		}

		if (changed) {
			todoFilesUpdated += 1;
			if (!paths.dryRun) {
				const note = await readNote(sectionData.path);
				note.content = lines.join("\n");
				await writeNote(sectionData.path, note);
			}
		}
	}

	const categoriesCount = new Set(
		updatedItems.map((item) => item.category || "Uncategorized"),
	).size;

	return {
		items: updatedItems.length,
		categories: categoriesCount,
		todoFilesUpdated,
		shoppingListUpdated,
		warnings,
		dryRun: Boolean(paths.dryRun),
	};
}

function findShoppingSection(content: string): Section | undefined {
	return parseSections(content).find(
		(section) => section.heading.trim().toLowerCase() === "shopping",
	);
}

function normalizeItemText(text: string): string {
	return text.trim().toLowerCase();
}

async function readOptionalFile(filePath: string): Promise<string | null> {
	try {
		await stat(filePath);
		return await readFile(filePath, "utf8");
	} catch {
		return null;
	}
}

async function readShoppingListCheckedState(
	filePath: string,
): Promise<Map<string, boolean>> {
	const content = await readOptionalFile(filePath);
	if (!content) return new Map();
	const lines = content.split("\n");
	const states = new Map<string, boolean>();

	for (const line of lines) {
		const match = CHECKBOX_PATTERN.exec(line);
		if (!match) continue;
		const checked = match[3].toLowerCase() === "x";
		const text = stripSourceLinks(match[4] ?? "");
		const key = normalizeItemText(text);
		if (!key) continue;
		const existing = states.get(key);
		states.set(key, Boolean(existing) || checked);
	}

	return states;
}

function stripSourceLinks(text: string): string {
	return text.replace(SOURCE_LINKS_PATTERN, "").trimEnd();
}

function renderShoppingList(
	items: ShoppingItem[],
	categoryOrder: string[],
): string {
	const lines: string[] = ["# Shopping List", ""];

	const categories = buildCategoryOrder(items, categoryOrder);
	for (const category of categories) {
		lines.push(`## ${category}`, "");
		const categoryItems = items.filter(
			(item) => (item.category || "Uncategorized") === category,
		);
		for (const item of categoryItems) {
			const sources = Array.from(item.sources).sort((a, b) =>
				a.localeCompare(b),
			);
			const sourceLinks = sources.map((source) => `[[${source}]]`).join(", ");
			const suffix = sourceLinks ? ` (${sourceLinks})` : "";
			const marker = item.checked ? "x" : " ";
			lines.push(`- [${marker}] ${item.text}${suffix}`);
		}
		lines.push("");
	}

	lines.push("---");
	lines.push(`*Auto-synced: ${formatTimestamp(new Date())}*`);
	lines.push("");
	return lines.join("\n");
}

function buildCategoryOrder(
	items: ShoppingItem[],
	categoryOrder: string[],
): string[] {
	const present = new Set(
		items.map((item) => item.category || "Uncategorized"),
	);
	const ordered: string[] = [];
	for (const category of categoryOrder) {
		if (present.has(category)) ordered.push(category);
	}
	if (present.has("Uncategorized")) ordered.push("Uncategorized");
	if (ordered.length === 0) ordered.push("Uncategorized");
	return ordered;
}

function formatTimestamp(date: Date): string {
	const pad = (value: number): string => String(value).padStart(2, "0");
	const year = date.getFullYear();
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());
	const hours = pad(date.getHours());
	const minutes = pad(date.getMinutes());
	return `${year}-${month}-${day} ${hours}:${minutes}`;
}
