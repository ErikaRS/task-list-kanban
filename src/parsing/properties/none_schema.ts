import {
	type PropertySchema,
	PropertySchemaOption,
	type TaskPropertyMap,
	type PropertyKeyMeta,
	createPropertyMapWithStatus,
	UNIVERSAL_STATUS_PROPERTY_KEY,
} from "./property_schema";

export class NoneSchema implements PropertySchema {
	id = PropertySchemaOption.None;
	label = "None";

	parseProperties(rawLine: string): TaskPropertyMap {
		return createPropertyMapWithStatus(rawLine);
	}

	knownKeys(): PropertyKeyMeta[] {
		return [
			{
				key: UNIVERSAL_STATUS_PROPERTY_KEY,
				label: "Status",
				type: "text",
			},
		];
	}
}
