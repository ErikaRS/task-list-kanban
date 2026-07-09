import { App, Modal, Notice, TFile } from "obsidian";
import type { BoardIndexEntry } from "./board_index";
import { boardRenameTarget } from "./board_rename";

/**
 * Renames through `fileManager` (not `vault.rename`) so links to the board
 * elsewhere in the vault are updated. Returns whether the modal may close.
 */
async function renameBoardFile(
	app: App,
	entry: BoardIndexEntry,
	newName: string,
): Promise<boolean> {
	const target = boardRenameTarget(entry, newName);
	if (!target.ok) {
		new Notice(target.reason);
		return false;
	}
	if (target.path === entry.path) {
		return true;
	}
	const source = app.vault.getAbstractFileByPath(entry.path);
	if (!(source instanceof TFile)) {
		new Notice("Board file not found.");
		return false;
	}
	if (app.vault.getAbstractFileByPath(target.path)) {
		new Notice(`A file named "${target.path}" already exists.`);
		return false;
	}
	try {
		await app.fileManager.renameFile(source, target.path);
		return true;
	} catch (error) {
		console.error("Failed to rename board", error);
		new Notice("Failed to rename board.");
		return false;
	}
}

/**
 * Name prompt for renaming a board from the tab strip. Enter or the Rename
 * button submits; the modal stays open when the rename is rejected (empty
 * name, collision), so the user can correct the name.
 */
export class RenameBoardModal extends Modal {
	constructor(
		app: App,
		private readonly entry: BoardIndexEntry,
	) {
		super(app);
	}

	onOpen() {
		this.contentEl.addClass("task-list-kanban-confirm-modal");
		this.contentEl.createEl("h2", { text: "Rename board" });
		this.contentEl.createEl("p", {
			text: `Rename "${this.entry.path}" without moving it.`,
			cls: "setting-item-description",
		});

		const input = this.contentEl.createEl("input", {
			type: "text",
			value: this.entry.name,
		});
		input.style.width = "100%";

		const actions = this.contentEl.createDiv({ cls: "confirm-modal-actions" });
		const cancelButton = actions.createEl("button", { text: "Cancel" });
		cancelButton.addEventListener("click", () => this.close());
		const renameButton = actions.createEl("button", {
			text: "Rename",
			cls: "mod-cta",
		});

		const submit = async () => {
			renameButton.disabled = true;
			try {
				if (await renameBoardFile(this.app, this.entry, input.value)) {
					this.close();
				}
			} finally {
				renameButton.disabled = false;
			}
		};
		renameButton.addEventListener("click", () => void submit());
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				void submit();
			}
		});

		window.requestAnimationFrame(() => {
			input.focus();
			input.select();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
