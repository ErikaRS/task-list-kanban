import matter from "gray-matter";
import {
	parseSettingsString,
	toSettingsString,
	type SettingValues,
} from "./settings/settings_store";

const KANBAN_PLUGIN_KEY = "kanban_plugin";

export function parseKanbanSettingsFromViewData(data: string): SettingValues {
	const parsed = matter(data);
	return parseSettingsString(toSettingsPayload(parsed.data[KANBAN_PLUGIN_KEY]));
}

export function writeKanbanSettingsToViewData(
	data: string,
	settings: SettingValues,
): string {
	const parsed = matter(data);
	return matter.stringify(parsed.content, {
		...parsed.data,
		[KANBAN_PLUGIN_KEY]: toSettingsString(settings),
	});
}

function toSettingsPayload(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}

	if (value == null) {
		return "";
	}

	return JSON.stringify(value);
}
