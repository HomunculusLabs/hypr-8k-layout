import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectFiles } from "./walk";

describe("walkDirectory", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await mkdtemp(join(tmpdir(), "walk-test-"));
		await mkdir(join(testDir, "sub"));
		await writeFile(join(testDir, "a.md"), "");
		await writeFile(join(testDir, "b.txt"), "");
		await writeFile(join(testDir, "sub", "c.md"), "");
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	it("finds all files", async () => {
		const files = await collectFiles(testDir);
		expect(files).toHaveLength(3);
	});

	it("filters by extension", async () => {
		const files = await collectFiles(testDir, {
			fileFilter: (_, name) => name.endsWith(".md"),
		});
		expect(files).toHaveLength(2);
	});

	it("handles symlink cycles", async () => {
		await symlink(testDir, join(testDir, "loop"));
		const files = await collectFiles(testDir);
		expect(files.length).toBeGreaterThan(0);
	});
});
