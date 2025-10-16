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

export function isPathExcluded(
        filePath: string,
        excludeFolders: readonly string[] | undefined
): boolean {
        if (!excludeFolders || excludeFolders.length === 0) {
                return false;
        }

        return excludeFolders.some((folder) => isPathInsideFolder(filePath, folder));
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
