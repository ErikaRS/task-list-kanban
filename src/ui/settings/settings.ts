import { App, Modal, Setting, normalizePath, TFolder } from "obsidian";
import type { SettingValues } from "./settings_store";
import {
        VisibilityOption,
        ScopeOption,
        defaultSettings,
} from "../settings/settings_store";
import { z } from "zod";
import {
        DEFAULT_DONE_STATUS_MARKERS,
        DEFAULT_IGNORED_STATUS_MARKERS,
        validateDoneStatusMarkers,
        validateIgnoredStatusMarkers,
} from "../tasks/task";
import { FolderSuggest } from "./folder_suggest";
import { normalizeExcludedFolders } from "../../utils/folders";

const VisibilityOptionSchema = z.nativeEnum(VisibilityOption);
const ScopeOptionSchema = z.nativeEnum(ScopeOption);

export class SettingsModal extends Modal {
        constructor(
                app: App,
                private settings: SettingValues,
                private readonly onSubmit: (newSettings: SettingValues) => void
        ) {
                super(app);
        }

        private updateExcludedFolders(
                transform: (folders: string[]) => readonly string[]
        ): string[] {
                const current = [...(this.settings.excludeFolders ?? [])];
                const transformed = transform(current);
                const normalized = normalizeExcludedFolders(transformed);
                this.settings.excludeFolders = normalized;
                return normalized;
        }

        private safeNormalize(path: string): string {
                try {
                        return normalizePath(path);
                } catch {
                        return path;
                }
        }

        private pruneMissingExcludedFolders() {
                const current = normalizeExcludedFolders(this.settings.excludeFolders ?? []);
                const foldersInVault = new Set(
                        this.app.vault
                                .getAllLoadedFiles()
                                .filter((file): file is TFolder => file instanceof TFolder)
                                .map((folder) => this.safeNormalize(folder.path))
                );

                const filtered: string[] = [];
                for (const path of current) {
                        const normalized = this.safeNormalize(path);
                        if (foldersInVault.has(normalized) && !filtered.includes(normalized)) {
                                filtered.push(normalized);
                        }
                }

                const changed =
                        filtered.length !== current.length ||
                        filtered.some((value, index) => value !== current[index]);

                if (changed) {
                        this.settings.excludeFolders = filtered;
                        this.emitImmediateSettingsUpdate();
                } else {
                        this.settings.excludeFolders = filtered;
                }
        }

        private emitImmediateSettingsUpdate() {
                const clone = JSON.parse(JSON.stringify(this.settings)) as SettingValues;
                this.onSubmit(clone);
        }

