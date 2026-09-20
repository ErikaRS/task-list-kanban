import { TFile, type Vault, type Workspace } from "obsidian";

export type SourceFileOpenMode = "all" | "unopened";

export interface SourcePathTask {
	path: string;
}

export interface ResolvedSourceFiles {
	files: TFile[];
	unavailablePaths: string[];
}

export interface OpenSourceFilesResult {
	openedPaths: string[];
	skippedAlreadyOpenPaths: string[];
	unavailablePaths: string[];
	failedPaths: string[];
}

/** Rewrites saved file choices after either a source file or folder rename. */
export function migrateSourceFileSelectionPaths(
	selection: Record<string, boolean> | undefined,
	oldPath: string,
	newPath: string,
): Record<string, boolean> | null {
	if (!selection) return null;
	let changed = false;
	const next: Record<string, boolean> = {};
	for (const [path, checked] of Object.entries(selection)) {
		const migrated = path === oldPath
			? newPath
			: path.startsWith(`${oldPath}/`)
				? `${newPath}${path.slice(oldPath.length)}`
				: path;
		changed ||= migrated !== path;
		next[migrated] = checked;
	}
	return changed ? next : null;
}

/** Returns each task source path once, in a stable vault-path order. */
export function sourcePathsFromTasks(tasks: readonly SourcePathTask[]): string[] {
	return [...new Set(tasks.map((task) => task.path))].sort((a, b) =>
		a.localeCompare(b),
	);
}

/**
 * Resolves paths immediately before opening so a deleted or replaced source
 * note is never passed to WorkspaceLeaf.openFile.
 */
export function resolveSourceFiles(
	vault: Pick<Vault, "getAbstractFileByPath">,
	paths: readonly string[],
): ResolvedSourceFiles {
	const files: TFile[] = [];
	const unavailablePaths: string[] = [];
	for (const path of [...new Set(paths)].sort((a, b) => a.localeCompare(b))) {
		const file = vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			files.push(file);
		} else {
			unavailablePaths.push(path);
		}
	}
	return { files, unavailablePaths };
}

/**
 * Finds Markdown tabs through serialized view state. This intentionally does
 * not touch leaf.view: inactive tabs can be DeferredViews and loading them
 * just to inspect their file would be surprising.
 */
export function openedMarkdownPaths(
	workspace: Pick<Workspace, "iterateAllLeaves">,
): Set<string> {
	const paths = new Set<string>();
	workspace.iterateAllLeaves((leaf) => {
		try {
			const viewState = leaf.getViewState();
			const file = viewState.type === "markdown" ? viewState.state?.file : undefined;
			if (typeof file === "string") {
				paths.add(file);
			}
		} catch (error) {
			// A transient workspace leaf should not prevent other source files
			// from opening. In particular, do not access leaf.view as fallback:
			// that could force a deferred view to load.
			console.warn("Failed to inspect an open workspace leaf", error);
		}
	});
	return paths;
}

/** Opens every eligible source note in a new tab, exactly once per path. */
export async function openSourceFiles({
	vault,
	workspace,
	paths,
	mode,
}: {
	vault: Pick<Vault, "getAbstractFileByPath">;
	workspace: Pick<Workspace, "iterateAllLeaves" | "getLeaf">;
	paths: readonly string[];
	mode: SourceFileOpenMode;
}): Promise<OpenSourceFilesResult> {
	const { files, unavailablePaths } = resolveSourceFiles(vault, paths);
	const openPaths = openedMarkdownPaths(workspace);
	const eligibleFiles = mode === "unopened"
		? files.filter((file) => !openPaths.has(file.path))
		: files;
	const skippedAlreadyOpenPaths = mode === "unopened"
		? files.filter((file) => openPaths.has(file.path)).map((file) => file.path)
		: [];
	const openedPaths: string[] = [];
	const failedPaths: string[] = [];

	for (const file of eligibleFiles) {
		try {
			await workspace.getLeaf("tab").openFile(file);
			openedPaths.push(file.path);
		} catch (error) {
			console.error(`Failed to open source file ${file.path}`, error);
			failedPaths.push(file.path);
		}
	}

	return { openedPaths, skippedAlreadyOpenPaths, unavailablePaths, failedPaths };
}
