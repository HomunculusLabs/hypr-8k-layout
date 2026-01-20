export const OUTPUT_FORMATS = ["console", "json", "markdown"] as const;

export const OUTPUT_FORMAT = {
	console: OUTPUT_FORMATS[0],
	json: OUTPUT_FORMATS[1],
	markdown: OUTPUT_FORMATS[2],
} as const;

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const TOP_BACKLINKS_COUNT = 10;
export const TOP_TAGS_COUNT = 10;
export const TOP_FIELDS_COUNT = 10;
export const TOP_COOCURRENCE_COUNT = 10;

export const FILENAMES = {
	lintReport: "Frontmatter Lint Report.md",
	staleTodosReport: "Stale Todos Report.md",
	projectDashboard: "Projects Dashboard.md",
	linkCheckReport: "Broken Links.md",
	ralphQueue: "Ralph Queue.md",
	vaultStatsReport: "Vault Stats.md",
} as const;

export const MARKDOWN = {
	frontmatterDelimiter: "---",
	horizontalRule: "---",
	codeBlockFence: /^```/,
	wikilink: /\[\[([^\]]+)\]\]/g,
	wikilinkWithEmbed: /!?\[\[([^\]]+)\]\]/g,
	heading: /^(#{1,6})\s+(.+)$/,
	checkbox: /^(\s*)([-*])\s+\[( |x|X)\]\s*(.*)$/,
	tag: /(^|\s)#([A-Za-z0-9/_-]+)/g,
} as const;
