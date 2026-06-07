import { PropertySchemaOption, type PropertySchema } from "./property_schema";
import { NoneSchema } from "./none_schema";
import { TasksPluginSchema } from "./tasks_schema";
import { DataviewSchema } from "./dataview_schema";

export * from "./property_schema";
export * from "./none_schema";
export * from "./tasks_schema";
export * from "./dataview_schema";
export * from "./value_parsers";
export * from "./normalization";
export * from "./comparators";
export * from "./display";

const SCHEMA_IMPLS: Record<PropertySchemaOption, PropertySchema> = {
	[PropertySchemaOption.None]: new NoneSchema(),
	[PropertySchemaOption.TasksPlugin]: new TasksPluginSchema(),
	[PropertySchemaOption.Dataview]: new DataviewSchema(),
};

export function getSchemaImpl(option: PropertySchemaOption): PropertySchema {
	return SCHEMA_IMPLS[option] ?? SCHEMA_IMPLS[PropertySchemaOption.None];
}
