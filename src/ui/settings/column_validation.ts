import { kebab } from "src/parsing/kebab/kebab";
import { isValidTag } from "src/parsing/tags/tags";
import { RESERVED_COLUMN_KEYS, type ColumnDefinition } from "../columns/columns";
import { columnRuleSignature, usesTagMatching } from "../columns/definitions";

export function getColumnValidationError(columns: ColumnDefinition[]): string | null {
	const errors: string[] = [];
	const seenSignatures = new Map<string, string>();

	for (const column of columns) {
		const label = column.label.trim();
		if (label.length === 0) {
			errors.push("Column labels cannot be empty.");
			continue;
		}

		const derivedTag = kebab(label);
		if (RESERVED_COLUMN_KEYS.has(derivedTag)) {
			errors.push(`Column name "${label}" conflicts with a built-in column.`);
		}

		if (usesTagMatching(column) && column.matchTags.length === 0) {
			errors.push(`Column "${label}" must define at least one explicit tag.`);
			continue;
		}

		if (usesTagMatching(column)) {
			for (const tag of column.matchTags) {
				if (!isValidTag(tag)) {
					errors.push(`Column "${label}" has an invalid tag "${tag}".`);
					break;
				}
			}
		}

		const signature = columnRuleSignature(column);
		const existingLabel = seenSignatures.get(signature);
		if (existingLabel) {
			errors.push(`Columns "${existingLabel}" and "${label}" match the same tag.`);
		} else {
			seenSignatures.set(signature, label);
		}

		if (usesTagMatching(column) && column.matchTags.length === 1) {
			const nameEquivalent = `name:${kebab(column.matchTags[0]!)}`;
			const nameCollision = seenSignatures.get(nameEquivalent);
			if (nameCollision) {
				errors.push(`Columns "${nameCollision}" and "${label}" match the same tag.`);
			}
		}

		if (column.matchMode === "name") {
			const tagsEquivalent = `tags:${derivedTag}`;
			const tagsCollision = seenSignatures.get(tagsEquivalent);
			if (tagsCollision) {
				errors.push(`Columns "${tagsCollision}" and "${label}" match the same tag.`);
			}
		}
	}

	return errors.length > 0 ? errors[0]! : null;
}
