import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { type ParsedNote, parseNote, serializeNote } from "./frontmatter";

export async function findMarkdownFiles(
	rootPath: string,
	pattern?: string,
): Promise<string[]> {
	const results: string[] = [];

	async function walk(dir: string): Promise<void> {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const entryPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(entryPath);
				continue;
			}

			if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".md") {
				if (pattern && !entryPath.includes(pattern)) {
					continue;
				}
				results.push(entryPath);
			}
		}
	}

	await walk(rootPath);
	return results;
}

export async function readNote(notePath: string): Promise<ParsedNote> {
	const content = await readFile(notePath, "utf8");
	return parseNote(content);
}

export async function writeNote(
	notePath: string,
	note: ParsedNote,
): Promise<void> {
	const content = serializeNote(note);
	await writeFile(notePath, content, "utf8");
}
