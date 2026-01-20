export interface Section {
	heading: string;
	level: number;
	content: string;
	startLine: number;
	endLine: number;
}

interface HeadingInfo {
	heading: string;
	level: number;
	lineIndex: number;
}

export function parseSections(content: string): Section[] {
	const lines = content.split("\n");
	const headings: HeadingInfo[] = [];
	let inFence = false;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const trimmed = line.trim();
		if (trimmed.startsWith("```")) {
			inFence = !inFence;
			continue;
		}

		if (inFence) {
			continue;
		}

		const match = /^(#{1,6})\s+(.*)$/.exec(line);
		if (!match) {
			continue;
		}

		headings.push({
			heading: match[2].trim(),
			level: match[1].length,
			lineIndex: index,
		});
	}

	const sections: Section[] = [];
	for (let index = 0; index < headings.length; index += 1) {
		const heading = headings[index];
		let endExclusive = lines.length;
		for (let next = index + 1; next < headings.length; next += 1) {
			if (headings[next].level <= heading.level) {
				endExclusive = headings[next].lineIndex;
				break;
			}
		}

		const contentLines = lines.slice(heading.lineIndex + 1, endExclusive);
		const startLine = heading.lineIndex + 1;
		const endLine =
			contentLines.length > 0
				? heading.lineIndex + contentLines.length + 1
				: startLine;
		sections.push({
			heading: heading.heading,
			level: heading.level,
			content: contentLines.join("\n"),
			startLine,
			endLine,
		});
	}

	return sections;
}

export function getSection(
	content: string,
	heading: string,
): Section | undefined {
	return parseSections(content).find((section) => section.heading === heading);
}
