import { kebab } from "src/parsing/kebab/kebab";
import { isValidTag } from "src/parsing/tags/tags";
import { PropertySchemaOption } from "src/parsing/properties/property_schema";
import { TASKS_PRIORITY_OPTIONS } from "src/parsing/properties/tasks_schema";
import { RESERVED_COLUMN_KEYS, type ColumnDefinition } from "../columns/columns";
import {
	columnRuleSignature,
	getColumnPrioritySchema,
	getPriorityColumnLabel,
	normalizePriorityMatchValue,
	getStatusColumnLabel,
	usesPriorityMatching,
	usesStatusMatching,
	usesTagMatching,
} from "../columns/definitions";

export function getColumnValidationError(
	columns: ColumnDefinition[],
	options: {
		doneStatusMarkers?: string;
		ignoredStatusMarkers?: string;
		propertySchema?: PropertySchemaOption;
		originalColumns?: ColumnDefinition[];
	} = {},
): string | null {
	const errors: string[] = [];
	const seenSignatures = new Map<string, string>();
	const doneStatusMarkers = Array.from(options.doneStatusMarkers ?? "");
	const ignoredStatusMarkers = Array.from(options.ignoredStatusMarkers ?? "");
	const originalColumnsById = new Map((options.originalColumns ?? []).map((column) => [column.id, column]));

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

		if (usesStatusMatching(column)) {
			const marker = column.matchStatus;
			if (marker == null || marker.length === 0) {
				errors.push(`Column "${label}" must define a status marker.`);
				continue;
			}
			if (Array.from(marker).length !== 1) {
				errors.push(`Column "${label}" status marker must be a single character.`);
				continue;
			}
			if (marker !== " " && /\s/.test(marker)) {
				errors.push(`Column "${label}" status marker cannot be whitespace.`);
				continue;
			}
			if (doneStatusMarkers.includes(marker)) {
				errors.push(`Column "${label}" uses done status marker "${getStatusColumnLabel(marker)}".`);
				continue;
			}
			if (ignoredStatusMarkers.includes(marker)) {
				errors.push(`Column "${label}" uses ignored status marker "${getStatusColumnLabel(marker)}".`);
				continue;
			}
		}

		if (usesPriorityMatching(column)) {
			const priority = column.matchPriority?.trim();
			if (!priority) {
				errors.push(`Column "${label}" must define a priority.`);
				continue;
			}

			const originalColumn = originalColumnsById.get(column.id);
			const priorityRuleUnchanged =
				!!originalColumn &&
				usesPriorityMatching(originalColumn) &&
				columnRuleSignature(originalColumn) === columnRuleSignature(column);
			const columnPrioritySchema = getColumnPrioritySchema(column);
			const schemaMatches = options.propertySchema === columnPrioritySchema;
			if (!schemaMatches) {
				if (priorityRuleUnchanged) {
					continue;
				}
				if (options.propertySchema === PropertySchemaOption.None) {
					errors.push(`Column "${label}" uses priority matching, but task properties are disabled.`);
					continue;
				}
				errors.push(`Column "${label}" priority matching requires the ${columnPrioritySchema === PropertySchemaOption.Dataview ? "Dataview" : "Tasks Plugin"} property schema.`);
				continue;
			}
			if (columnPrioritySchema === PropertySchemaOption.TasksPlugin && !TASKS_PRIORITY_OPTIONS.some((option) => option.value === priority)) {
				errors.push(`Column "${label}" has an unknown priority "${priority}".`);
				continue;
			}
		}

		const signature = columnRuleSignature(column);
		const existingLabel = seenSignatures.get(signature);
		if (existingLabel) {
			const criterion = usesStatusMatching(column)
				? "status marker"
				: usesPriorityMatching(column)
				? `priority "${getPriorityColumnLabel(normalizePriorityMatchValue(column.matchPriority, getColumnPrioritySchema(column)))}"`
				: "tag";
			errors.push(`Columns "${existingLabel}" and "${label}" match the same ${criterion}.`);
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
