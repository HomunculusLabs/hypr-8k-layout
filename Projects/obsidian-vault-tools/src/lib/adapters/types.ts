export interface VaultFile {
	path: string;
	name: string;
	extension: string;
}

export interface VaultAdapter {
	// Reading
	getMarkdownFiles(): Promise<VaultFile[]>;
	getMarkdownFilesInFolder(folder: string): Promise<VaultFile[]>;
	readFile(path: string): Promise<string>;
	fileExists(path: string): Promise<boolean>;

	// Writing
	writeFile(path: string, content: string): Promise<void>;
	createFile(path: string, content: string): Promise<void>;

	// Metadata
	getFileStats(path: string): Promise<{ mtime: Date; size: number }>;

	// Paths
	resolvePath(relativePath: string): string;
	getBasename(path: string, extension?: string): string;
}
