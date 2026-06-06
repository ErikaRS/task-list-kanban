import { PropertySchemaOption, type PropertySchema } from "./property_schema";
import { NoneSchema } from "./none_schema";
import { TasksPluginSchema } from "./tasks_schema";
import { DataviewSchema } from "./dataview_schema";

export * from "./property_schema";
export * from "./none_schema";
export * from "./tasks_schema";
export * from "./dataview_schema";

export function getSchemaImpl(option: PropertySchemaOption): PropertySchema {
	switch (option) {
		case PropertySchemaOption.TasksPlugin:
			return new TasksPluginSchema();
		case PropertySchemaOption.Dataview:
			return new DataviewSchema();
		case PropertySchemaOption.None:
		default:
			return new NoneSchema();
	}
}
