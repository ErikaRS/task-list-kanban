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
import { kebab } from "src/parsing/kebab/kebab";
import {
	RESERVED_COLUMN_KEYS,
	type ColumnDefinition,
} from "../columns/columns";
import { createColumnId } from "../columns/definitions";

const VisibilityOptionSchema = z.nativeEnum(VisibilityOption);
const ScopeOptionSchema = z.nativeEnum(ScopeOption);
const FlowDirectionSchema = z.nativeEnum(FlowDirection);

export class SettingsModal extends Modal {
	private originalSettingsSnapshot: string;
	private scrollWrapper!: HTMLDivElement;
	private dirtyBanner: HTMLElement | null = null;
	private validationError: string | null = null;
	private validationBanner: HTMLElement | null = null;
	private saveBtn: HTMLButtonElement | null = null;
	private columnsEditorEl: HTMLDivElement | null = null;

	constructor(
		app: App,
		private settings: SettingValues,
		private readonly onSubmit: (newSettings: SettingValues) => void,
		private readonly boardFolderPath: string | null
	) {
		super(app);
		this.originalSettingsSnapshot = JSON.stringify(settings);
	}

	private isDirty(): boolean {
		return JSON.stringify(this.settings) !== this.originalSettingsSnapshot;
	}

	private validateColumns() {
		const errors: string[] = [];
		const seenDerivedTags = new Map<string, string>();

		for (const column of this.settings.columns ?? []) {
			const label = column.label.trim();
			if (label.length === 0) {
				errors.push("Column labels cannot be empty.");
				continue;
			}

			const derivedTag = kebab(label);
			if (RESERVED_COLUMN_KEYS.has(derivedTag)) {
				errors.push(`Column name "${label}" conflicts with a built-in column.`);
			}

			const existingLabel = seenDerivedTags.get(derivedTag);
			if (existingLabel) {
				errors.push(`Columns "${existingLabel}" and "${label}" match the same tag.`);
			} else {
				seenDerivedTags.set(derivedTag, label);
			}
		}

		this.validationError = errors.length > 0 ? errors[0]! : null;
		this.updateValidationBanner();
	}

	private touchSettings() {
		this.validateColumns();
		this.updateDirtyBanner();
	}

	private addColumn() {
		const usedIds = new Set(this.settings.columns.map((column) => column.id));
		this.settings.columns = [
			...this.settings.columns,
			{
				id: createColumnId("New Column", usedIds),
				label: "New Column",
				matchMode: "name",
				matchTags: [],
			},
		];
		this.renderColumnsEditor();
		this.touchSettings();
	}

	private renderColumnsEditor() {
		if (!this.columnsEditorEl) {
			return;
		}

		this.columnsEditorEl.empty();

		const section = this.columnsEditorEl.createDiv({ cls: "column-editor-section" });
		section.createEl("h2", { text: "Columns" });
		section.createEl("p", {
			text: "Edit each board column directly. Labels control display and current tag matching.",
			cls: "setting-item-description",
		});

		const rows = section.createDiv({ cls: "column-editor-list" });
		this.renderBookendRow(rows, {
			title: "Uncategorized",
			label: this.settings.uncategorizedColumnName ?? "",
			placeholder: "Uncategorized",
			visibility: this.settings.uncategorizedVisibility ?? VisibilityOption.Auto,
			onLabelChange: (value) => {
				this.settings.uncategorizedColumnName = value;
				this.touchSettings();
			},
			onVisibilityChange: (value) => {
				const validatedValue = VisibilityOptionSchema.safeParse(value);
				this.settings.uncategorizedVisibility = validatedValue.success
					? validatedValue.data
					: defaultSettings.uncategorizedVisibility;
				this.touchSettings();
			},
		});

		for (const column of this.settings.columns) {
			this.renderCustomColumnRow(rows, column);
		}

		this.renderBookendRow(rows, {
			title: "Done",
			label: this.settings.doneColumnName ?? "",
			placeholder: "Done",
			visibility: this.settings.doneVisibility ?? VisibilityOption.AlwaysShow,
			onLabelChange: (value) => {
				this.settings.doneColumnName = value;
				this.touchSettings();
			},
			onVisibilityChange: (value) => {
				const validatedValue = VisibilityOptionSchema.safeParse(value);
				this.settings.doneVisibility = validatedValue.success
					? validatedValue.data
					: defaultSettings.doneVisibility;
				this.touchSettings();
			},
		});

		const controls = section.createDiv({ cls: "column-editor-controls" });
		const addButton = controls.createEl("button", { text: "Add column" });
		addButton.addEventListener("click", () => this.addColumn());
	}