        onOpen() {
                this.contentEl.createEl("h1", { text: "Settings" });

                this.pruneMissingExcludedFolders();

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
				dropdown.addOption(ScopeOption.Folder, "This folder");
				dropdown.addOption(ScopeOption.Everywhere, "Every folder");
				dropdown.setValue(this.settings.scope);
				dropdown.onChange((value) => {
					const validatedValue = ScopeOptionSchema.safeParse(value);
					this.settings.scope = validatedValue.success
						? validatedValue.data
                                                : defaultSettings.scope;
                                });
                        });

                const excludedFoldersSetting = new Setting(this.contentEl)
                        .setName("Excluded folders")
                        .setDesc(
                                "When set to Entire Vault (or a parent folder), files in these folders will be ignored."
                        );

                const excludedFoldersContainer = excludedFoldersSetting.controlEl.createDiv({
                        cls: "tasklist-kanban-excluded-folders",
                });

                const renderExcludedFolders = () => {
                        const folders = normalizeExcludedFolders(
                                this.settings.excludeFolders ?? []
                        );
                        this.settings.excludeFolders = folders;
                        excludedFoldersContainer.empty();

                        if (folders.length === 0) {
                                excludedFoldersContainer.createDiv({
                                        text: "No excluded folders",
                                        cls: "setting-item-description",
                                });
                                return;
                        }

                        for (const path of folders) {
                                const chip = excludedFoldersContainer.createDiv({
                                        cls: "tasklist-kanban-excluded-chip",
                                });
                                chip.createSpan({ text: path });
                                const removeButton = chip.createEl("button", {
                                        text: "×",
                                        cls: "tasklist-kanban-excluded-chip-remove",
                                        attr: { "aria-label": `Remove ${path} from excluded folders` },
                                });
                                removeButton.addEventListener("click", () => {
                                        const updated = this.updateExcludedFolders((folders) =>
                                                folders.filter((folderPath) => folderPath !== path)
                                        );
                                        if (updated.includes(path)) {
                                                return;
                                        }
                                        renderExcludedFolders();
                                        this.emitImmediateSettingsUpdate();
                                });
                        }
                };

                excludedFoldersSetting.addButton((btn) => {
                        btn.setButtonText("Add folder");
                        btn.onClick(() => {
                                const modal = new FolderSuggest(this.app, (folder) => {
                                        const path = this.safeNormalize(folder.path);
                                        const updated = this.updateExcludedFolders((folders) => [
                                                ...folders,
                                                path,
                                        ]);
                                        if (!updated.includes(path)) {
                                                return;
                                        }
                                        renderExcludedFolders();
                                        this.emitImmediateSettingsUpdate();
                                });
                                modal.open();
                        });
                });

                renderExcludedFolders();

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
			.setName("Uncategorized column visibility")
			.setDesc("When to show the Uncategorized column")
			.addDropdown((dropdown) => {
				dropdown
					.addOption(VisibilityOption.AlwaysShow, "Always show")
					.addOption(VisibilityOption.Auto, "Hide when empty")
					.addOption(VisibilityOption.NeverShow, "Never show")
					.setValue(
						this.settings.uncategorizedVisibility ??
							VisibilityOption.Auto
					)
					.onChange((value) => {
						const validatedValue =
							VisibilityOptionSchema.safeParse(value);
						this.settings.uncategorizedVisibility =
							validatedValue.success
								? validatedValue.data
								: defaultSettings.uncategorizedVisibility;
					});
			});

		new Setting(this.contentEl)
			.setName("Done column visibility")
			.setDesc("When to show the Done column")
			.addDropdown((dropdown) => {
				dropdown
					.addOption(VisibilityOption.AlwaysShow, "Always show")
					.addOption(VisibilityOption.Auto, "Hide when empty")
					.addOption(VisibilityOption.NeverShow, "Never show")
					.setValue(
						this.settings.doneVisibility ?? VisibilityOption.Auto
					)
					.onChange((value) => {
						const validatedValue =
							VisibilityOptionSchema.safeParse(value);
						this.settings.doneVisibility = validatedValue.success
							? validatedValue.data
							: defaultSettings.doneVisibility;
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

		new Setting(this.contentEl)
			.setName("Done status markers")
			.setDesc(
				"Characters that mark a task as done (e.g., 'xX' for [x] and [X]). Each character should be a single Unicode character without spaces."
			)
			.addText((text) => {
				text.setValue(this.settings.doneStatusMarkers ?? DEFAULT_DONE_STATUS_MARKERS);
				text.onChange((value) => {
					// Validate the input and provide immediate feedback
					const errors = validateDoneStatusMarkers(value);
					if (errors.length > 0) {
						text.inputEl.style.borderColor = "var(--text-error)";
						text.inputEl.title = `Invalid: ${errors.join(', ')}`;
					} else {
						text.inputEl.style.borderColor = "";
						text.inputEl.title = "Valid done status markers";
						this.settings.doneStatusMarkers = value;
					}
				});
			});

		new Setting(this.contentEl)
			.setName("Ignored status markers")
			.setDesc(
				"Characters that mark tasks to be completely ignored by the kanban (e.g., '-' for [-] cancelled tasks). Leave empty to process all task-like strings. Each character should be a single Unicode character without spaces."
			)
			.addText((text) => {
				text.setValue(this.settings.ignoredStatusMarkers ?? DEFAULT_IGNORED_STATUS_MARKERS);
				text.onChange((value) => {
					// Validate the input and provide immediate feedback
					const errors = validateIgnoredStatusMarkers(value);
					if (errors.length > 0) {
						text.inputEl.style.borderColor = "var(--text-error)";
						text.inputEl.title = `Invalid: ${errors.join(', ')}`;
					} else {
						text.inputEl.style.borderColor = "";
						text.inputEl.title = "Valid ignored status markers";
						this.settings.ignoredStatusMarkers = value;
					}
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
