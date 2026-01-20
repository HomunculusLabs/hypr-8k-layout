import { MARKDOWN } from "../constants";

export interface Checkbox {
	checked: boolean;
	text: string;
	raw: string;
	line: number;
	indent: number;
}

const checkboxPattern = MARKDOWN.checkbox;

export function parseCheckboxes(content: string): Checkbox[] {
	const lines = content.split("\n");
	const checkboxes: Checkbox[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const match = checkboxPattern.exec(line);
		if (!match) {
			continue;
		}

		checkboxes.push({
			checked: match[3].toLowerCase() === "x",
			text: match[4] ?? "",
			raw: line,
			line: index + 1,
			indent: match[1].length,
		});
	}

	return checkboxes;
}

export function setCheckboxState(line: string, checked: boolean): string {
	const match = checkboxPattern.exec(line);
	if (!match) {
		return line;
	}

	const marker = checked ? "x" : " ";
	const text = match[4] ? ` ${match[4]}` : "";
	return `${match[1]}${match[2]} [${marker}]${text}`;
}
