import {
	type PropertySchema,
	PropertySchemaOption,
	type TaskPropertyMap,
	type PropertyKeyMeta,
	UNIVERSAL_STATUS_PROPERTY_KEY,
	parseUniversalStatus,
} from "./property_schema";

export class NoneSchema implements PropertySchema {
	id = PropertySchemaOption.None;
	label = "None";

	parseProperties(rawLine: string): TaskPropertyMap {
		const properties: TaskPropertyMap = new Map();
		const statusProp = parseUniversalStatus(rawLine);
		properties.set(UNIVERSAL_STATUS_PROPERTY_KEY, statusProp);
		return properties;
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
