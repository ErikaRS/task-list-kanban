import { dump, load } from "js-yaml";
import {
	parseSettingsString,
	toSettingsString,
	type SettingValues,
} from "./settings/settings_store";

const KANBAN_PLUGIN_KEY = "kanban_plugin";
const FRONTMATTER_DELIMITER = "---";

export function parseKanbanSettingsFromViewData(data: string): SettingValues {
	const parsed = parseFrontmatter(data);
	return parseSettingsString(toSettingsPayload(parsed.data[KANBAN_PLUGIN_KEY]));
}

export function writeKanbanSettingsToViewData(
	data: string,
	settings: SettingValues,
): string {
	const parsed = parseFrontmatter(data);
	return stringifyFrontmatter(parsed.content, {
		...parsed.data,
		[KANBAN_PLUGIN_KEY]: toSettingsString(settings),
	});
}

interface ParsedFrontmatter {
	data: Record<string, unknown>;
	content: string;
}

function parseFrontmatter(data: string): ParsedFrontmatter {
	if (!data.startsWith(FRONTMATTER_DELIMITER)) {
		return { data: {}, content: data };
	}

	if (data.charAt(FRONTMATTER_DELIMITER.length) === "-") {
		return { data: {}, content: data };
	}

	const startOfFrontmatter = data.indexOf("\n") + 1;
	if (startOfFrontmatter === 0) {
		return { data: {}, content: "" };
	}

	const endDelimiterStart = data.indexOf(`\n${FRONTMATTER_DELIMITER}`, startOfFrontmatter);
	const frontmatterEnd = endDelimiterStart === -1 ? data.length : endDelimiterStart;
	const rawFrontmatter = data.slice(startOfFrontmatter, frontmatterEnd);
	const parsed = rawFrontmatter.trim() === "" ? {} : load(rawFrontmatter);
	const frontmatter = isRecord(parsed) ? parsed : {};

	if (endDelimiterStart === -1) {
		return { data: frontmatter, content: "" };
	}

	let content = data.slice(endDelimiterStart + FRONTMATTER_DELIMITER.length + 1);
	if (content.startsWith("\r")) {
		content = content.slice(1);
	}
	if (content.startsWith("\n")) {
		content = content.slice(1);
	}

	return { data: frontmatter, content };
}

function stringifyFrontmatter(
	content: string,
	frontmatter: Record<string, unknown>,
): string {
	const rawFrontmatter = dump(frontmatter).trim();
	const prefix =
		rawFrontmatter === "{}"
			? ""
			: `${FRONTMATTER_DELIMITER}\n${rawFrontmatter}\n${FRONTMATTER_DELIMITER}\n`;

	return `${prefix}${ensureTrailingNewline(content)}`;
}

function ensureTrailingNewline(value: string): string {
	return value.endsWith("\n") ? value : `${value}\n`;
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
