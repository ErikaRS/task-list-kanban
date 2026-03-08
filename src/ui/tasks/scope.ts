export function shouldIncludeFilePath(
	filePath: string,
	filenameFilter: string | null
): boolean {
	const filter = filenameFilter?.replace(/^\//, "");

	if (!filter) {
		return true;
	}

	return filePath === filter || filePath.startsWith(`${filter}/`);
}
