export type SelectOption = {
	label: string;
	value: string;
};

export function toValidSelectedOptions(
	selected: unknown,
	availableValues: ReadonlySet<string>,
): SelectOption[] {
	if (!Array.isArray(selected)) {
		return [];
	}

	const validSelections: SelectOption[] = [];
	for (const entry of selected) {
		if (
			typeof entry === "object" &&
			entry !== null &&
			"label" in entry &&
			"value" in entry
		) {
			const label = (entry as { label: unknown }).label;
			const value = (entry as { value: unknown }).value;
			if (
				typeof label === "string" &&
				typeof value === "string" &&
				availableValues.has(value)
			) {
				validSelections.push(entry as SelectOption);
			}
		}
	}

	return validSelections;
}
