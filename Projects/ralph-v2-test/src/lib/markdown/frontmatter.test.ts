import { describe, expect, it } from "bun:test";
import { parseNote } from "./frontmatter";

describe("parseNote frontmatter edge cases", () => {
	it("handles missing closing delimiter", () => {
		const content = "---\ntitle: Test\nNo closing delimiter";
		const result = parseNote(content);
		expect(result.frontmatter).toEqual({});
		expect(result.content).toBe(content);
	});

	it("handles invalid YAML syntax", () => {
		const content = "---\ntitle: [unclosed bracket\n---\nBody";
		const result = parseNote(content);
		expect(result.frontmatter).toEqual({});
		expect(result.content).toBe("Body");
	});

	it("handles empty frontmatter", () => {
		const content = "---\n---\nBody";
		const result = parseNote(content);
		expect(result.frontmatter).toEqual({});
		expect(result.content).toBe("Body");
	});

	it("handles whitespace-only frontmatter", () => {
		const content = "---\n   \n---\nBody";
		const result = parseNote(content);
		expect(result.frontmatter).toEqual({});
		expect(result.content).toBe("Body");
	});

	it("handles binary-like content without throwing", () => {
		const content = "---\ntitle: \u0000\u0001\u0002\n---\nBody";
		expect(() => parseNote(content)).not.toThrow();
	});
});
