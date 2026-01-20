/**
 * Coerce various truthy representations to boolean.
 */
export function coerceBool(value: unknown): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const lower = value.toLowerCase().trim();
		return lower === "true" || lower === "yes" || lower === "1";
	}
	if (typeof value === "number") return value !== 0;
	return false;
}

/**
 * Parse and validate a date string (YYYY-MM-DD).
 */
export function coerceDate(value: string): Date | null {
	const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return null;

	const year = parseInt(match[1], 10);
	const month = parseInt(match[2], 10);
	const day = parseInt(match[3], 10);

	if (month < 1 || month > 12) return null;
	if (day < 1 || day > 31) return null;

	const date = new Date(year, month - 1, day);
	if (date.getMonth() !== month - 1) return null;

	return date;
}
