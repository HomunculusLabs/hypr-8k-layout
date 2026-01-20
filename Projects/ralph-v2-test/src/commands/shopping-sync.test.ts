import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { syncShoppingList } from "./shopping-sync";

async function setupVault(): Promise<{
	vaultPath: string;
	todosPath: string;
	shoppingListPath: string;
}> {
	const vaultPath = await mkdtemp(path.join(tmpdir(), "vault-tools-"));
	const todosPath = path.join(vaultPath, "6 - Atomic Notes", "Todos");
	await mkdir(todosPath, { recursive: true });
	const shoppingListPath = path.join(vaultPath, "Shopping List.md");
	return { vaultPath, todosPath, shoppingListPath };
}

test("creates shopping list, dedups items, and preserves categories", async () => {
	const { todosPath, shoppingListPath, vaultPath } = await setupVault();

	await writeFile(
		path.join(todosPath, "Fix Pump.md"),
		[
			"# Fix Pump",
			"",
			"## Shopping",
			"### Hardware Store",
			"- [ ] Pressure gauge",
			"- [x] 5-gallon pressure tank",
			"",
		].join("\n"),
	);
	await writeFile(
		path.join(todosPath, "Weekend.md"),
		[
			"# Weekend",
			"",
			"## Shopping",
			"- [ ] Pressure gauge",
			"- [ ] Bread",
			"",
		].join("\n"),
	);

	await syncShoppingList({ vaultPath, todosPath, shoppingListPath });
	const list = await readFile(shoppingListPath, "utf8");

	expect(list).toContain("# Shopping List");
	expect(list).toContain("## Hardware Store");
	expect(list).toContain("- [x] 5-gallon pressure tank");
	expect(list).toContain("## Uncategorized");
	expect(list).toContain("- [ ] Bread ([[Weekend]])");
	expect(list).toContain("- [ ] Pressure gauge ([[Fix Pump]], [[Weekend]])");
});

test("syncs completion state between shopping list and todos", async () => {
	const { todosPath, shoppingListPath, vaultPath } = await setupVault();

	const todoPath = path.join(todosPath, "Errands.md");
	await writeFile(
		todoPath,
		["# Errands", "", "## Shopping", "- [ ] Milk", ""].join("\n"),
	);

	await syncShoppingList({ vaultPath, todosPath, shoppingListPath });
	let list = await readFile(shoppingListPath, "utf8");
	list = list.replace("- [ ] Milk", "- [x] Milk");
	await writeFile(shoppingListPath, list);

	await syncShoppingList({ vaultPath, todosPath, shoppingListPath });
	const updatedTodo = await readFile(todoPath, "utf8");
	expect(updatedTodo).toContain("- [x] Milk");

	const todoCheckedPath = path.join(todosPath, "Repair.md");
	await writeFile(
		todoCheckedPath,
		["# Repair", "", "## Shopping", "- [x] Bolts", ""].join("\n"),
	);

	await syncShoppingList({ vaultPath, todosPath, shoppingListPath });
	const updatedList = await readFile(shoppingListPath, "utf8");
	expect(updatedList).toContain("- [x] Bolts ([[Repair]])");
});
