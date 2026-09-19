import { ScopeOption } from "../settings/settings_store";
import { type PathScopeV2, resolvePathScopePaths } from "./path_scope";

function normalizePath(path: string): string {
	return path.replace(/^\//, "").replace(/\/$/, "");
}

function pathMatchesFilter(filePath: string, filterPath: string): boolean {
	const normalized = normalizePath(filterPath);
	// If the folder filter is root (""), it matches all files
	if (normalized === "") {
		return true;
	}
	return filePath === normalized || filePath.startsWith(`${normalized}/`);
}

export function shouldIncludeFilePath(
	filePath: string,
	filenameFilter: string[] | null,
	excludeFilter?: string[] | null,
	boardFolderPath?: string | null,
	protectBoardFolderFromExcludes = true,
): boolean {
	if (filenameFilter !== null) {
		const included = filenameFilter.some((folder) =>
			pathMatchesFilter(filePath, folder)
		);
		if (!included) {
			return false;
		}
	}

	if (excludeFilter && excludeFilter.length > 0) {
		const normalizedBoard = boardFolderPath !== null && boardFolderPath !== undefined ? normalizePath(boardFolderPath) : null;

		const isExcluded = excludeFilter.some((excludePath) => {
			if (!pathMatchesFilter(filePath, excludePath)) {
				return false;
			}

			// Board folder override: if the exclude path is at or above the
			// board folder level, files in the board folder are protected.
			if (protectBoardFolderFromExcludes && normalizedBoard !== null) {
				const normalizedExclude = normalizePath(excludePath);
				const excludeCoversBoard =
					normalizedExclude === "" || // root exclude covers everything
					normalizedBoard === normalizedExclude ||
					normalizedBoard.startsWith(`${normalizedExclude}/`);

				if (excludeCoversBoard) {
					const fileInBoardFolder =
						normalizedBoard === "" || // if board is at root, every file is inside the board folder
						filePath === normalizedBoard ||
						filePath.startsWith(`${normalizedBoard}/`);
					if (fileInBoardFolder) {
						return false; // protected — don't exclude
					}
				}
			}

			return true;
		});

		if (isExcluded) {
			return false;
		}
	}

	return true;
}

/** Selected paths never receives legacy board-folder exclusion protection. */
export function getProtectedBoardFolderPath(
	scope: ScopeOption,
	boardFolderPath: string | null,
): string | null {
	return scope === ScopeOption.SelectedPaths ? null : boardFolderPath;
}

/**
 * The folder filter a board's scope settings resolve to: null means "search
 * everywhere". The board's own folder is always included, and duplicate
 * selected-folder entries of it are dropped.
 */
export function resolveScopeFilter(
	scope: ScopeOption,
	scopeFolders: string[] | undefined,
	boardFolderPath: string | null,
	pathScope?: PathScopeV2,
	now?: Date,
): string[] | null {
	switch (scope) {
		case ScopeOption.Folder:
			return boardFolderPath !== null ? [boardFolderPath] : null;
		case ScopeOption.SelectedFolders: {
			const selected = scopeFolders ?? [];
			return boardFolderPath !== null
				? [boardFolderPath, ...selected.filter((folder) => folder !== boardFolderPath)]
				: selected;
		}
		case ScopeOption.SelectedPaths: {
			if (!pathScope) return [];
			const paths = resolvePathScopePaths(pathScope, now);
			return pathScope.includeBoardFolder && boardFolderPath !== null
				? [boardFolderPath, ...paths.filter((path) => path !== boardFolderPath)]
				: paths;
		}
		default:
			return null;
	}
}
