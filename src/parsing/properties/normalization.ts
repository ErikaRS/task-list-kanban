import type { TaskProperty, TaskPropertyMap } from "./property_schema";

export const CANONICAL_PROPERTY_KEYS = [
	"status",
	"due",
	"scheduled",
	"start",
	"done",
	"created",
	"priority",
	"recurrence",
] as const;

export type CanonicalPropertyKey = typeof CANONICAL_PROPERTY_KEYS[number];

const PROPERTY_KEY_ALIASES: Record<string, CanonicalPropertyKey> = {
	completion: "done",
	repeat: "recurrence",
};

export function normalizePropertyKey(key: string): string {
	return PROPERTY_KEY_ALIASES[key] ?? key;
}

export function getPropertyAliases(key: string): string[] {
	const canonicalKey = normalizePropertyKey(key);
	const aliases = Object.entries(PROPERTY_KEY_ALIASES)
		.filter(([, canonical]) => canonical === canonicalKey)
		.map(([alias]) => alias);

	return [
		...(canonicalKey !== key ? [canonicalKey] : []),
		...aliases.filter((alias) => alias !== key),
	];
}

export function getPropertyByKey(properties: TaskPropertyMap, key: string): TaskProperty | undefined {
	const exactMatch = properties.get(key);
	if (exactMatch) return exactMatch;

	const canonicalKey = normalizePropertyKey(key);
	for (const [propertyKey, property] of properties) {
		if (normalizePropertyKey(propertyKey) === canonicalKey) {
			return property;
		}
	}

	return undefined;
}

export function createCanonicalPropertyMap(properties: TaskPropertyMap): TaskPropertyMap {
	const canonicalProperties: TaskPropertyMap = new Map();

	for (const [propertyKey, property] of properties) {
		const canonicalKey = normalizePropertyKey(propertyKey);
		if (!canonicalProperties.has(canonicalKey)) {
			canonicalProperties.set(canonicalKey, property);
		}
	}

	return canonicalProperties;
}
