import { App, Modal } from "obsidian";

export interface ConfirmModalOptions {
	title: string;
	body: string;
	/** Optional fine print rendered under the body. */
	note?: string;
	confirmText: string;
	onConfirm: () => void | Promise<void>;
}

/**
 * A destructive-action confirmation: Cancel (focused by default, so Enter
 * is safe) plus a warning-styled confirm button that stays disabled while
 * an async onConfirm runs.
 */
export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly options: ConfirmModalOptions,
	) {
		super(app);
	}

	onOpen() {
		this.contentEl.addClass("task-list-kanban-confirm-modal");
		this.contentEl.createEl("h2", { text: this.options.title });
		this.contentEl.createEl("p", { text: this.options.body });
		if (this.options.note) {
			this.contentEl.createEl("p", {
				text: this.options.note,
				cls: "setting-item-description",
			});
		}

		const actions = this.contentEl.createDiv({ cls: "confirm-modal-actions" });
		const cancelButton = actions.createEl("button", { text: "Cancel" });
		cancelButton.addEventListener("click", () => this.close());
		const confirmButton = actions.createEl("button", {
			text: this.options.confirmText,
			cls: "mod-warning",
		});
		confirmButton.addEventListener("click", async () => {
			confirmButton.disabled = true;
			try {
				await this.options.onConfirm();
				this.close();
			} finally {
				confirmButton.disabled = false;
			}
		});
		window.requestAnimationFrame(() => cancelButton.focus());
	}

	onClose() {
		this.contentEl.empty();
	}
}
