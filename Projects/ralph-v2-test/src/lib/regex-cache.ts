const regexCache = new Map<string, RegExp>();

export function getCachedRegex(pattern: string, flags?: string): RegExp {
	const key = `${pattern}:${flags ?? ""}`;
	let regex = regexCache.get(key);
	if (!regex) {
		regex = new RegExp(pattern, flags);
		regexCache.set(key, regex);
	}
	return regex;
}
