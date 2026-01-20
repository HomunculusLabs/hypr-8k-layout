import YAML from "yaml";

export interface ParsedNote {
	frontmatter: Record<string, unknown>;
	content: string;
}

export function parseNote(content: string): ParsedNote {
	const lines = content.split("\n");

	if (lines[0] !== "---") {
		return { frontmatter: {}, content };
	}

	const endIndex = lines.indexOf("---", 1);
	if (endIndex === -1) {
		return { frontmatter: {}, content };
	}

	const frontmatterText = lines.slice(1, endIndex).join("\n");
	let frontmatter: Record<string, unknown> = {};
	if (frontmatterText.trim().length > 0) {
		frontmatter = YAML.parse(frontmatterText) as Record<string, unknown>;
	}

	const body = lines.slice(endIndex + 1).join("\n");
	return { frontmatter, content: body };
}

export function serializeNote(note: ParsedNote): string {
	const content = note.content ?? "";
	const frontmatter = note.frontmatter ?? {};
	const hasFrontmatter = Object.keys(frontmatter).length > 0;

	if (!hasFrontmatter) {
		return content;
	}

	const yaml = YAML.stringify(frontmatter).trimEnd();
	const header = yaml.length > 0 ? `---\n${yaml}\n---` : "---\n---";
	return content.length > 0 ? `${header}\n${content}` : `${header}\n`;
}
