import { App, Modal, Setting, TFile, setIcon } from "obsidian";
import CompactTagSelect from "../components/select/compact_tag_select.svelte";
import type { SettingValues } from "./settings_store";
import {
	VisibilityOption,
	ScopeOption,
	FlowDirection,
	defaultSettings,
} from "../settings/settings_store";
import { z } from "zod";
import { DEFAULT_DONE_STATUS_MARKERS, DEFAULT_CANCELLED_STATUS_MARKERS, DEFAULT_IGNORED_STATUS_MARKERS, isTrackedTaskString, validateDoneStatusMarkers, validateCancelledStatusMarkers, validateIgnoredStatusMarkers } from "../tasks/task";
import { PropertySchemaOption } from "../../parsing/properties/property_schema";
import { shouldIncludeFilePath } from "../tasks/scope";
import { kebab } from "src/parsing/kebab/kebab";
import { getTagsFromContent } from "src/parsing/tags/tags";
import {
	RESERVED_COLUMN_KEYS,
	type ColumnDefinition,
	getColumnWriteTags,
} from "../columns/columns";
import { columnRuleSignature, createColumnId, usesTagMatching } from "../columns/definitions";
import { moveColumnRelativeTo, type DropPosition } from "./column_reorder";
import { getColumnValidationError } from "./column_validation";
import { FolderSuggest, PathSuggest, FileSuggest, TagSuggest } from "./suggest";

const VisibilityOptionSchema = z.nativeEnum(VisibilityOption);
const ScopeOptionSchema = z.nativeEnum(ScopeOption);
const FlowDirectionSchema = z.nativeEnum(FlowDirection);

export class SettingsModal extends Modal {
	private originalSettingsSnapshot: string;
	private readonly originalSettings: SettingValues;
	private scrollWrapper!: HTMLDivElement;
	private validationError: string | null = null;
	private saveBtn: HTMLButtonElement | null = null;
	private columnsEditorEl: HTMLDivElement | null = null;
	private headerDirtyPill: HTMLElement | null = null;
	private headerValidationPill: HTMLElement | null = null;
	private availableColumnTags: string[] = [];
	private mountedColumnControls: Array<() => void> = [];
	private readonly updateExistingTaskTagsByColumnId = new Map<string, boolean>();
	private readonly expandedColumnIds = new Set<string>();
	private draggedColumnId: string | null = null;
	private dragPreviewTarget: { columnId: string; position: DropPosition } | null = null;
	private focusTagEditorColumnId: string | null = null;

	constructor(
		app: App,
		private settings: SettingValues,
		private readonly onSubmit: (
			newSettings: SettingValues,
			options: { updateExistingTaskTagsByColumnId: Record<string, boolean> },
		) => void | Promise<void>,
		private readonly boardFolderPath: string | null
	) {
		super(app);
		this.originalSettings = structuredClone(settings);
		this.originalSettingsSnapshot = JSON.stringify(settings);
	}

	private isDirty(): boolean {
		return JSON.stringify(this.settings) !== this.originalSettingsSnapshot;
	}

	private validateColumns() {
		this.validationError = getColumnValidationError(this.settings.columns ?? []);
		this.updateValidationBanner();
	}

	private touchSettings() {
		this.validateColumns();
		this.updateDirtyBanner();
	}

	private getOriginalColumn(columnId: string): ColumnDefinition | undefined {
		return this.originalSettings.columns.find((column) => column.id === columnId);
	}

	private shouldShowRetagOption(column: ColumnDefinition): boolean {
		const originalColumn = this.getOriginalColumn(column.id);
		if (!originalColumn) return false;
		return columnRuleSignature(originalColumn) !== columnRuleSignature(column);
	}

	private shouldUpdateExistingTaskTags(columnId: string): boolean {
		return this.updateExistingTaskTagsByColumnId.get(columnId) ?? true;
	}

