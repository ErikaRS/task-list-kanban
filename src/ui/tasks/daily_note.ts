import type { App } from "obsidian";
import { hasDateTemplate, resolveDateTemplate } from "./path_scope";

/**
 * Stored in `defaultTaskFile` / `lastUsedTaskFile` to name Today's daily note
 * as a destination, never a dated path (SPEC 0054). Follows the `$TODAY`
 * convention used by date filters.
 */
export const DAILY_NOTE_TARGET = "$DAILY_NOTE";

/** Moment format the core Daily notes plugin uses when its format is blank. */
const CORE_DEFAULT_FORMAT = "YYYY-MM-DD";

export type DailyNoteSource =
	| { kind: "override"; pattern: string }
	| { kind: "core"; pattern: string; templatePath: string | null }
	| { kind: "unconfigured" };

export interface CoreDailyNoteOptions {
	folder: string;
	format: string;
	template: string;
}

/**
 * Reads the core Daily notes plugin's options. They are only reachable
 * through Obsidian's internal plugin registry, which has no public type, so
 * every step is checked: a disabled or missing plugin, or options of an
 * unexpected shape, read as "not configured".
 */
export function readCoreDailyNoteOptions(app: App): CoreDailyNoteOptions | null {
	try {
		const registry = (app as unknown as { internalPlugins?: unknown }).internalPlugins;
		const plugin = isRecord(registry) && typeof registry.getPluginById === "function"
			? (registry.getPluginById as (id: string) => unknown).call(registry, "daily-notes")
			: undefined;
		if (!isRecord(plugin) || plugin.enabled !== true) return null;
		const instance = plugin.instance;
		if (!isRecord(instance)) return null;
		const options = instance.options ?? {};
		if (!isRecord(options)) return null;
		return {
			folder: stringOption(options.folder),
			format: stringOption(options.format),
			template: stringOption(options.template),
		};
	} catch {
		return null;
	}
}

/** Pure source selection; `getDailyNoteSource` supplies the core options. */
export function dailyNoteSourceFrom(
	dailyNotePath: string,
	coreOptions: CoreDailyNoteOptions | null,
): DailyNoteSource {
	const override = dailyNotePath.trim();
	if (override !== "") {
		return { kind: "override", pattern: override };
	}
	if (!coreOptions) {
		return { kind: "unconfigured" };
	}
	const folder = coreOptions.folder.trim().replace(/^\/+|\/+$/g, "");
	const format = coreOptions.format.trim() || CORE_DEFAULT_FORMAT;
	// One `{{...}}` around the whole format handles nested formats such as
	// `YYYY/MM/YYYY-MM-DD`: Moment emits `/` unchanged.
	const fileName = `{{${format}}}.md`;
	const template = coreOptions.template.trim();
	return {
		kind: "core",
		pattern: folder ? `${folder}/${fileName}` : fileName,
		templatePath: template ? withMarkdownExtension(template) : null,
	};
}

export function getDailyNoteSource(app: App, dailyNotePath: string): DailyNoteSource {
	return dailyNoteSourceFrom(dailyNotePath, readCoreDailyNoteOptions(app));
}

/** Today's vault-relative note path, or null when unconfigured or invalid. */
export function resolveDailyNotePath(source: DailyNoteSource, now = new Date()): string | null {
	if (source.kind === "unconfigured") return null;
	const resolved = resolveDateTemplate(source.pattern, now);
	return resolved ? withMarkdownExtension(resolved) : null;
}

export type DailyNotePathIssue = { level: "error" | "warning"; message: string };

/**
 * Validates the Daily note path setting. Blank is valid (core Daily notes
 * apply). A path with no date pattern is allowed but warned about, because
 * it names the same file every day.
 */
export function getDailyNotePathIssue(dailyNotePath: string): DailyNotePathIssue | null {
	const pattern = dailyNotePath.trim();
	if (pattern === "") return null;
	if (resolveDailyNotePath({ kind: "override", pattern }) === null) {
		return { level: "error", message: "Invalid vault-relative path template." };
	}
	if (!hasDateTemplate(pattern)) {
		return {
			level: "warning",
			message: "No {{...}} date pattern: this names the same note every day.",
		};
	}
	return null;
}

/**
 * Tasks only live in Markdown files, so a pattern written without the
 * extension (`daily/{{YYYY-MM-DD}}`) names the `.md` note. A check for "any
 * extension" would misread dotted dates such as `2026.11.01`.
 */
function withMarkdownExtension(path: string): string {
	return /\.md$/i.test(path) ? path : `${path}.md`;
}

function stringOption(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
