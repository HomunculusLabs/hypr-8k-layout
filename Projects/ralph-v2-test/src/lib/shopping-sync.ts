import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { MARKDOWN } from "./constants";
import { setCheckboxState } from "./markdown/checkboxes";
import { findMarkdownFiles, readNote, writeNote } from "./markdown/files";
import { type Section, parseSections } from "./markdown/sections";

export interface ShoppingSyncPaths {
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
const SHOPPING_HEADING = "shopping";
const UNCATEGORIZED = "Uncategorized";

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
		const occurrences = collectItems({
			todoPath,
			section,
			sourceName,
			itemsByKey,
			categoryOrder,
			warnings,
		});

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
		updatedItems.map((item) => item.category || UNCATEGORIZED),
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

function collectItems({
	todoPath,
	section,
	noteContent,
	sourceName,
	itemsByKey,
	categoryOrder,
	warnings,
}: {
	todoPath: string;
	section: Section;
	sourceName: string;
	itemsByKey: Map<string, ShoppingItem>;
	categoryOrder: string[];
	warnings: string[];
}): ItemOccurrence[] {
	const occurrences: ItemOccurrence[] = [];
	let currentCategory = UNCATEGORIZED;
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
				existing.category === UNCATEGORIZED &&
				currentCategory !== UNCATEGORIZED
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
				currentCategory !== UNCATEGORIZED &&
				!categoryOrder.includes(currentCategory)
			) {
				categoryOrder.push(currentCategory);
			}
		}
	}

	return occurrences;
}

function findShoppingSection(content: string): Section | undefined {
	return parseSections(content).find(
		(section) => section.heading.trim().toLowerCase() === SHOPPING_HEADING,
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
			(item) => (item.category || UNCATEGORIZED) === category,
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

	lines.push(MARKDOWN.horizontalRule);
	lines.push(`*Auto-synced: ${formatTimestamp(new Date())}*`);
	lines.push("");
	return lines.join("\n");
}

function buildCategoryOrder(
	items: ShoppingItem[],
	categoryOrder: string[],
): string[] {
	const present = new Set(items.map((item) => item.category || UNCATEGORIZED));
	const ordered: string[] = [];
	for (const category of categoryOrder) {
		if (present.has(category)) ordered.push(category);
	}
	if (present.has(UNCATEGORIZED)) ordered.push(UNCATEGORIZED);
	if (ordered.length === 0) ordered.push(UNCATEGORIZED);
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
