import { moment as obsidianMoment, TFile, type App, type Vault } from "obsidian";
import { hasDateTemplate, resolveDateTemplate } from "./path_scope";

/**
 * Stored in `defaultTaskFile` / `lastUsedTaskFile` to name Today's daily note
 * as a destination, never a dated path (SPEC 0054). Follows the `$TODAY`
 * convention used by date filters.
 */
export const DAILY_NOTE_TARGET = "$DAILY_NOTE";

/** Moment format the core Daily notes plugin uses when its format is blank. */
const CORE_DEFAULT_FORMAT = "YYYY-MM-DD";

/**
 * Where today's note lives (`pattern`) and how a new one starts. The core
 * Daily notes template applies whichever source sets the location, so an
 * override moves the note without dropping the user's template.
 */
export type DailyNoteSource =
	| { kind: "override" | "core"; pattern: string; dateFormat: string; templatePath: string | null }
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
	const format = coreOptions?.format.trim() || CORE_DEFAULT_FORMAT;
	const template = coreOptions?.template.trim().replace(/^\/+/, "") ?? "";
	const templatePath = template ? withMarkdownExtension(template) : null;
	const override = dailyNotePath.trim();
	if (override !== "") {
		return { kind: "override", pattern: override, dateFormat: format, templatePath };
	}
	if (!coreOptions) {
		return { kind: "unconfigured" };
	}
	const folder = coreOptions.folder.trim().replace(/^\/+|\/+$/g, "");
	// One `{{...}}` around the whole format handles nested formats such as
	// `YYYY/MM/YYYY-MM-DD`: Moment emits `/` unchanged.
	const fileName = `{{${format}}}.md`;
	return {
		kind: "core",
		pattern: folder ? `${folder}/${fileName}` : fileName,
		dateFormat: format,
		templatePath,
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
	if (resolveDailyNotePath(dailyNoteSourceFrom(pattern, null)) === null) {
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
 * Fills a core Daily notes template the way the core plugin does:
 * `{{date}}`, `{{time}}` and `{{title}}`, with optional `:FORMAT` on the
 * first two. Templater and Periodic Notes syntax is left untouched.
 */
export function applyCoreDailyNoteTemplate(
	template: string,
	{ now, dateFormat, title }: { now: Date; dateFormat: string; title: string },
): string {
	return template.replace(
		/\{\{\s*(date|time|title)\s*(?::(.*?))?\s*\}\}/gi,
		(_match, token: string, format: string | undefined) => {
			const kind = token.toLowerCase();
			if (kind === "title") return title;
			const pattern = format?.trim() || (kind === "date" ? dateFormat : "HH:mm");
			return formatDate(now, pattern);
		},
	);
}

/**
 * Creates today's daily note (and any missing parent folders) with
 * `buildContents(initialContents)`, where the initial contents are the core
 * Daily notes template when one is set, otherwise empty. Returns `created: false` with
 * the existing file when the note already exists, including when another
 * board created it first, so the caller inserts into it instead.
 */
export async function createDailyNote(
	vault: Vault,
	path: string,
	source: DailyNoteSource,
	now: Date,
	buildContents: (initialContents: string) => string,
): Promise<{ file: TFile; created: boolean }> {
	const existing = vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) return { file: existing, created: false };
	try {
		await ensureParentFolders(vault, path);
		const initialContents = await readInitialContents(vault, path, source, now);
		const file = await vault.create(path, buildContents(initialContents));
		return { file, created: true };
	} catch (error) {
		const raced = vault.getAbstractFileByPath(path);
		if (raced instanceof TFile) return { file: raced, created: false };
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`Could not create ${path}: ${reason}`);
	}
}

async function ensureParentFolders(vault: Vault, path: string): Promise<void> {
	const segments = path.split("/").slice(0, -1);
	for (let i = 1; i <= segments.length; i++) {
		const folder = segments.slice(0, i).join("/");
		if (vault.getAbstractFileByPath(folder)) continue;
		try {
			await vault.createFolder(folder);
		} catch (error) {
			// Another writer may have created it meanwhile.
			if (!vault.getAbstractFileByPath(folder)) throw error;
		}
	}
}

async function readInitialContents(
	vault: Vault,
	path: string,
	source: DailyNoteSource,
	now: Date,
): Promise<string> {
	if (source.kind === "unconfigured" || !source.templatePath) return "";
	const template = vault.getAbstractFileByPath(source.templatePath);
	if (!(template instanceof TFile)) return "";
	const title = path.split("/").pop()?.replace(/\.md$/i, "") ?? "";
	return applyCoreDailyNoteTemplate(await vault.read(template), {
		now,
		dateFormat: source.dateFormat,
		title,
	});
}

function formatDate(now: Date, pattern: string): string {
	// The Obsidian declaration exposes Moment as a namespace, even though
	// its runtime export is the callable Moment factory.
	return (obsidianMoment as unknown as (input: Date) => { format: (pattern: string) => string })(now)
		.format(pattern);
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
