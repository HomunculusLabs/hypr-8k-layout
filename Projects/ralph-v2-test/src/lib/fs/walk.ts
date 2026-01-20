import { readdir, realpath, stat } from "node:fs/promises";
import { join } from "node:path";

export interface WalkOptions {
	/** Follow symlinks (default: true) */
	followSymlinks?: boolean;
	/** Filter function for files (return true to include) */
	fileFilter?: (path: string, name: string) => boolean;
	/** Filter function for directories (return true to descend) */
	dirFilter?: (path: string, name: string) => boolean;
	/** Maximum depth to traverse (default: Infinity) */
	maxDepth?: number;
}

export interface WalkEntry {
	path: string;
	name: string;
	isSymlink: boolean;
	realPath: string;
}

/**
 * Walk a directory tree, yielding file entries.
 * Handles symlinks safely with cycle detection.
 */
export async function* walkDirectory(
	dir: string,
	options: WalkOptions = {},
): AsyncGenerator<WalkEntry> {
	const {
		followSymlinks = true,
		fileFilter = () => true,
		dirFilter = () => true,
		maxDepth = Number.POSITIVE_INFINITY,
	} = options;

	const visited = new Set<string>();

	async function* walk(
		currentDir: string,
		depth: number,
	): AsyncGenerator<WalkEntry> {
		if (depth > maxDepth) return;

		const realDir = await realpath(currentDir).catch(() => currentDir);
		if (visited.has(realDir)) return;
		visited.add(realDir);

		let entries;
		try {
			entries = await readdir(currentDir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const fullPath = join(currentDir, entry.name);

			if (entry.isDirectory() || (followSymlinks && entry.isSymbolicLink())) {
				const stats = await stat(fullPath).catch(() => null);
				if (stats?.isDirectory()) {
					if (dirFilter(fullPath, entry.name)) {
						yield* walk(fullPath, depth + 1);
					}
				} else if (stats?.isFile() && fileFilter(fullPath, entry.name)) {
					yield {
						path: fullPath,
						name: entry.name,
						isSymlink: entry.isSymbolicLink(),
						realPath: await realpath(fullPath).catch(() => fullPath),
					};
				}
			} else if (entry.isFile() && fileFilter(fullPath, entry.name)) {
				yield {
					path: fullPath,
					name: entry.name,
					isSymlink: false,
					realPath: fullPath,
				};
			}
		}
	}

	yield* walk(dir, 0);
}

/**
 * Collect all files from a directory walk into an array.
 */
export async function collectFiles(
	dir: string,
	options: WalkOptions = {},
): Promise<WalkEntry[]> {
	const files: WalkEntry[] = [];
	for await (const entry of walkDirectory(dir, options)) {
		files.push(entry);
	}
	return files;
}
