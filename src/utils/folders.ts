import { normalizePath } from "obsidian";

function safeNormalize(path: string): string {
        try {
                return normalizePath(path);
        } catch {
                return path;
        }
}

function normalizeFolderPath(folderPath: string): string {
        const normalized = safeNormalize(folderPath);
        if (normalized === "") {
                return normalized;
        }
        return normalized.replace(/\/+$/, "");
}

export function isPathInsideFolder(filePath: string, folderPath: string): boolean {
        if (!folderPath) {
                return false;
        }

        const normalizedFile = safeNormalize(filePath);
        const normalizedFolder = normalizeFolderPath(folderPath);

        if (normalizedFolder === "." || normalizedFolder === "/") {
                return true;
        }

        if (normalizedFile === normalizedFolder) {
                return true;
        }

        const folderWithSlash = `${normalizedFolder}/`;
        return normalizedFile.startsWith(folderWithSlash);
}

export function normalizeExcludedFolders(
        excludeFolders: readonly string[] | undefined
): string[] {
        if (!excludeFolders || excludeFolders.length === 0) {
                return [];
        }

        const normalized: string[] = [];
        for (const folder of excludeFolders) {
                const trimmed = folder.trim();
                if (!trimmed) {
                        continue;
                }

                const normalizedFolder = normalizeFolderPath(trimmed);
                if (!normalizedFolder) {
                        continue;
                }

                if (!normalized.includes(normalizedFolder)) {
                        normalized.push(normalizedFolder);
                }
        }

        return normalized;
}

export function isPathExcluded(
        filePath: string,
        excludeFolders: readonly string[] | undefined
): boolean {
        const normalizedExcludes = normalizeExcludedFolders(excludeFolders);
        if (normalizedExcludes.length === 0) {
                return false;
        }

        return normalizedExcludes.some((folder) => isPathInsideFolder(filePath, folder));
}

export function shouldIncludeFilePath(
        filePath: string,
        options: { filenameFilter: string | null | undefined; excludeFolders?: readonly string[] }
): boolean {
        const { filenameFilter, excludeFolders } = options;

        if (filenameFilter && !isPathInsideFolder(filePath, filenameFilter)) {
                return false;
        }

        if (isPathExcluded(filePath, excludeFolders)) {
                return false;
        }

        return true;
}
