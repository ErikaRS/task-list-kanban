import type { App } from "obsidian";
import type { GlobalSettings } from "../settings/global_settings";
import { toSettingsPayload } from "../kanban_frontmatter";
import { PATH_SCOPE_FRONTMATTER_KEY, parsePathScope } from "../tasks/path_scope";
import type { BoardSnapshotHost } from "./board_snapshot";

/**
 * The app-backed snapshot host shared by dashboard counts and embedded
 * boards. Reads only through `cachedRead`; settings come from the metadata
 * cache. It has no write path.
 */
export function createVaultSnapshotHost(
	app: App,
	getGlobalSettings: () => GlobalSettings,
): BoardSnapshotHost {
	return {
		getMarkdownFiles: () => app.vault.getMarkdownFiles(),
		cachedRead: (file) => app.vault.cachedRead(file),
		getBoardSettingsPayload: (file) =>
			toSettingsPayload(app.metadataCache.getFileCache(file)?.frontmatter?.["kanban_plugin"]),
		getBoardPathScope: (file) =>
			parsePathScope(app.metadataCache.getFileCache(file)?.frontmatter?.[PATH_SCOPE_FRONTMATTER_KEY]),
		getGlobalSettings,
	};
}
