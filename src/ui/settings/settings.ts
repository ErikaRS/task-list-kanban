import { App, Modal, Setting, TFile } from "obsidian";
import type { SettingValues } from "./settings_store";
import {
	VisibilityOption,
	ScopeOption,
	FlowDirection,
	defaultSettings,
} from "../settings/settings_store";
import { z } from "zod";
import { DEFAULT_DONE_STATUS_MARKERS, DEFAULT_CANCELLED_STATUS_MARKERS, DEFAULT_IGNORED_STATUS_MARKERS, validateDoneStatusMarkers, validateCancelledStatusMarkers, validateIgnoredStatusMarkers } from "../tasks/task";
import { shouldIncludeFilePath } from "../tasks/scope";

const VisibilityOptionSchema = z.nativeEnum(VisibilityOption);
const ScopeOptionSchema = z.nativeEnum(ScopeOption);
const FlowDirectionSchema = z.nativeEnum(FlowDirection);

export class SettingsModal extends Modal {
	constructor(
		app: App,
		private settings: SettingValues,
		private readonly onSubmit: (newSettings: SettingValues) => void,
		private readonly boardFolderPath: string | null
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
			.setName("Column width")
			.setDesc("Width of task cards in pixels (200-600)")
			.addSlider((slider) => {
				slider
					.setLimits(200, 600, 10)
					.setValue(this.settings.columnWidth ?? 300)
					.setDynamicTooltip()
					.onChange((value) => {
						this.settings.columnWidth = value;
					});
			});

		new Setting(this.contentEl)
			.setName("Flow direction")
			.setDesc("Direction columns flow across the board")
			.addDropdown((dropdown) => {
				dropdown
					.addOption(FlowDirection.LeftToRight, "Left to right")
					.addOption(FlowDirection.RightToLeft, "Right to left")
					.addOption(FlowDirection.TopToBottom, "Top to bottom")
					.addOption(FlowDirection.BottomToTop, "Bottom to top")
					.setValue(
						this.settings.flowDirection ?? FlowDirection.LeftToRight
					)
					.onChange((value) => {
						const validatedValue = FlowDirectionSchema.safeParse(value);
						this.settings.flowDirection = validatedValue.success
							? validatedValue.data
							: defaultSettings.flowDirection;
					});
			});

		// Validation for default task file — shared between scope dropdown and text input
		let defaultTaskFileInputEl: HTMLInputElement | null = null;
		let defaultTaskFileErrorEl: HTMLElement | null = null;
		const setDefaultTaskFileError = (message: string) => {
			if (!defaultTaskFileInputEl) return;
			if (message) {
				defaultTaskFileInputEl.style.outline =
					"2px solid var(--text-error)";
				defaultTaskFileInputEl.style.outlineOffset = "-1px";
				defaultTaskFileInputEl.title = message;
				if (defaultTaskFileErrorEl) {
					defaultTaskFileErrorEl.setText(message);
					defaultTaskFileErrorEl.style.visibility = "visible";
				}
			} else {
				defaultTaskFileInputEl.style.outline = "";
				defaultTaskFileInputEl.style.outlineOffset = "";
				defaultTaskFileInputEl.title = "";
				if (defaultTaskFileErrorEl) {
					defaultTaskFileErrorEl.setText("");
					defaultTaskFileErrorEl.style.visibility = "hidden";
				}
			}
		};
		const validateDefaultTaskFile = () => {
			const value = this.settings.defaultTaskFile ?? "";
			if (!value) {
				setDefaultTaskFileError("");
				return;
			}
			const abstractFile =
				this.app.vault.getAbstractFileByPath(value);
			if (!(abstractFile instanceof TFile)) {
				setDefaultTaskFileError("File not found");
				return;
			}
			let scopeFilter: string[] | null;
			switch (this.settings.scope) {
				case ScopeOption.Folder:
					scopeFilter = this.boardFolderPath
						? [this.boardFolderPath]
						: null;
					break;
				case ScopeOption.SelectedFolders:
					scopeFilter = this.settings.scopeFolders ?? [];
					break;
				default:
					scopeFilter = null;
					break;
			}
			if (!shouldIncludeFilePath(value, scopeFilter)) {
				setDefaultTaskFileError(
					"File is outside the board's folder scope"
				);
				return;
			}
			setDefaultTaskFileError("");
		};

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
					validateDefaultTaskFile();
				});
			});

		const defaultTaskFileSetting = new Setting(this.contentEl)
			.setName("Default task file")
			.setDesc(
				"New tasks from 'Add new' will be created in this file by default. Use the vault-relative path (e.g., 'folder/tasks.md'). Leave empty to always show the full file picker."
			)
			.addText((text) => {
				defaultTaskFileInputEl = text.inputEl;
				text.setPlaceholder("e.g., notes/tasks.md");
				text.setValue(this.settings.defaultTaskFile ?? "");
				text.onChange((value) => {
					this.settings.defaultTaskFile = value;
					validateDefaultTaskFile();
				});
			});
		defaultTaskFileSetting.controlEl.style.flexDirection = "column";
		defaultTaskFileSetting.controlEl.style.alignItems = "flex-end";
		defaultTaskFileErrorEl = createEl("div", {
			cls: "setting-error-message",
		});
		defaultTaskFileErrorEl.style.color = "var(--text-error)";
		defaultTaskFileErrorEl.style.fontSize = "var(--font-smallest)";
		defaultTaskFileErrorEl.style.fontStyle = "italic";
		defaultTaskFileErrorEl.style.marginTop = "4px";
		defaultTaskFileErrorEl.style.minHeight = "1.2em";
		defaultTaskFileErrorEl.style.visibility = "hidden";
		defaultTaskFileSetting.controlEl.appendChild(defaultTaskFileErrorEl);
		validateDefaultTaskFile();

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
			.setName("Cancelled status markers")
			.setDesc(
				"Characters that mark a task as cancelled (e.g., '-' for [-]). Each character should be a single Unicode character without spaces."
			)
			.addText((text) => {
				text.setValue(this.settings.cancelledStatusMarkers ?? DEFAULT_CANCELLED_STATUS_MARKERS);
				text.onChange((value) => {
					// Validate the input and provide immediate feedback
					const errors = validateCancelledStatusMarkers(value);
					if (errors.length > 0) {
						text.inputEl.style.borderColor = "var(--text-error)";
						text.inputEl.title = `Invalid: ${errors.join(', ')}`;
					} else {
						text.inputEl.style.borderColor = "";
						text.inputEl.title = "Valid cancelled status markers";
						this.settings.cancelledStatusMarkers = value;
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
