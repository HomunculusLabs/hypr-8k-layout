import path from "node:path";
import type { App } from "obsidian";
import type { VaultAdapter, VaultFile } from "./types";

type FileLike = {
	path: string;
	basename: string;
	extension: string;
	stat: { mtime: number; size: number };
};

type FolderLike = {
	path: string;
	children: unknown[];
};

export class ObsidianVaultAdapter implements VaultAdapter {
	constructor(private app: App) {}

	async getMarkdownFiles(): Promise<VaultFile[]> {
		return this.app.vault.getMarkdownFiles().map((file) => ({
			path: file.path,
			name: file.basename,
			extension: file.extension,
		}));
	}

	async getMarkdownFilesInFolder(folder: string): Promise<VaultFile[]> {
		if (!folder) return this.getMarkdownFiles();
		const normalized = folder.endsWith("/") ? folder : `${folder}/`;
		return this.app.vault
			.getMarkdownFiles()
			.filter((file) => file.path === folder || file.path.startsWith(normalized))
			.map((file) => ({
				path: file.path,
				name: file.basename,
				extension: file.extension,
			}));
	}

	async readFile(filePath: string): Promise<string> {
		const file = this.getFile(filePath);
		return this.app.vault.read(file as any);
	}

	async fileExists(filePath: string): Promise<boolean> {
		return this.app.vault.getAbstractFileByPath(filePath) !== null;
	}

	async writeFile(filePath: string, content: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(filePath);
		if (isFile(existing)) {
			await this.app.vault.modify(existing as any, content);
			return;
		}
		await this.ensureFolder(path.dirname(filePath));
		await this.app.vault.create(filePath, content);
	}

	async createFile(filePath: string, content: string): Promise<void> {
		if (await this.fileExists(filePath)) {
			throw new Error(`File already exists: ${filePath}`);
		}
		await this.ensureFolder(path.dirname(filePath));
		await this.app.vault.create(filePath, content);
	}

	async getFileStats(
		filePath: string,
	): Promise<{ mtime: Date; size: number }> {
		const file = this.getFile(filePath);
		return { mtime: new Date(file.stat.mtime), size: file.stat.size };
	}

	resolvePath(relativePath: string): string {
		return relativePath;
	}

	getBasename(filePath: string, extension?: string): string {
		return path.basename(filePath, extension);
	}

	private getFile(filePath: string): FileLike {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (isFile(file)) {
			return file;
		}
		throw new Error(`File not found: ${filePath}`);
	}

	private async ensureFolder(folderPath: string): Promise<void> {
		if (!folderPath || folderPath === ".") return;
		const existing = this.app.vault.getAbstractFileByPath(folderPath);
		if (isFolder(existing)) return;
		await this.app.vault.createFolder(folderPath);
	}
}

function isFile(value: unknown): value is FileLike {
	if (!value || typeof value !== "object") return false;
	return (
		"stat" in value &&
		"extension" in value &&
		"basename" in value &&
		"path" in value
	);
}

function isFolder(value: unknown): value is FolderLike {
	if (!value || typeof value !== "object") return false;
	return "children" in value && "path" in value;
}