	private confirmRemoveColumn(column: ColumnDefinition) {
		new ConfirmColumnRemovalModal(this.app, column.label, () => {
			this.settings.columns = this.settings.columns.filter((candidate) => candidate.id !== column.id);
			this.updateExistingTaskTagsByColumnId.delete(column.id);
			this.expandedColumnIds.delete(column.id);
			this.renderColumnsEditor();
			this.touchSettings();
		}).open();
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

	private reorderColumns(draggedColumnId: string, targetColumnId: string, position: DropPosition) {
		const reordered = moveColumnRelativeTo(this.settings.columns, draggedColumnId, targetColumnId, position);
		if (reordered === this.settings.columns) {
			return;
		}

		this.settings.columns = reordered;
		this.renderColumnsEditor();
		this.touchSettings();
	}

	private setDragPreview(columnId: string, position: DropPosition) {
		this.dragPreviewTarget = { columnId, position };
	}

	private clearDragPreview() {
		this.dragPreviewTarget = null;
	}

	private clearDragState(container?: HTMLDivElement) {
		this.draggedColumnId = null;
		this.clearDragPreview();
		if (!container) return;
		container.querySelectorAll(".column-editor-row").forEach((candidate) => {
			candidate.removeClass("is-drop-target");
			candidate.removeClass("is-drop-before");
			candidate.removeClass("is-drop-after");
			candidate.removeClass("is-dragging");
		});
	}

	private async refreshAvailableColumnTags() {
		const files = this.app.vault.getMarkdownFiles().filter((file) =>
			shouldIncludeFilePath(
				file.path,
				this.getScopeFilter(),
				this.settings.excludePaths ?? [],
				this.boardFolderPath,
			),
		);
		const tags = new Set<string>();
		const ignoredStatusMarkers = this.settings.ignoredStatusMarkers ?? DEFAULT_IGNORED_STATUS_MARKERS;

		for (const file of files) {
			const contents = await this.app.vault.cachedRead(file);
			for (const row of contents.split("\n")) {
				if (!row || !isTrackedTaskString(row, ignoredStatusMarkers)) continue;
				for (const tag of getTagsFromContent(row)) {
					if (tag === "archived") continue;
					tags.add(tag);
				}
			}
		}

		const nextTags = [...tags].sort((a, b) => a.localeCompare(b));
		if (JSON.stringify(nextTags) === JSON.stringify(this.availableColumnTags)) {
			return;
		}

		this.availableColumnTags = nextTags;
		if (this.columnsEditorEl) {
			this.renderColumnsEditor();
		}
	}

	private renderColumnsEditor() {
		if (!this.columnsEditorEl) {
			return;
		}

		for (const destroy of this.mountedColumnControls) {
			destroy();
		}
		this.mountedColumnControls = [];
		this.columnsEditorEl.empty();

		const section = this.columnsEditorEl.createDiv({ cls: "column-editor-section" });
		const sectionIntro = section.createDiv({ cls: "column-editor-intro" });
		const introText = sectionIntro.createDiv({ cls: "column-editor-intro-text" });
		introText.createEl("p", {
			text: "Rename, reorder, and map board columns. Open a row when you need match rules, colors, or retagging.",
			cls: "setting-item-description",
		});
		const introActions = sectionIntro.createDiv({ cls: "column-editor-intro-actions" });
		const expandAllButton = introActions.createEl("button", { text: "Expand all" });
		expandAllButton.addEventListener("click", () => {
			for (const column of this.settings.columns) {
				this.expandedColumnIds.add(column.id);
			}
			this.renderColumnsEditor();
		});
		const collapseAllButton = introActions.createEl("button", { text: "Collapse all" });
		collapseAllButton.addEventListener("click", () => {
			this.expandedColumnIds.clear();
			this.renderColumnsEditor();
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

		if (this.focusTagEditorColumnId) {
			const targetColumnId = this.focusTagEditorColumnId;
			this.focusTagEditorColumnId = null;
			window.requestAnimationFrame(() => {
				const targetInput = section.querySelector<HTMLInputElement>(
					`[data-column-id="${targetColumnId}"] .column-editor-field-tag input`,
				);
				targetInput?.focus();
				targetInput?.click();
			});
		}
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
		row.createDiv({ cls: "column-editor-handle-spacer" });

		const content = row.createDiv({ cls: "column-editor-row-content" });
		const fields = content.createDiv({ cls: "column-editor-summary" });

		const labelField = fields.createDiv({ cls: "column-editor-field column-editor-field-label" });
		const labelInput = labelField.createEl("input", {
			type: "text",
			value: options.label,
			placeholder: options.placeholder,
		});
		labelInput.addClass("setting-input");
		labelInput.setAttribute("aria-label", `${options.title} column label`);
		labelInput.addEventListener("input", () => {
			options.onLabelChange(labelInput.value);
		});

		const visibilityField = fields.createDiv({ cls: "column-editor-field column-editor-field-visibility" });
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
	}

	private getColumnMatchSummary(column: ColumnDefinition): string {
		if (!usesTagMatching(column)) {
			return "Matches name";
		}
		const tags = column.matchTags ?? [];
		if (tags.length === 0) {
			return "Needs tags";
		}
		if (tags.length === 1) {
			return `#${tags[0]}`;
		}
		return `${tags.length} required tags`;
	}

	private renderCustomColumnRow(container: HTMLDivElement, column: ColumnDefinition) {
		const expanded = this.expandedColumnIds.has(column.id);
		const row = container.createDiv({
			cls: `column-editor-row ${expanded ? "is-expanded" : "is-collapsed"}`,
		});
		row.dataset.columnId = column.id;
		const dragHandle = row.createEl("button", {
			text: "⋮⋮",
			cls: "column-editor-handle clickable-icon",
		});
		dragHandle.setAttribute("aria-label", `Reorder ${column.label} column`);
		dragHandle.draggable = true;
		dragHandle.addEventListener("dragstart", (event) => {
			this.draggedColumnId = column.id;
			this.clearDragPreview();
			row.addClass("is-dragging");
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = "move";
				event.dataTransfer.setData("text/plain", column.id);
			}
		});
		dragHandle.addEventListener("dragend", () => {
			this.clearDragState(container);
		});
		row.addEventListener("dragover", (event) => {
			if (!this.draggedColumnId || this.draggedColumnId === column.id) {
				return;
			}
			event.preventDefault();
			const rowRect = row.getBoundingClientRect();
			const position: DropPosition = event.clientY > rowRect.top + rowRect.height / 2 ? "after" : "before";
			this.setDragPreview(column.id, position);
			row.addClass("is-drop-target");
			row.classList.toggle("is-drop-before", position === "before");
			row.classList.toggle("is-drop-after", position === "after");
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = "move";
			}
		});
		row.addEventListener("dragleave", () => {
			if (this.dragPreviewTarget?.columnId === column.id) {
				this.clearDragPreview();
			}
			row.removeClass("is-drop-target");
			row.removeClass("is-drop-before");
			row.removeClass("is-drop-after");
		});
		row.addEventListener("drop", (event) => {
			event.preventDefault();
			const position = this.dragPreviewTarget?.columnId === column.id
				? this.dragPreviewTarget.position
				: "before";
			const draggedColumnId = this.draggedColumnId ?? event.dataTransfer?.getData("text/plain") ?? "";
			this.clearDragState(container);
			this.reorderColumns(draggedColumnId, column.id, position);
		});

		const content = row.createDiv({ cls: "column-editor-row-content" });
		const summary = content.createDiv({ cls: "column-editor-summary" });

		const labelField = summary.createDiv({ cls: "column-editor-field column-editor-field-label" });
		const labelInput = labelField.createEl("input", { type: "text", value: column.label });
		labelInput.addClass("setting-input");
		labelInput.setAttribute("aria-label", "Column label");

		const matchSummary = summary.createDiv({ cls: "column-editor-pill" });
		matchSummary.setText(this.getColumnMatchSummary(column));

		const colorSummary = summary.createEl("button", {
			cls: "column-editor-color-swatch column-editor-summary-swatch",
		});
		colorSummary.type = "button";
		colorSummary.setAttribute("aria-label", `Edit color for ${column.label || "column"}`);
		colorSummary.addEventListener("click", () => {
			this.expandedColumnIds.add(column.id);
			this.renderColumnsEditor();
		});

		const expandButton = summary.createEl("button", {
			cls: "column-editor-expand-button clickable-icon",
		});
		expandButton.type = "button";
		expandButton.setAttribute("aria-label", `${expanded ? "Collapse" : "Expand"} ${column.label || "column"} settings`);
		expandButton.createSpan({ text: expanded ? "Hide settings" : "More settings" });
		const expandIcon = expandButton.createSpan({ cls: "column-editor-expand-icon" });
		setIcon(expandIcon, expanded ? "chevron-up" : "chevron-down");
		expandButton.addEventListener("click", () => {
			if (expanded) {
				this.expandedColumnIds.delete(column.id);
			} else {
				this.expandedColumnIds.add(column.id);
			}
			this.renderColumnsEditor();
		});

		const details = content.createDiv({ cls: "column-editor-details" });
		const colorField = details.createDiv({ cls: "column-editor-field column-editor-field-color" });
		colorField.createDiv({ cls: "column-editor-inline-label", text: "Color" });
		const colorSwatchButton = colorField.createEl("button", {
			cls: "column-editor-color-swatch",
		});
		colorSwatchButton.type = "button";
		colorSwatchButton.setAttribute("aria-label", `Pick color for ${column.label}`);
		const colorPickerInput = colorField.createEl("input", {
			type: "color",
			value: /^#[0-9a-fA-F]{6}$/.test(column.color ?? "") ? column.color : "#000000",
		});
		colorPickerInput.addClass("column-editor-color-picker");
		const updateColorSwatch = () => {
			const colorValue = column.color?.trim();
			const hasValidColor = !!colorValue && /^#[0-9a-fA-F]{6}$/.test(colorValue);
			colorSwatchButton.toggleClass("has-color", hasValidColor);
			colorSummary.toggleClass("has-color", hasValidColor);
			colorSwatchButton.style.setProperty("--column-editor-swatch-color", hasValidColor ? colorValue! : "transparent");
			colorSummary.style.setProperty("--column-editor-swatch-color", hasValidColor ? colorValue! : "transparent");
			colorSummary.title = hasValidColor ? colorValue! : "No color";
			colorPickerInput.value = hasValidColor ? colorValue! : "#000000";
		};
		const colorInput = colorField.createEl("input", {
			type: "text",
			value: column.color ?? "",
			placeholder: "#RRGGBB",
		});
		colorInput.addClass("setting-input");
		colorInput.setAttribute("aria-label", `${column.label} color`);
		colorInput.addEventListener("input", () => {
			column.color = colorInput.value.trim() || undefined;
			updateColorSwatch();
			this.touchSettings();
		});
		colorSwatchButton.addEventListener("click", () => {
			colorPickerInput.click();
		});
		colorPickerInput.addEventListener("input", () => {
			column.color = colorPickerInput.value;
			colorInput.value = colorPickerInput.value;
			updateColorSwatch();
			this.touchSettings();
		});
		updateColorSwatch();

		const matchModeField = details.createDiv({ cls: "column-editor-field column-editor-field-match" });
		matchModeField.createDiv({ cls: "column-editor-inline-label", text: "Match by" });
		const matchModeSelect = matchModeField.createEl("select");
		matchModeSelect.addClass("dropdown");
		matchModeSelect.createEl("option", {
			value: "name",
			text: "Name",
		});
		matchModeSelect.createEl("option", {
			value: "tags",
			text: "Tags",
		});
		matchModeSelect.value = column.matchMode;
		matchModeSelect.addEventListener("change", () => {
			column.matchMode = matchModeSelect.value === "tags" ? "tags" : "name";
			if (column.matchMode === "name") {
				column.matchTags = [];
			} else {
				this.focusTagEditorColumnId = column.id;
			}
			this.renderColumnsEditor();
			this.touchSettings();
		});

		if (usesTagMatching(column)) {
			const tagsField = details.createDiv({ cls: "column-editor-field column-editor-field-tag" });
			tagsField.createDiv({ cls: "column-editor-inline-label", text: "Tags" });
			const tagPicker = tagsField.createDiv({ cls: "column-editor-tag-select-host" });
			const tagSelect = new CompactTagSelect({
				target: tagPicker,
				props: {
					items: this.availableColumnTags,
					value: [...column.matchTags],
					maxSelected: 0,
					placeholder: "",
					ariaLabel: `${column.label} match tags`,
				},
			});
			const onChange = tagSelect.$on("change", (event) => {
				column.matchTags = event.detail;
				updateRenameOption();
				this.touchSettings();
			});
			this.mountedColumnControls.push(() => {
				onChange();
				tagSelect.$destroy();
			});
		}

		const renameOption = details.createDiv({ cls: "column-editor-rename-option" });
		const renameCheckbox = renameOption.createEl("input", { type: "checkbox" });
		const renameLabel = renameOption.createEl("label", {
			text: "Retag existing tasks",
		});
		const updateRenameOption = () => {
			const show = this.shouldShowRetagOption(column);
			renameOption.style.display = show ? "flex" : "none";
			renameCheckbox.checked = this.shouldUpdateExistingTaskTags(column.id);
			renameCheckbox.setAttribute("aria-label", `Update existing task tags for ${column.label || "column"}`);
			void renameLabel;
		};
		updateRenameOption();
		labelInput.addEventListener("input", () => {
			column.label = labelInput.value;
			updateRenameOption();
			this.touchSettings();
		});
		renameCheckbox.addEventListener("change", () => {
			this.updateExistingTaskTagsByColumnId.set(column.id, renameCheckbox.checked);
			this.touchSettings();
		});

		const removeRail = row.createDiv({ cls: "column-editor-remove-rail" });
		const removeButton = removeRail.createEl("button", { cls: "clickable-icon" });
		removeButton.type = "button";
		setIcon(removeButton, "x");
		removeButton.setAttribute("aria-label", `Remove ${column.label} column`);
		removeButton.addEventListener("click", () => {
			this.confirmRemoveColumn(column);
		});
	}

	private updateValidationBanner() {
		if (this.headerValidationPill) {
			this.headerValidationPill.setText(this.validationError ?? "");
			this.headerValidationPill.toggleClass("is-visible", !!this.validationError);
			this.headerValidationPill.title = this.validationError ?? "";
		}
		if (this.saveBtn) this.saveBtn.disabled = !!this.validationError;
	}

	private updateDirtyBanner() {
		if (this.headerDirtyPill) {
			const isDirty = this.isDirty();
			this.headerDirtyPill.setText(isDirty ? "Unsaved changes" : "");
			this.headerDirtyPill.toggleClass("is-visible", isDirty);
		}
	}

	onOpen() {
		// Set up flex layout — need classes on both modalEl and contentEl
		// so contentEl fills the modal and our inner flex layout works
		this.modalEl.addClass("task-list-kanban-settings-modal-container");
		this.contentEl.addClass("task-list-kanban-settings-modal");

		this.scrollWrapper = this.contentEl.createDiv({ cls: "settings-scroll-wrapper" });
		const header = this.scrollWrapper.createDiv({ cls: "settings-header" });
		header.createEl("h1", { text: "Settings" });
		const headerStatus = header.createDiv({ cls: "settings-header-status" });
		this.headerValidationPill = headerStatus.createDiv({ cls: "settings-status-pill settings-status-pill-validation" });
		this.headerDirtyPill = headerStatus.createDiv({ cls: "settings-status-pill settings-status-pill-dirty" });

		const settingsBody = this.scrollWrapper.createDiv({ cls: "settings-body" });
		const settingsNav = settingsBody.createDiv({ cls: "settings-nav" });
		const settingsContent = settingsBody.createDiv({ cls: "settings-content" });
		const createSection = (
			id: string,
			title: string,
			description: string,
		): HTMLDivElement => {
			const section = settingsContent.createDiv({
				cls: "settings-section",
				attr: { id: `settings-${id}` },
			});
			const navButton = settingsNav.createEl("button", { text: title });
			navButton.type = "button";
			navButton.addEventListener("click", () => {
				section.scrollIntoView({ behavior: "smooth", block: "start" });
			});

			const sectionHeader = section.createDiv({ cls: "settings-section-header" });
			sectionHeader.createEl("h2", { text: title });
			sectionHeader.createEl("p", { text: description, cls: "setting-item-description" });
			return section.createDiv({ cls: "settings-section-body" });
		};

		const columnsSection = createSection(
			"columns",
			"Columns",
			"Board columns, column labels, matching rules, and color accents.",
		);
		const boardLayoutSection = createSection(
			"board-layout",
			"Board layout",
			"Column sizing and board flow.",
		);
		const taskPropertiesSection = createSection(
			"task-properties",
			"Task properties",
			"Property parsing, card property display, and task creation defaults.",
		);
		const scopeSection = createSection(
			"scope",
			"Scope",
			"Choose where the board looks for tasks, then subtract paths it should ignore.",
		);
		const displaySection = createSection(
			"display",
			"Display",
			"Card metadata, filepath, and tag display behavior.",
		);
		const advancedTaskParsingSection = createSection(
			"advanced-task-parsing",
			"Advanced task parsing",
			"Task status marker characters and parsed metadata display.",
		);

		this.columnsEditorEl = columnsSection;
		this.renderColumnsEditor();
		this.validateColumns();
		void this.refreshAvailableColumnTags();

		new Setting(boardLayoutSection)
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

		new Setting(boardLayoutSection)
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

		new Setting(taskPropertiesSection)
			.setName("Property schema")
			.setDesc("Which format to use for extracting task properties.")
			.addDropdown((dropdown) => {
				dropdown
					.addOption(PropertySchemaOption.None, "None")
					.addOption(PropertySchemaOption.TasksPlugin, "Tasks Plugin")
					.addOption(PropertySchemaOption.Dataview, "Dataview")
					.setValue(this.settings.propertySchema ?? PropertySchemaOption.None)
					.onChange((value) => {
						this.settings.propertySchema = value as PropertySchemaOption;
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
			const scopeFilter = this.getScopeFilter();
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
		const scopeContainer = scopeSection.createDiv();

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
			.setName("Included folders")
			.setDesc("Folders the board searches for tasks. The board's own folder is always included.")
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
		new FolderSuggest(this.app, folderInput, () => addFolder());

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

		const excludeContainer = scopeSection.createDiv({ cls: "settings-subsection" });
		excludeContainer.style.marginBottom = "12px";

		new Setting(excludeContainer)
			.setName("Excluded paths")
			.setDesc(
				"Folders and files the board skips after included folders are chosen."
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
		new PathSuggest(this.app, excludeInput, () => addExcludePath());

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

		const excludedTagsContainer = displaySection.createDiv({ cls: "settings-subsection" });
		excludedTagsContainer.style.marginBottom = "12px";

		new Setting(excludedTagsContainer)
			.setName("Hidden Tags")
			.setDesc(
				"Tags to hide from display on task cards. The tasks themselves will still appear on the board."
			);

		const excludedTagsInputContainer = excludedTagsContainer.createDiv();
		excludedTagsInputContainer.style.marginLeft = "16px";

		const addExcludedTagRow = excludedTagsInputContainer.createDiv();
		addExcludedTagRow.style.display = "flex";
		addExcludedTagRow.style.gap = "8px";
		addExcludedTagRow.style.marginBottom = "8px";

		const excludedTagInput = addExcludedTagRow.createEl("input", {
			type: "text",
			placeholder: "e.g., status",
		});
		excludedTagInput.style.flexGrow = "1";
		excludedTagInput.addClass("setting-input");
		
		let excludedTagsListEl: HTMLDivElement;

		const renderExcludedTagsList = () => {
			excludedTagsListEl.empty();
			const tags = this.settings.excludedTags ?? [];
			for (const tag of tags) {
				const row = excludedTagsListEl.createDiv();
				row.style.display = "flex";
				row.style.justifyContent = "space-between";
				row.style.alignItems = "center";
				row.style.padding = "4px 8px";
				row.style.borderBottom = "1px solid var(--background-modifier-border)";
				
				const label = row.createSpan();
				label.setText(tag);
				label.style.fontFamily = "var(--font-monospace)";
				label.style.fontSize = "var(--font-ui-smaller)";

				const removeBtn = row.createEl("button", { text: "Remove" });
				removeBtn.style.padding = "2px 8px";
				removeBtn.style.fontSize = "var(--font-ui-smaller)";
				removeBtn.addEventListener("click", () => {
					this.settings.excludedTags = (this.settings.excludedTags ?? []).filter((t) => t !== tag);
					renderExcludedTagsList();
					this.updateDirtyBanner();
				});
			}
		};

		const addExcludedTag = () => {
			const raw = excludedTagInput.value.trim().replace(/^#/, "");
			if (!raw) return;
			const tags = this.settings.excludedTags ?? [];
			if (tags.includes(raw)) return;
			this.settings.excludedTags = [...tags, raw];
			excludedTagInput.value = "";
			renderExcludedTagsList();
			this.updateDirtyBanner();
		};
		new TagSuggest(this.app, excludedTagInput, () => addExcludedTag());

		const addExcludedTagBtn = addExcludedTagRow.createEl("button", { text: "Add" });
		addExcludedTagBtn.addEventListener("click", addExcludedTag);

		excludedTagInput.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				addExcludedTag();
			}
		});

		const excludeColumnTagsBtn = addExcludedTagRow.createEl("button", { text: "Exclude column tags" });
		excludeColumnTagsBtn.title = "Automatically add all configured column placement tags to the exclusion list";
		excludeColumnTagsBtn.addEventListener("click", () => {
			const currentExcluded = new Set(this.settings.excludedTags ?? []);
			for (const col of this.settings.columns ?? []) {
				const tags = getColumnWriteTags(col);
				for (const tag of tags) {
					currentExcluded.add(tag);
				}
			}
			this.settings.excludedTags = Array.from(currentExcluded);
			renderExcludedTagsList();
			this.updateDirtyBanner();
		});

		excludedTagsListEl = excludedTagsInputContainer.createDiv();
		renderExcludedTagsList();

		const excludedTaskTagsContainer = displaySection.createDiv({ cls: "settings-subsection" });
		excludedTaskTagsContainer.style.marginBottom = "12px";

		new Setting(excludedTaskTagsContainer)
			.setName("Excluded task tags")
			.setDesc(
				"Tasks containing these tags will be completely excluded from the board."
			);

		const excludedTaskTagsInputContainer = excludedTaskTagsContainer.createDiv();
		excludedTaskTagsInputContainer.style.marginLeft = "16px";

		const addExcludedTaskTagRow = excludedTaskTagsInputContainer.createDiv();
		addExcludedTaskTagRow.style.display = "flex";
		addExcludedTaskTagRow.style.gap = "8px";
		addExcludedTaskTagRow.style.marginBottom = "8px";

		const excludedTaskTagInput = addExcludedTaskTagRow.createEl("input", {
			type: "text",
			placeholder: "e.g., archived",
		});
		excludedTaskTagInput.style.flexGrow = "1";
		excludedTaskTagInput.addClass("setting-input");
		
		let excludedTaskTagsListEl: HTMLDivElement;

		const renderExcludedTaskTagsList = () => {
			excludedTaskTagsListEl.empty();
			const tags = this.settings.excludedTaskTags ?? [];
			for (const tag of tags) {
				const row = excludedTaskTagsListEl.createDiv();
				row.style.display = "flex";
				row.style.justifyContent = "space-between";
				row.style.alignItems = "center";
				row.style.padding = "4px 8px";
				row.style.borderBottom = "1px solid var(--background-modifier-border)";
				
				const label = row.createSpan();
				label.setText(tag);
				label.style.fontFamily = "var(--font-monospace)";
				label.style.fontSize = "var(--font-ui-smaller)";

				const removeBtn = row.createEl("button", { text: "Remove" });
				removeBtn.style.padding = "2px 8px";
				removeBtn.style.fontSize = "var(--font-ui-smaller)";
				removeBtn.addEventListener("click", () => {
					this.settings.excludedTaskTags = (this.settings.excludedTaskTags ?? []).filter((t) => t !== tag);
					renderExcludedTaskTagsList();
					this.updateDirtyBanner();
				});
			}
		};

		const addExcludedTaskTag = () => {
			const raw = excludedTaskTagInput.value.trim().replace(/^#/, "");
			if (!raw) return;
			const tags = this.settings.excludedTaskTags ?? [];
			if (tags.includes(raw)) return;
			this.settings.excludedTaskTags = [...tags, raw];
			excludedTaskTagInput.value = "";
			renderExcludedTaskTagsList();
			this.updateDirtyBanner();
		};
		new TagSuggest(this.app, excludedTaskTagInput, () => addExcludedTaskTag());

		const addExcludedTaskTagBtn = addExcludedTaskTagRow.createEl("button", { text: "Add" });
		addExcludedTaskTagBtn.addEventListener("click", addExcludedTaskTag);

		excludedTaskTagInput.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				addExcludedTaskTag();
			}
		});

		excludedTaskTagsListEl = excludedTaskTagsInputContainer.createDiv();
		renderExcludedTaskTagsList();

		const defaultTaskFileSetting = new Setting(taskPropertiesSection)
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
				new FileSuggest(this.app, text.inputEl);
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

		new Setting(displaySection)
			.setName("Show filepath")
			.setDesc("Show the filepath on each task in Kanban?")
			.addToggle((toggle) => {
				toggle.setValue(this.settings.showFilepath ?? true);
				toggle.onChange((value) => {
					this.settings.showFilepath = value;
					this.updateDirtyBanner();
				});
			});

		new Setting(displaySection)
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

		new Setting(advancedTaskParsingSection)
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

		new Setting(advancedTaskParsingSection)
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

		new Setting(advancedTaskParsingSection)
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

		new Setting(advancedTaskParsingSection)
			.setName("Debug: Show properties on cards")
			.setDesc("Display parsed property values below task text.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.settings.showProperties ?? false)
					.onChange((value) => {
						this.settings.showProperties = value;
						this.updateDirtyBanner();
					});
			});

		// Button bar (after scroll wrapper, still inside contentEl)
		const buttonBar = this.contentEl.createDiv({ cls: "settings-button-bar" });

		const cancelBtn = buttonBar.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => {
			this.close();
		});

		this.saveBtn = buttonBar.createEl("button", { text: "Save", cls: "mod-cta" });
		this.saveBtn.addEventListener("click", async () => {
			if (this.saveBtn) {
				this.saveBtn.disabled = true;
			}
			try {
				await this.onSubmit(this.settings, {
					updateExistingTaskTagsByColumnId: Object.fromEntries(this.updateExistingTaskTagsByColumnId),
				});
				this.close();
			} finally {
				if (this.saveBtn) {
					this.saveBtn.disabled = false;
				}
			}
		});

		// Apply validation state to save button now that it exists
		if (this.validationError) {
			this.saveBtn.disabled = true;
		}
	}

