import type { VaultAdapter } from "../adapters";
import { type ParsedNote, parseNote, serializeNote } from "./frontmatter";

export async function findMarkdownFiles(
	adapter: VaultAdapter,
	rootPath: string,
	pattern?: string,
): Promise<string[]> {
	const files = rootPath
		? await adapter.getMarkdownFilesInFolder(rootPath)
		: await adapter.getMarkdownFiles();
	const paths = files.map((file) => file.path);
	if (!pattern) return paths;
	return paths.filter((filePath) => filePath.includes(pattern));
}

export async function readNote(
	adapter: VaultAdapter,
	notePath: string,
): Promise<ParsedNote> {
	const content = await adapter.readFile(notePath);
	return parseNote(content);
}

export async function writeNote(
	adapter: VaultAdapter,
	notePath: string,
	note: ParsedNote,
): Promise<void> {
	const content = serializeNote(note);
	await adapter.writeFile(notePath, content);
}
