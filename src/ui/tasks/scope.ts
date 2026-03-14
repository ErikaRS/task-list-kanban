export function shouldIncludeFilePath(
	filePath: string,
	filenameFilter: string[] | null
): boolean {
	if (filenameFilter === null) {
		return true;
	}

	return filenameFilter.some((folder) => {
		const filter = folder.replace(/^\//, "").replace(/\/$/, "");
		return filePath === filter || filePath.startsWith(`${filter}/`);
	});
}
