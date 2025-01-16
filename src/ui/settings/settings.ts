import { App, Modal, Setting } from "obsidian";
import type { SettingValues } from "./settings_store";

export class SettingsModal extends Modal {
	constructor(
		app: App,
		private settings: SettingValues,
		private readonly onSubmit: (newSettings: SettingValues) => void
	) {
		super(app);
	}
	onOpen() {
		this.contentEl.createEl("h1", { text: "Settings" });

		new Setting(this.contentEl)
			.setName("Columns")
			.setDesc('The column names separated by a comma ","')
			.setClass("column")
			.addText((text) => {
				text.setValue(this.settings.columns.join(", "));
				text.onChange((value) => {
					this.settings.columns = value
						.split(",")
						.map((column) => column.trim());
				});
			});

		new Setting(this.contentEl)
			.setName("Folder scope")
			.setDesc("Where should we try to find tasks for this Kanban?")
			.addDropdown((dropdown) => {
				dropdown.addOption("folder", "This folder");
				dropdown.addOption("everywhere", "Every folder");
				dropdown.setValue(this.settings.scope);
				dropdown.onChange((value) => {
					this.settings.scope = value as "folder" | "everywhere";
				});
			});

		new Setting(this.contentEl)
			.setName("Show filepath")
			.setDesc("Show the filepath on each task in Kanban?")
			.addToggle((toggle) => {
				toggle.setValue(this.settings.showFilepath ?? true);
				toggle.onChange((value) => {
					this.settings.showFilepath = value;
				});
			});

		new Setting(this.contentEl)
			.setName("Hide uncategorized column")
			.setDesc("Hide the column for tasks that don't have a column tag assigned")
			.addToggle((toggle) => {
				toggle.setValue(this.settings.preventUncategorized ?? false);
				toggle.onChange((value) => {
					this.settings.preventUncategorized = value;
				});
			});

		new Setting(this.contentEl)
			.setName("Consolidate tags")
			.setDesc(
				"Consolidate the tags on each task in Kanban into the footer?"
			)
			.addToggle((toggle) => {
				toggle.setValue(this.settings.consolidateTags ?? false);
				toggle.onChange((value) => {
					this.settings.consolidateTags = value;
				});
			});

		new Setting(this.contentEl).addButton((btn) =>
			btn.setButtonText("Save").onClick(() => {
				this.close();
				this.onSubmit(this.settings);
			})
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}
