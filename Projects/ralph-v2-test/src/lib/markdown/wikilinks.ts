export interface WikiLink {
	target: string;
	display?: string;
	heading?: string;
	block?: string;
	raw: string;
	start: number;
	end: number;
}

interface WikiLinkParts {
	target: string;
	heading?: string;
	block?: string;
	display?: string;
}

function parseLinkParts(raw: string): WikiLinkParts {
	const [targetPart, display] = raw.split("|", 2);
	let target = targetPart;
	let heading: string | undefined;
	let block: string | undefined;

	const hashIndex = targetPart.indexOf("#");
	const caretIndex = targetPart.indexOf("^");

	if (hashIndex !== -1 && (caretIndex === -1 || hashIndex < caretIndex)) {
		target = targetPart.slice(0, hashIndex);
		const afterHash = targetPart.slice(hashIndex + 1);
		const caretInAfter = afterHash.indexOf("^");
		if (caretInAfter !== -1) {
			heading = afterHash.slice(0, caretInAfter);
			block = afterHash.slice(caretInAfter + 1);
		} else {
			heading = afterHash;
		}
	} else if (caretIndex !== -1) {
		target = targetPart.slice(0, caretIndex);
		block = targetPart.slice(caretIndex + 1);
	}

	return {
		target,
		heading: heading || undefined,
		block: block || undefined,
		display: display?.length ? display : undefined,
	};
}

export function parseWikilinks(content: string): WikiLink[] {
	const links: WikiLink[] = [];
	const lines = content.split("\n");
	let offset = 0;
	let inFence = false;
	const wikilinkRegex = /\[\[([^\]]+)\]\]/g;

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith("```")) {
			inFence = !inFence;
			offset += line.length + 1;
			continue;
		}

		if (!inFence) {
			wikilinkRegex.lastIndex = 0;
			let match = wikilinkRegex.exec(line);
			while (match) {
				const raw = match[0];
				const inner = match[1];
				const parts = parseLinkParts(inner);
				const start = offset + match.index;
				const end = start + raw.length;
				links.push({
					target: parts.target,
					display: parts.display,
					heading: parts.heading,
					block: parts.block,
					raw,
					start,
					end,
				});
				match = wikilinkRegex.exec(line);
			}
		}

		offset += line.length + 1;
	}

	return links;
}

export function createWikilink(target: string, display?: string): string {
	if (display) {
		return `[[${target}|${display}]]`;
	}

	return `[[${target}]]`;
}
