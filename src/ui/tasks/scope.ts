function normalizePath(path: string): string {
	return path.replace(/^\//, "").replace(/\/$/, "");
}

function pathMatchesFilter(filePath: string, filterPath: string): boolean {
	const normalized = normalizePath(filterPath);
	return filePath === normalized || filePath.startsWith(`${normalized}/`);
}

export function shouldIncludeFilePath(
	filePath: string,
	filenameFilter: string[] | null,
	excludeFilter?: string[] | null,
	boardFolderPath?: string | null
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
		const normalizedBoard = boardFolderPath ? normalizePath(boardFolderPath) : null;

		const isExcluded = excludeFilter.some((excludePath) => {
			if (!pathMatchesFilter(filePath, excludePath)) {
				return false;
			}

			// Board folder override: if the exclude path is at or above the
			// board folder level, files in the board folder are protected.
			if (normalizedBoard) {
				const normalizedExclude = normalizePath(excludePath);
				const excludeCoversBoard =
					normalizedBoard === normalizedExclude ||
					normalizedBoard.startsWith(`${normalizedExclude}/`);

				if (excludeCoversBoard) {
					const fileInBoardFolder =
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