	onClose() {
		for (const destroy of this.mountedColumnControls) {
			destroy();
		}
		this.mountedColumnControls = [];
		this.contentEl.empty();
	}

	private getScopeFilter(): string[] | null {
		switch (this.settings.scope) {
			case ScopeOption.Folder:
				return this.boardFolderPath ? [this.boardFolderPath] : null;
			case ScopeOption.SelectedFolders: {
				const selected = this.settings.scopeFolders ?? [];
				return this.boardFolderPath
					? [this.boardFolderPath, ...selected.filter((folder) => folder !== this.boardFolderPath)]
					: selected;
			}
			default:
				return null;
		}
	}
}

class ConfirmColumnRemovalModal extends Modal {
	constructor(
		app: App,
		private readonly columnLabel: string,
		private readonly onConfirm: () => void,
	) {
		super(app);
	}

	onOpen() {
		this.contentEl.addClass("task-list-kanban-confirm-modal");
		this.contentEl.createEl("h2", { text: "Remove column?" });
		this.contentEl.createEl("p", {
			text: `Remove "${this.columnLabel || "Untitled column"}" from this board's settings?`,
		});
		this.contentEl.createEl("p", {
			text: "This change is not saved until you save the settings modal.",
			cls: "setting-item-description",
		});

		const actions = this.contentEl.createDiv({ cls: "confirm-modal-actions" });
		const cancelButton = actions.createEl("button", { text: "Cancel" });
		cancelButton.addEventListener("click", () => this.close());
		const removeButton = actions.createEl("button", { text: "Remove", cls: "mod-warning" });
		removeButton.addEventListener("click", () => {
			this.onConfirm();
			this.close();
		});
		window.requestAnimationFrame(() => cancelButton.focus());
	}

	onClose() {
		this.contentEl.empty();
	}
}
