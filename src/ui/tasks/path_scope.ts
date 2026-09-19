import moment from "moment";

export const PATH_SCOPE_FRONTMATTER_KEY = "kanban_plugin_path_scope_v2";

export interface PathScopeCompatibilityProjection {
	scope: "folder" | "everywhere" | "selectedFolders";
	scopeFolders: string[];
}

/** Canonical, board-local exact-path scope persisted outside kanban_plugin. */
export interface PathScopeV2 {
	version: 2;
	mode: "selectedPaths";
	active: boolean;
	paths: string[];
	includeBoardFolder: boolean;
	compatibilityProjection: PathScopeCompatibilityProjection;
}

export function normalizeVaultRelativePath(raw: string): string | null {
	const normalized = raw.trim().replace(/^\/+/, "").replace(/\/+$/, "");
	if (normalized === "") return null;
	const parts = normalized.split("/");
	if (parts.some((part) => part === "" || part === "." || part === "..")) {
		return null;
	}
	return normalized;
}

export function hasDateTemplate(path: string): boolean {
	return /\{\{[^{}]*\}\}/.test(path);
}

export function resolveDateTemplate(path: string, now = new Date()): string | null {
	let invalid = false;
	const resolved = path.replace(/\{\{([^{}]*)\}\}/g, (_match, format: string) => {
		if (format.trim() === "") {
			invalid = true;
			return "";
		}
		return moment(now).format(format);
	});
	if (invalid || /\{\{|\}\}/.test(resolved)) return null;
	return normalizeVaultRelativePath(resolved);
}

function normalisePathSet(paths: readonly string[]): string[] | null {
	const normalized = paths
		.map(normalizeVaultRelativePath)
		.filter((path): path is string => path !== null);
	if (normalized.length !== paths.length) return null;
	return [...new Set(normalized)].sort();
}

export function createPathScope(
	paths: readonly string[],
	includeBoardFolder = false,
): PathScopeV2 | null {
	const normalized = normalisePathSet(paths);
	if (normalized === null) return null;
	if (normalized.some((path) => /\{\{|\}\}/.test(path) && resolveDateTemplate(path) === null)) {
		return null;
	}
	return {
		version: 2,
		mode: "selectedPaths",
		active: true,
		paths: normalized,
		includeBoardFolder,
		compatibilityProjection: {
			scope: "selectedFolders",
			scopeFolders: normalized,
		},
	};
}

export function parsePathScope(value: unknown): PathScopeV2 | undefined {
	if (!isRecord(value) || value.version !== 2 || value.mode !== "selectedPaths") {
		return undefined;
	}
	if (!Array.isArray(value.paths) || typeof value.includeBoardFolder !== "boolean") {
		return undefined;
	}
	if (value.active !== undefined && typeof value.active !== "boolean") return undefined;
	const paths = normalisePathSet(value.paths.filter((path): path is string => typeof path === "string"));
	if (paths === null || paths.length !== value.paths.length) return undefined;
	if (paths.some((path) => /\{\{|\}\}/.test(path) && resolveDateTemplate(path) === null)) {
		return undefined;
	}
	if (!isRecord(value.compatibilityProjection) ||
		(value.compatibilityProjection.scope !== "folder" &&
			value.compatibilityProjection.scope !== "everywhere" &&
			value.compatibilityProjection.scope !== "selectedFolders")) {
		return undefined;
	}
	const rawCompatibilityFolders = value.compatibilityProjection.scopeFolders;
	if (!Array.isArray(rawCompatibilityFolders)) return undefined;
	const compatibilityFolders = normalisePathSet(
		rawCompatibilityFolders.filter((path): path is string => typeof path === "string"),
	);
	if (compatibilityFolders === null || compatibilityFolders.length !== rawCompatibilityFolders.length) {
		return undefined;
	}
	return {
		version: 2,
		mode: "selectedPaths",
		active: value.active === undefined ? true : value.active === true,
		paths,
		includeBoardFolder: value.includeBoardFolder,
		compatibilityProjection: {
			scope: value.compatibilityProjection.scope,
			scopeFolders: compatibilityFolders,
		},
	};
}

export function pathScopeMatchesLegacy(
	pathScope: PathScopeV2,
	legacyScope: unknown,
	legacyFolders: unknown,
): boolean {
	if (legacyScope !== pathScope.compatibilityProjection.scope || !Array.isArray(legacyFolders)) {
		return false;
	}
	const folders = normalisePathSet(legacyFolders.filter((path): path is string => typeof path === "string"));
	if (folders === null || folders.length !== legacyFolders.length) return false;
	return folders.length === pathScope.compatibilityProjection.scopeFolders.length &&
		folders.every((path, index) => path === pathScope.compatibilityProjection.scopeFolders[index]);
}

export function setPathScopeActive(
	pathScope: PathScopeV2,
	active: boolean,
	legacyScope: "folder" | "everywhere" | "selectedFolders",
	legacyFolders: readonly string[],
): PathScopeV2 | null {
	const folders = normalisePathSet(legacyFolders);
	if (folders === null) return null;
	return {
		...pathScope,
		active,
		compatibilityProjection: { scope: legacyScope, scopeFolders: folders },
	};
}

export function resolvePathScopePaths(pathScope: PathScopeV2, now = new Date()): string[] {
	return pathScope.paths
		.map((path) => resolveDateTemplate(path, now))
		.filter((path): path is string => path !== null);
}

export function pathScopeHasDateTemplate(pathScope: PathScopeV2 | undefined): boolean {
	return !!pathScope?.active && pathScope.paths.some(hasDateTemplate);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