	private renderBookendRow(
		container: HTMLDivElement,
		options: {
			title: string;
			label: string;
			placeholder: string;
			visibility: VisibilityOption;
			onLabelChange: (value: string) => void;
			onVisibilityChange: (value: string) => void;
		},
	) {
		const row = container.createDiv({ cls: "column-editor-row is-bookend" });
		const mode = row.createDiv({ cls: "column-editor-mode", text: "Fixed" });

		const fields = row.createDiv({ cls: "column-editor-fields" });

		const labelField = fields.createDiv({ cls: "column-editor-field" });
		const labelInput = labelField.createEl("input", {
			type: "text",
			value: options.label,
			placeholder: options.placeholder,
		});
		labelInput.addClass("setting-input");
		labelInput.addEventListener("input", () => {
			options.onLabelChange(labelInput.value);
		});

		const visibilityField = fields.createDiv({ cls: "column-editor-field" });
		const visibilityLabel = visibilityField.createDiv({ cls: "column-editor-inline-label", text: "Visibility" });
		const visibilitySelect = visibilityField.createEl("select");
		visibilitySelect.addClass("dropdown");
		visibilitySelect.setAttribute("aria-label", `${options.title} visibility`);
		visibilitySelect.createEl("option", {
			value: VisibilityOption.AlwaysShow,
			text: "Always show",
		});
		visibilitySelect.createEl("option", {
			value: VisibilityOption.Auto,
			text: "Hide when empty",
		});
		visibilitySelect.createEl("option", {
			value: VisibilityOption.NeverShow,
			text: "Never show",
		});
		visibilitySelect.value = options.visibility;
		visibilitySelect.addEventListener("change", () => {
			options.onVisibilityChange(visibilitySelect.value);
		});
		void visibilityLabel;
	}

	private renderCustomColumnRow(container: HTMLDivElement, column: ColumnDefinition) {
		const row = container.createDiv({ cls: "column-editor-row" });
		row.createDiv({ cls: "column-editor-mode", text: "Tagged" });

		const fields = row.createDiv({ cls: "column-editor-fields" });

		const labelField = fields.createDiv({ cls: "column-editor-field" });
		const labelInput = labelField.createEl("input", { type: "text", value: column.label });
		labelInput.addClass("setting-input");
		labelInput.setAttribute("aria-label", "Column label");
		labelInput.addEventListener("input", () => {
			column.label = labelInput.value;
			this.touchSettings();
		});

		const colorField = fields.createDiv({ cls: "column-editor-field column-editor-field-color" });
		colorField.createDiv({ cls: "column-editor-inline-label", text: "Color" });
		const colorInput = colorField.createEl("input", {
			type: "text",
			value: column.color ?? "",
			placeholder: "#RRGGBB",
		});
		colorInput.addClass("setting-input");
		colorInput.setAttribute("aria-label", `${column.label} color`);
		colorInput.addEventListener("input", () => {
			column.color = colorInput.value.trim() || undefined;
			this.touchSettings();
		});

		const removeButton = row.createEl("button", { text: "✕", cls: "clickable-icon" });
		removeButton.setAttribute("aria-label", `Remove ${column.label} column`);
		removeButton.addEventListener("click", () => {
			this.settings.columns = this.settings.columns.filter((candidate) => candidate.id !== column.id);
			this.renderColumnsEditor();
			this.touchSettings();
		});
	}

