import type { BoardIndexEntry } from "./board_index";

export type BoardRenameTarget =
	| { ok: true; path: string }
	| { ok: false; reason: string };

/**
 * The vault path a board would get from a new name. Renames never move the
 * file: the board's folder is preserved and only the basename changes.
 *
 * Pure on purpose — the Obsidian rename glue lives in rename_board_modal.ts,
 * since a runtime `obsidian` import cannot load under vitest.
 */
export function boardRenameTarget(
	entry: Pick<BoardIndexEntry, "path" | "folder">,
	newName: string,
): BoardRenameTarget {
	const trimmed = newName.trim();
	if (trimmed === "") {
		return { ok: false, reason: "Board name cannot be empty." };
	}
	if (/[\\/]/.test(trimmed)) {
		return { ok: false, reason: "Board name cannot contain path separators." };
	}
	// The vault root folder's path is "/"; nested folders never end in one.
	const folderPrefix =
		entry.folder === "" || entry.folder === "/" ? "" : `${entry.folder}/`;
	return { ok: true, path: `${folderPrefix}${trimmed}.md` };
}
