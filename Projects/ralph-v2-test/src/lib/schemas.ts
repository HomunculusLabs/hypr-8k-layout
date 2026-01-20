import { z } from "zod";

const countsByFolderSchema = z.object({
	folder: z.string(),
	count: z.number(),
	percent: z.number(),
});

const countsByTypeSchema = z.object({
	type: z.string(),
	count: z.number(),
	percent: z.number(),
});

const mostLinkedSchema = z.object({
	note: z.string(),
	backlinks: z.number(),
});

const cooccurrenceSchema = z.object({
	pair: z.tuple([z.string(), z.string()]),
	count: z.number(),
});

const weekdaySchema = z.object({
	day: z.string(),
	count: z.number(),
});

export const vaultStatsSchema = z.object({
	generatedAt: z.string(),
	vaultPath: z.string(),
	rootPath: z.string(),
	filesScanned: z.number(),
	totals: z.object({
		notes: z.number(),
		words: z.number(),
		characters: z.number(),
		avgWords: z.number(),
		avgCharacters: z.number(),
	}),
	countsByFolder: z.array(countsByFolderSchema),
	countsByType: z.array(countsByTypeSchema),
	links: z.object({
		total: z.number(),
		avgPerNote: z.number(),
		mostLinked: z.array(mostLinkedSchema),
		orphans: z.array(z.string()),
		deadEnds: z.array(z.string()),
		linkDensity: z.number(),
	}),
	tags: z.object({
		counts: z.record(z.number()),
		untagged: z.number(),
		cooccurrence: z.array(cooccurrenceSchema),
	}),
	activity: z.object({
		byDay: z.record(z.number()),
		byWeek: z.record(z.number()),
		byMonth: z.record(z.number()),
		recent: z.object({
			last7: z.number(),
			last30: z.number(),
		}),
		mostActiveWeekdays: z.array(weekdaySchema),
	}),
	frontmatter: z.object({
		fieldUsage: z.record(z.number()),
		enumDistributions: z.record(z.record(z.number())),
		missingRequired: z.record(z.record(z.number())),
	}),
	warnings: z.array(z.string()),
});

const outputFormatSchema = z.union([
	z.literal("console"),
	z.literal("json"),
	z.literal("markdown"),
]);

const frontmatterFieldTypeSchema = z.union([
	z.literal("string"),
	z.literal("date"),
	z.literal("enum"),
	z.literal("array"),
]);

const frontmatterSchemaFieldSchema = z.object({
	type: frontmatterFieldTypeSchema,
	required: z.boolean().optional(),
	values: z.array(z.string()).optional(),
	default: z.unknown().optional(),
});

const frontmatterSchemaMatchSchema = z.object({
	folder: z.string().optional(),
	filename: z.string().optional(),
	frontmatter: z.record(z.unknown()).optional(),
});

const frontmatterSchemaSchema = z.object({
	match: frontmatterSchemaMatchSchema.optional(),
	fields: z.record(frontmatterSchemaFieldSchema),
});

export const vaultToolsConfigSchema = z.object({
	vault: z.object({
		path: z.string(),
		todosFolder: z.string(),
		projectsFolder: z.string(),
		dailyFolder: z.string(),
		templatesFolder: z.string(),
	}),
	output: z.object({
		format: outputFormatSchema,
		color: z.boolean(),
		verbose: z.boolean(),
	}),
	schemas: z.record(frontmatterSchemaSchema),
});