	private updateValidationBanner() {
		if (this.validationError) {
			if (!this.validationBanner) {
				this.validationBanner = this.scrollWrapper.createDiv({ cls: "settings-dirty-banner" });
				this.scrollWrapper.insertBefore(this.validationBanner, this.scrollWrapper.firstChild);
			}
			this.validationBanner.setText(this.validationError);
			if (this.saveBtn) this.saveBtn.disabled = true;
		} else {
			if (this.validationBanner) {
				this.validationBanner.remove();
				this.validationBanner = null;
			}
			if (this.saveBtn) this.saveBtn.disabled = false;
		}
	}

	private updateDirtyBanner() {
		if (this.isDirty()) {
			if (this.dirtyBanner) return; // already showing
			this.dirtyBanner = this.scrollWrapper.createDiv({ cls: "settings-dirty-banner" });
			this.scrollWrapper.insertBefore(this.dirtyBanner, this.scrollWrapper.firstChild);
			this.dirtyBanner.createSpan({ text: "You have unsaved changes." });
		} else {
			if (!this.dirtyBanner) return; // already hidden
			this.dirtyBanner.remove();
			this.dirtyBanner = null;
		}
	}

	onOpen() {
		// Set up flex layout — need classes on both modalEl and contentEl
		// so contentEl fills the modal and our inner flex layout works
		this.modalEl.addClass("task-list-kanban-settings-modal-container");
		this.contentEl.addClass("task-list-kanban-settings-modal");

		this.scrollWrapper = this.contentEl.createDiv({ cls: "settings-scroll-wrapper" });
		this.scrollWrapper.createEl("h1", { text: "Settings" });

		this.columnsEditorEl = this.scrollWrapper.createDiv();
		this.renderColumnsEditor();
		this.validateColumns();

		new Setting(this.scrollWrapper)
			.setName("Column width")
			.setDesc("Width of task cards in pixels (200-600)")
			.addSlider((slider) => {
				slider
					.setLimits(200, 600, 10)
					.setValue(this.settings.columnWidth ?? 300)
					.setDynamicTooltip()
					.onChange((value) => {
						this.settings.columnWidth = value;
						this.updateDirtyBanner();
					});
			});

		new Setting(this.scrollWrapper)
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
						this.updateDirtyBanner();
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
			if (!shouldIncludeFilePath(value, scopeFilter, this.settings.excludePaths ?? [], this.boardFolderPath)) {
				const excludePaths = this.settings.excludePaths ?? [];
				const isExcludedByPath = excludePaths.length > 0 &&
					shouldIncludeFilePath(value, scopeFilter) &&
					!shouldIncludeFilePath(value, scopeFilter, excludePaths, this.boardFolderPath);
				setDefaultTaskFileError(
					isExcludedByPath
						? "File is excluded from the board's scope"
						: "File is outside the board's folder scope"
				);
				return;
			}
			setDefaultTaskFileError("");
		};

		// --- Folder scope dropdown + selected folders UI ---
		const scopeContainer = this.scrollWrapper.createDiv();

		let folderListContainer: HTMLDivElement;
		let folderListEl: HTMLDivElement;

		const renderFolderRow = (
			container: HTMLDivElement,
			folder: string,
			removable: boolean
		) => {
			const row = container.createDiv();
			row.style.display = "flex";
			row.style.alignItems = "center";
			row.style.justifyContent = "space-between";
			row.style.padding = "4px 8px";
			row.style.borderBottom =
				"1px solid var(--background-modifier-border)";

			const label = row.createSpan();
			label.setText(folder);
			label.style.flexGrow = "1";

			if (!removable) {
				const badge = row.createSpan();
				badge.setText(" (this board)");
				badge.style.color = "var(--text-muted)";
				badge.style.fontStyle = "italic";
				badge.style.fontSize = "var(--font-smallest)";
			} else {
				// Check if folder exists in vault
				const abstractFolder =
					this.app.vault.getAbstractFileByPath(folder);
				if (!abstractFolder) {
					const warning = row.createSpan();
					warning.setText(" (not found)");
					warning.style.color = "var(--text-error)";
					warning.style.fontStyle = "italic";
					warning.style.fontSize = "var(--font-smallest)";
				}

				const removeBtn = row.createEl("button");
				removeBtn.setText("✕");
				removeBtn.style.marginLeft = "8px";
				removeBtn.style.cursor = "pointer";
				removeBtn.style.background = "none";
				removeBtn.style.border = "none";
				removeBtn.style.color = "var(--text-muted)";
				removeBtn.style.padding = "2px 6px";
				removeBtn.addEventListener("click", () => {
					this.settings.scopeFolders = (
						this.settings.scopeFolders ?? []
					).filter((f) => f !== folder);
					renderFolderList();
					validateDefaultTaskFile();
					this.updateDirtyBanner();
				});
			}
		};

