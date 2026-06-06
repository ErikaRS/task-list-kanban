export const DATE_ONLY_PATTERN = "\\d{4}-\\d{2}-\\d{2}";

export function parseDateOnly(value: string): Date | null {
	const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return null;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const parsed = new Date(Date.UTC(year, month - 1, day));

	return parsed.getUTCFullYear() === year &&
		parsed.getUTCMonth() === month - 1 &&
		parsed.getUTCDate() === day
		? parsed
		: null;
}

export function parseIsoDate(value: string): Date | null {
	const trimmed = value.trim();
	const dateOnly = parseDateOnly(trimmed);
	if (dateOnly) return dateOnly;

	if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?$/.test(trimmed)) {
		const parsed = new Date(trimmed);
		return isNaN(parsed.getTime()) ? null : parsed;
	}

	return null;
}

export function parseNumber(value: string): number | null {
	const trimmed = value.trim();
	if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;

	const parsed = Number(trimmed);
	return isNaN(parsed) ? null : parsed;
}

export function escapeRegExp(input: string): string {
	return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
