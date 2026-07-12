import { TFile, type App } from "obsidian";

export type TrashBoardResult =
	| { ok: true }
	| { ok: false; reason: "missing" | "failed"; error?: unknown };

export async function trashBoardFile(
	app: Pick<App, "vault">,
	path: string,
): Promise<TrashBoardResult> {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) {
		return { ok: false, reason: "missing" };
	}
	try {
		await app.vault.trash(file, true);
		return { ok: true };
	} catch (error) {
		return { ok: false, reason: "failed", error };
	}
}