		const renderFolderList = () => {
			folderListEl.empty();

			// Always show the board's own folder first (non-removable)
			if (this.boardFolderPath) {
				renderFolderRow(folderListEl, this.boardFolderPath, false);
			}

			// Show user-added folders (removable)
			const folders = (this.settings.scopeFolders ?? []).filter(
				(f) => f !== this.boardFolderPath
			);
			for (const folder of folders) {
				renderFolderRow(folderListEl, folder, true);
			}
		};

		const updateFolderListVisibility = () => {
			folderListContainer.style.display =
				this.settings.scope === ScopeOption.SelectedFolders
					? "block"
					: "none";
		};

		new Setting(scopeContainer)
			.setName("Folder scope")
			.setDesc("Where should we try to find tasks for this Kanban?")
			.addDropdown((dropdown) => {
				dropdown.addOption(ScopeOption.Folder, "This folder");
				dropdown.addOption(ScopeOption.Everywhere, "Every folder");
				dropdown.addOption(
					ScopeOption.SelectedFolders,
					"Selected folders"
				);
				dropdown.setValue(this.settings.scope);
				dropdown.onChange((value) => {
					const validatedValue = ScopeOptionSchema.safeParse(value);
					this.settings.scope = validatedValue.success
						? validatedValue.data
						: defaultSettings.scope;
					updateFolderListVisibility();
					validateDefaultTaskFile();
					this.updateDirtyBanner();
				});
			});

		// Selected folders list UI
		folderListContainer = scopeContainer.createDiv();
		folderListContainer.style.marginLeft = "16px";
		folderListContainer.style.marginBottom = "12px";

		const addFolderRow = folderListContainer.createDiv();
		addFolderRow.style.display = "flex";
		addFolderRow.style.gap = "8px";
		addFolderRow.style.marginBottom = "8px";

		const folderInput = addFolderRow.createEl("input", {
			type: "text",
			placeholder: "e.g., projects/active",
		});
		folderInput.style.flexGrow = "1";
		folderInput.addClass("setting-input");

