import { TFile, type App } from "obsidian";

export type TrashBoardResult =
	| { ok: true }
	| { ok: false; reason: "missing" | "failed"; error?: unknown };

export async function trashBoardFile(
	app: Pick<App, "vault" | "fileManager">,
	path: string,
): Promise<TrashBoardResult> {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) {
		return { ok: false, reason: "missing" };
	}
	try {
		await app.fileManager.trashFile(file);
		return { ok: true };
	} catch (error) {
		return { ok: false, reason: "failed", error };
	}
}
