import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import type { VaultAdapter, VaultFile } from "./types";
import { walkDirectory } from "../fs/walk";

export class BunVaultAdapter implements VaultAdapter {
	constructor(private vaultPath: string) {}

	async getMarkdownFiles(): Promise<VaultFile[]> {
		await this.assertDirectory(this.vaultPath);
		return this.collectMarkdownFiles(this.vaultPath);
	}

	async getMarkdownFilesInFolder(folder: string): Promise<VaultFile[]> {
		const resolved = this.resolvePath(folder);
		await this.assertDirectory(resolved);
		return this.collectMarkdownFiles(resolved);
	}

	async readFile(filePath: string): Promise<string> {
		return Bun.file(this.resolvePath(filePath)).text();
	}

	async fileExists(filePath: string): Promise<boolean> {
		try {
			await stat(this.resolvePath(filePath));
			return true;
		} catch {
			return false;
		}
	}

	async writeFile(filePath: string, content: string): Promise<void> {
		const resolved = this.resolvePath(filePath);
		await mkdir(path.dirname(resolved), { recursive: true });
		await Bun.write(resolved, content);
	}

	async createFile(filePath: string, content: string): Promise<void> {
		const resolved = this.resolvePath(filePath);
		if (await this.fileExists(resolved)) {
			throw new Error(`File already exists: ${resolved}`);
		}
		await this.writeFile(resolved, content);
	}

	async getFileStats(
		filePath: string,
	): Promise<{ mtime: Date; size: number }> {
		const stats = await stat(this.resolvePath(filePath));
		return { mtime: stats.mtime, size: stats.size };
	}

	resolvePath(relativePath: string): string {
		if (path.isAbsolute(relativePath)) return relativePath;
		return path.join(this.vaultPath, relativePath);
	}

	getBasename(filePath: string, extension?: string): string {
		return path.basename(filePath, extension);
	}

	private async collectMarkdownFiles(root: string): Promise<VaultFile[]> {
		const files: VaultFile[] = [];
		for await (const entry of walkDirectory(root, {
			fileFilter: (_, name) => name.endsWith(".md"),
		})) {
			files.push({
				path: entry.path,
				name: path.basename(entry.path, ".md"),
				extension: "md",
			});
		}
		return files;
	}

	private async assertDirectory(folder: string): Promise<void> {
		const stats = await stat(folder).catch(() => null);
		if (!stats || !stats.isDirectory()) {
			throw new Error(`Not a directory: ${folder}`);
		}
	}
}