		const addFolder = () => {
			const raw = folderInput.value.trim().replace(/^\//, "").replace(/\/$/, "");
			if (!raw) return;
			if (raw === this.boardFolderPath) return; // already included implicitly
			const folders = this.settings.scopeFolders ?? [];
			if (folders.includes(raw)) return;
			this.settings.scopeFolders = [...folders, raw];
			folderInput.value = "";
			renderFolderList();
			validateDefaultTaskFile();
			this.updateDirtyBanner();
		};

		const addBtn = addFolderRow.createEl("button", { text: "Add" });
		addBtn.addEventListener("click", addFolder);

		folderInput.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				addFolder();
			}
		});

		folderListEl = folderListContainer.createDiv();
		renderFolderList();
		updateFolderListVisibility();

		// --- Excluded paths UI ---
		let excludeListEl: HTMLDivElement;

		const renderExcludeRow = (
			container: HTMLDivElement,
			path: string
		) => {
			const row = container.createDiv();
			row.style.display = "flex";
			row.style.alignItems = "center";
			row.style.justifyContent = "space-between";
			row.style.padding = "4px 8px";
			row.style.borderBottom =
				"1px solid var(--background-modifier-border)";

			const label = row.createSpan();
			label.setText(path);
			label.style.flexGrow = "1";

			// Check if path exists in vault
			const abstractPath =
				this.app.vault.getAbstractFileByPath(path);
			if (!abstractPath) {
				const warning = row.createSpan();
				warning.setText(" (not found)");
				warning.style.color = "var(--text-error)";
				warning.style.fontStyle = "italic";
				warning.style.fontSize = "var(--font-smallest)";
			}

			const removeBtn = row.createEl("button");
			removeBtn.setText("✕");
			removeBtn.style.marginLeft = "8px";
			removeBtn.style.cursor = "pointer";
			removeBtn.style.background = "none";
			removeBtn.style.border = "none";
			removeBtn.style.color = "var(--text-muted)";
			removeBtn.style.padding = "2px 6px";
			removeBtn.addEventListener("click", () => {
				this.settings.excludePaths = (
					this.settings.excludePaths ?? []
				).filter((p) => p !== path);
				renderExcludeList();
				validateDefaultTaskFile();
				this.updateDirtyBanner();
			});
		};

		const renderExcludeList = () => {
			excludeListEl.empty();
			const paths = this.settings.excludePaths ?? [];
			for (const path of paths) {
				renderExcludeRow(excludeListEl, path);
			}
		};

		const excludeContainer = this.scrollWrapper.createDiv();
		excludeContainer.style.marginBottom = "12px";

		new Setting(excludeContainer)
			.setName("Excluded paths")
			.setDesc(
				"Directories and files excluded from the scope above. The board's own folder is always included."
			);

		const excludeInputContainer = excludeContainer.createDiv();
		excludeInputContainer.style.marginLeft = "16px";

		const addExcludeRow = excludeInputContainer.createDiv();
		addExcludeRow.style.display = "flex";
		addExcludeRow.style.gap = "8px";
		addExcludeRow.style.marginBottom = "8px";

		const excludeInput = addExcludeRow.createEl("input", {
			type: "text",
			placeholder: "e.g., templates or notes/scratch.md",
		});
		excludeInput.style.flexGrow = "1";
		excludeInput.addClass("setting-input");

		const addExcludePath = () => {
			const raw = excludeInput.value.trim().replace(/^\//, "").replace(/\/$/, "");
			if (!raw) return;
			if (raw === this.boardFolderPath) return; // can't exclude the board folder directly
			const paths = this.settings.excludePaths ?? [];
			if (paths.includes(raw)) return;
			this.settings.excludePaths = [...paths, raw];
			excludeInput.value = "";
			renderExcludeList();
			validateDefaultTaskFile();
			this.updateDirtyBanner();
		};

		const addExcludeBtn = addExcludeRow.createEl("button", { text: "Add" });
		addExcludeBtn.addEventListener("click", addExcludePath);

		excludeInput.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				addExcludePath();
			}
		});

		excludeListEl = excludeInputContainer.createDiv();
		renderExcludeList();

		const defaultTaskFileSetting = new Setting(this.scrollWrapper)
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
					this.updateDirtyBanner();
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

		new Setting(this.scrollWrapper)
			.setName("Show filepath")
			.setDesc("Show the filepath on each task in Kanban?")
			.addToggle((toggle) => {
				toggle.setValue(this.settings.showFilepath ?? true);
				toggle.onChange((value) => {
					this.settings.showFilepath = value;
					this.updateDirtyBanner();
				});
			});

		new Setting(this.scrollWrapper)
			.setName("Consolidate tags")
			.setDesc(
				"Consolidate the tags on each task in Kanban into the footer?"
			)
			.addToggle((toggle) => {
				toggle.setValue(this.settings.consolidateTags ?? false);
				toggle.onChange((value) => {
					this.settings.consolidateTags = value;
					this.updateDirtyBanner();
				});
			});

		new Setting(this.scrollWrapper)
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
						this.updateDirtyBanner();
					}
				});
			});

		new Setting(this.scrollWrapper)
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
						this.updateDirtyBanner();
					}
				});
			});

		new Setting(this.scrollWrapper)
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
						this.updateDirtyBanner();
					}
				});
			});

		// Button bar (after scroll wrapper, still inside contentEl)
		const buttonBar = this.contentEl.createDiv({ cls: "settings-button-bar" });

		const cancelBtn = buttonBar.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => {
			this.close();
		});

		this.saveBtn = buttonBar.createEl("button", { text: "Save", cls: "mod-cta" });
		this.saveBtn.addEventListener("click", () => {
			this.onSubmit(this.settings);
			this.close();
		});

		// Apply validation state to save button now that it exists
		if (this.validationError) {
			this.saveBtn.disabled = true;
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
