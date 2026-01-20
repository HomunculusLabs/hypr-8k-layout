import { describe, expect, test } from "bun:test";
import {
	createWikilink,
	getSection,
	parseCheckboxes,
	parseNote,
	parseSections,
	parseWikilinks,
	serializeNote,
	setCheckboxState,
} from "../src/lib/markdown";

describe("markdown frontmatter", () => {
	test("parses and serializes frontmatter", () => {
		const input = "---\ntitle: Test\n---\nBody";
		const note = parseNote(input);
		expect(note.frontmatter).toEqual({ title: "Test" });
		expect(note.content).toBe("Body");

		const serialized = serializeNote(note);
		expect(serialized).toContain("title: Test");
		expect(serialized).toContain("Body");
	});

	test("handles missing or empty frontmatter", () => {
		const noFrontmatter = parseNote("Hello");
		expect(noFrontmatter.frontmatter).toEqual({});
		expect(noFrontmatter.content).toBe("Hello");

		const emptyFrontmatter = parseNote("---\n---\nText");
		expect(emptyFrontmatter.frontmatter).toEqual({});
		expect(emptyFrontmatter.content).toBe("Text");
	});
});

describe("wikilinks", () => {
	test("parses wikilinks and ignores code fences", () => {
		const content = [
			"Link to [[Page]] and [[Page|Display]].",
			"```ts",
			"const code = '[[Ignore]]';",
			"```",
			"Another [[Doc#Heading^block]].",
		].join("\n");

		const links = parseWikilinks(content);
		expect(links).toHaveLength(3);
		expect(links[0].target).toBe("Page");
		expect(links[1].display).toBe("Display");
		expect(links[2].heading).toBe("Heading");
		expect(links[2].block).toBe("block");
	});

	test("creates wikilinks", () => {
		expect(createWikilink("Test")).toBe("[[Test]]");
		expect(createWikilink("Test", "View")).toBe("[[Test|View]]");
	});
});

describe("checkboxes", () => {
	test("parses and sets checkbox state", () => {
		const content = ["- [ ] Task", "  - [x] Done", "Text"].join("\n");
		const checkboxes = parseCheckboxes(content);
		expect(checkboxes).toHaveLength(2);
		expect(checkboxes[0].checked).toBe(false);
		expect(checkboxes[0].indent).toBe(0);
		expect(checkboxes[1].checked).toBe(true);
		expect(checkboxes[1].indent).toBe(2);

		const updated = setCheckboxState("* [ ] Item", true);
		expect(updated).toBe("* [x] Item");
	});
});

describe("sections", () => {
	test("extracts sections and ignores code fences", () => {
		const content = [
			"# Title",
			"Intro",
			"## Sub",
			"Details",
			"```",
			"# Not a heading",
			"```",
			"# Next",
			"More",
		].join("\n");

		const sections = parseSections(content);
		expect(sections).toHaveLength(3);
		expect(sections[0].heading).toBe("Title");
		expect(sections[0].content).toContain("## Sub");
		expect(getSection(content, "Next")?.content).toBe("More");
	});
});
