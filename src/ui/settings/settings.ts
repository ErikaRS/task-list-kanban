import { App, Modal, Setting, TFile, setIcon } from "obsidian";
import { ConfirmModal } from "./confirm_modal";
import CompactTagSelect from "../components/select/compact_tag_select.svelte";
import type { SettingValues } from "./settings_store";
import {
	VisibilityOption,
	ScopeOption,
	PropertyDisplayMode,
	defaultSettings,
} from "../settings/settings_store";
import { z } from "zod";
import { DEFAULT_DONE_STATUS_MARKERS, DEFAULT_CANCELLED_STATUS_MARKERS, DEFAULT_IGNORED_STATUS_MARKERS, isTrackedTaskString, validateDoneStatusMarkers, validateCancelledStatusMarkers, validateIgnoredStatusMarkers, validateStatusMarkerOrder } from "../tasks/task";
import { PropertySchemaOption } from "../../parsing/properties/property_schema";
import { TASKS_PRIORITY_OPTIONS } from "../../parsing/properties/tasks_schema";
import { resolveScopeFilter, shouldIncludeFilePath } from "../tasks/scope";
import { getTagsFromContent } from "src/parsing/tags/tags";
import {
	type ColumnDefinition,
	getColumnWriteTags,
} from "../columns/columns";
import {
	columnRuleSignature,
	createColumnId,
	getPriorityColumnLabel,
	getColumnPrioritySchema,
	getStatusColumnLabel,
	usesPriorityMatching,
	usesStatusMatching,
	usesTagMatching,
} from "../columns/definitions";
import { moveColumnRelativeTo, type DropPosition } from "./column_reorder";
import { getColumnValidationError } from "./column_validation";
import { FolderSuggest, PathSuggest, FileSuggest, TagSuggest } from "./suggest";

const VisibilityOptionSchema = z.nativeEnum(VisibilityOption);
const ScopeOptionSchema = z.nativeEnum(ScopeOption);

interface SettingsModalOptions {
	title?: string;
	mode?: "board" | "globalDefaults";
	layout?: "modal" | "embedded";
}

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
	private activeColumnPopover: { columnId: string; kind: "color" | "match" } | null = null;
	private draggedColumnId: string | null = null;
	private dragPreviewTarget: { columnId: string; position: DropPosition } | null = null;
	private focusTagEditorColumnId: string | null = null;
	private embeddedSubmitTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		app: App,
		private settings: SettingValues,
		private readonly onSubmit: (
			newSettings: SettingValues,
			options: { updateExistingTaskTagsByColumnId: Record<string, boolean> },
		) => void | Promise<void>,
		private readonly boardFolderPath: string | null,
		private readonly options: SettingsModalOptions = {},
	) {
		super(app);
		this.originalSettings = structuredClone(settings);
		this.originalSettingsSnapshot = JSON.stringify(settings);
	}

	private isGlobalDefaultsMode(): boolean {
		return this.options.mode === "globalDefaults";
	}

	private isEmbedded(): boolean {
		return this.options.layout === "embedded";
	}

	mountInline(containerEl: HTMLElement): () => void {
		this.contentEl = containerEl;
		this.onOpen();
		return () => this.onClose();
	}

	private isDirty(): boolean {
		return JSON.stringify(this.settings) !== this.originalSettingsSnapshot;
	}

	private validateColumns() {
		this.validationError = getColumnValidationError(this.settings.columns ?? [], {
			doneStatusMarkers: this.settings.doneStatusMarkers ?? DEFAULT_DONE_STATUS_MARKERS,
			ignoredStatusMarkers: this.settings.ignoredStatusMarkers ?? DEFAULT_IGNORED_STATUS_MARKERS,
			propertySchema: this.settings.propertySchema ?? PropertySchemaOption.None,
			originalColumns: this.originalSettings.columns,
		});
		this.updateValidationBanner();
	}

	private touchSettings() {
		this.validateColumns();
		this.updateDirtyBanner();
	}

	private scheduleEmbeddedSubmit() {
		if (!this.isEmbedded() || this.validationError) {
			return;
		}
		if (this.embeddedSubmitTimer) {
			clearTimeout(this.embeddedSubmitTimer);
		}
		this.embeddedSubmitTimer = setTimeout(() => {
			this.embeddedSubmitTimer = null;
			void this.onSubmit(this.settings, {
				updateExistingTaskTagsByColumnId: Object.fromEntries(this.updateExistingTaskTagsByColumnId),
			});
		}, 150);
	}

	private getOriginalColumn(columnId: string): ColumnDefinition | undefined {
		return this.originalSettings.columns.find((column) => column.id === columnId);
	}

	private shouldShowRetagOption(column: ColumnDefinition): boolean {
		if (this.isGlobalDefaultsMode()) return false;
		const originalColumn = this.getOriginalColumn(column.id);
		if (!originalColumn) return false;
		return columnRuleSignature(originalColumn) !== columnRuleSignature(column);
	}

	private shouldUpdateExistingTaskTags(columnId: string): boolean {
		return this.updateExistingTaskTagsByColumnId.get(columnId) ?? true;
	}

	private getActivePrioritySchema(): PropertySchemaOption.TasksPlugin | PropertySchemaOption.Dataview | undefined {
		return this.settings.propertySchema === PropertySchemaOption.TasksPlugin || this.settings.propertySchema === PropertySchemaOption.Dataview
			? this.settings.propertySchema
			: undefined;
	}

	private canSelectPriorityMode(column: ColumnDefinition): boolean {
		return !!this.getActivePrioritySchema() || usesPriorityMatching(column);
	}

	private canEditPriorityValue(column: ColumnDefinition): boolean {
		return usesPriorityMatching(column) && getColumnPrioritySchema(column) === this.getActivePrioritySchema();
	}

	private confirmRemoveColumn(column: ColumnDefinition) {
		new ConfirmModal(this.app, {
			title: "Remove column?",
			body: `Remove "${column.label || "Untitled column"}" from this board's settings?`,
			note: "This change is not saved until you save the settings modal.",
			confirmText: "Remove",
			onConfirm: () => {
				this.settings.columns = this.settings.columns.filter((candidate) => candidate.id !== column.id);
				this.updateExistingTaskTagsByColumnId.delete(column.id);
				if (this.activeColumnPopover?.columnId === column.id) {
					this.activeColumnPopover = null;
				}
				this.renderColumnsEditor();
				this.touchSettings();
			},
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
			text: "Rename, reorder, and map board columns. Use the color and match controls to edit each column's rules.",
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
		if (usesStatusMatching(column)) {
			return column.matchStatus ? `Status: ${getStatusColumnLabel(column.matchStatus)}` : "Needs status";
		}
			if (usesPriorityMatching(column)) {
				return column.matchPriority ? `Priority: ${getPriorityColumnLabel(column.matchPriority)}` : "Needs priority";
			}
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

	private getStatusMarkerOptions(): Array<{ value: string; label: string }> {
		const values = new Set<string>([" "]);
		for (const marker of Array.from(this.settings.statusMarkerOrder ?? "")) {
			values.add(marker);
		}
		for (const marker of Array.from(this.settings.cancelledStatusMarkers ?? DEFAULT_CANCELLED_STATUS_MARKERS)) {
			values.add(marker);
		}

		return [...values].map((value) => ({
			value,
			label: value === " " ? "Unchecked" : value,
		}));
	}

	private mountColumnPopoverDismiss(popover: HTMLElement, trigger: HTMLElement) {
		const ownerDocument = popover.ownerDocument;
		const closePopover = () => {
			this.activeColumnPopover = null;
			this.renderColumnsEditor();
		};
		const handleDocumentClick = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (popover.contains(target) || trigger.contains(target)) return;
			closePopover();
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			closePopover();
		};
		const timeoutId = window.setTimeout(() => {
			ownerDocument.addEventListener("click", handleDocumentClick);
			ownerDocument.addEventListener("keydown", handleKeyDown);
		});
		this.mountedColumnControls.push(() => {
			window.clearTimeout(timeoutId);
			ownerDocument.removeEventListener("click", handleDocumentClick);
			ownerDocument.removeEventListener("keydown", handleKeyDown);
		});
	}

	private renderCustomColumnRow(container: HTMLDivElement, column: ColumnDefinition) {
		const activePopover = this.activeColumnPopover?.columnId === column.id
			? this.activeColumnPopover.kind
			: null;
		const row = container.createDiv({
			cls: "column-editor-row",
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

		const openPopover = (kind: "color" | "match") => {
			this.activeColumnPopover =
				activePopover === kind ? null : { columnId: column.id, kind };
			this.renderColumnsEditor();
		};
		const colorAnchor = summary.createDiv({ cls: "column-editor-popover-anchor column-editor-color-anchor" });
		const colorSummary = colorAnchor.createEl("button", {
			cls: "column-editor-color-swatch column-editor-summary-swatch",
		});
		colorSummary.type = "button";
		colorSummary.setAttribute("aria-haspopup", "dialog");
		colorSummary.setAttribute("aria-expanded", activePopover === "color" ? "true" : "false");
		colorSummary.setAttribute("aria-label", `Edit color for ${column.label || "column"}`);
		colorSummary.addEventListener("click", () => openPopover("color"));

		const matchAnchor = summary.createDiv({ cls: "column-editor-popover-anchor column-editor-match-anchor" });
		const matchSummary = matchAnchor.createEl("button", {
			cls: "column-editor-pill column-editor-summary-button",
		});
		matchSummary.type = "button";
		matchSummary.setText(this.getColumnMatchSummary(column));
		matchSummary.setAttribute("aria-haspopup", "dialog");
		matchSummary.setAttribute("aria-expanded", activePopover === "match" ? "true" : "false");
		matchSummary.setAttribute("aria-label", `Edit match settings for ${column.label || "column"}`);
		matchSummary.addEventListener("click", () => openPopover("match"));

		let colorSwatchButton: HTMLButtonElement | null = null;
		let colorPickerInput: HTMLInputElement | null = null;
		let colorInput: HTMLInputElement | null = null;
		const updateColorSwatch = () => {
			const colorValue = column.color?.trim();
			const hasValidColor = !!colorValue && /^#[0-9a-fA-F]{6}$/.test(colorValue);
			colorSummary.toggleClass("has-color", hasValidColor);
			colorSummary.style.setProperty("--column-editor-swatch-color", hasValidColor ? colorValue! : "transparent");
			colorSummary.title = hasValidColor ? colorValue! : "No color";
			if (colorSwatchButton) {
				colorSwatchButton.toggleClass("has-color", hasValidColor);
				colorSwatchButton.style.setProperty("--column-editor-swatch-color", hasValidColor ? colorValue! : "transparent");
			}
			if (colorPickerInput) {
				colorPickerInput.value = hasValidColor ? colorValue! : "#000000";
			}
			if (colorInput) {
				colorInput.value = column.color ?? "";
			}
		};

		if (activePopover === "color") {
			const colorPopover = colorAnchor.createDiv({
				cls: "column-editor-popover column-editor-color-popover",
				attr: { role: "dialog", "aria-label": `${column.label || "Column"} color settings` },
			});
			colorPopover.addEventListener("click", (event) => event.stopPropagation());
			const colorField = colorPopover.createDiv({ cls: "column-editor-popover-field column-editor-field-color" });
			colorField.createDiv({ cls: "column-editor-inline-label", text: "Color" });
			colorSwatchButton = colorField.createEl("button", {
				cls: "column-editor-color-swatch",
			});
			colorSwatchButton.type = "button";
			colorSwatchButton.setAttribute("aria-label", `Pick color for ${column.label}`);
			colorPickerInput = colorField.createEl("input", {
				type: "color",
				value: /^#[0-9a-fA-F]{6}$/.test(column.color ?? "") ? column.color : "#000000",
			});
			colorPickerInput.addClass("column-editor-color-picker");
			colorInput = colorField.createEl("input", {
				type: "text",
				value: column.color ?? "",
				placeholder: "#RRGGBB",
			});
			colorInput.addClass("setting-input");
			colorInput.setAttribute("aria-label", `${column.label} color`);
			colorInput.addEventListener("input", () => {
				column.color = colorInput?.value.trim() || undefined;
				updateColorSwatch();
				this.touchSettings();
			});
			colorSwatchButton.addEventListener("click", () => {
				colorPickerInput?.click();
			});
			colorPickerInput.addEventListener("input", () => {
				if (!colorPickerInput) return;
				column.color = colorPickerInput.value;
				updateColorSwatch();
				this.touchSettings();
			});
			this.mountColumnPopoverDismiss(colorPopover, colorSummary);
		}
		updateColorSwatch();

		let updateRenameOption = () => undefined;
		if (activePopover === "match") {
			const matchPopover = matchAnchor.createDiv({
				cls: "column-editor-popover column-editor-match-popover",
				attr: { role: "dialog", "aria-label": `${column.label || "Column"} match settings` },
			});
			matchPopover.addEventListener("click", (event) => event.stopPropagation());

			const matchModeField = matchPopover.createDiv({ cls: "column-editor-popover-field column-editor-field-match" });
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
			matchModeSelect.createEl("option", {
				value: "status",
				text: "Status marker",
			});
			if (this.canSelectPriorityMode(column)) {
				matchModeSelect.createEl("option", {
					value: "priority",
					text: "Priority",
				});
			}
			matchModeSelect.value = column.matchMode;
			matchModeSelect.addEventListener("change", () => {
				const activePrioritySchema = this.getActivePrioritySchema();
				column.matchMode =
					matchModeSelect.value === "tags" ||
					matchModeSelect.value === "status" ||
					(matchModeSelect.value === "priority" && activePrioritySchema)
						? matchModeSelect.value
						: "name";
				if (column.matchMode === "name") {
					column.matchTags = [];
					column.matchStatus = undefined;
					column.matchPriority = undefined;
					column.matchPropertySchema = undefined;
				} else if (column.matchMode === "status") {
					column.matchTags = [];
					column.matchStatus = column.matchStatus ?? " ";
					column.matchPriority = undefined;
					column.matchPropertySchema = undefined;
				} else if (column.matchMode === "priority") {
					column.matchTags = [];
					column.matchStatus = undefined;
					column.matchPriority = column.matchPriority ?? "medium";
					column.matchPropertySchema = activePrioritySchema;
				} else {
					column.matchStatus = undefined;
					column.matchPriority = undefined;
					column.matchPropertySchema = undefined;
					this.focusTagEditorColumnId = column.id;
				}
				this.activeColumnPopover = { columnId: column.id, kind: "match" };
				this.renderColumnsEditor();
				this.touchSettings();
			});

			if (usesTagMatching(column)) {
				const tagsField = matchPopover.createDiv({ cls: "column-editor-popover-field column-editor-field-tag" });
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

			if (usesStatusMatching(column)) {
				const statusField = matchPopover.createDiv({ cls: "column-editor-popover-field column-editor-field-status" });
				statusField.createDiv({ cls: "column-editor-inline-label", text: "Status" });
				const statusSelect = statusField.createEl("select");
				statusSelect.addClass("dropdown");
				statusSelect.setAttribute("aria-label", `${column.label} known status marker`);
				const markerOptions = this.getStatusMarkerOptions();
				for (const option of markerOptions) {
					statusSelect.createEl("option", {
						value: option.value,
						text: option.label,
					});
				}
				statusSelect.createEl("option", {
					value: "custom",
					text: "Custom",
				});

				const customStatusInput = statusField.createEl("input", {
					type: "text",
					value: column.matchStatus && column.matchStatus !== " " ? column.matchStatus : "",
					placeholder: "e.g., /",
				});
				customStatusInput.addClass("setting-input");
				customStatusInput.setAttribute("aria-label", `${column.label} custom status marker`);
				customStatusInput.title = "Enter one status marker, such as / or !";

				const setStatusControlValues = () => {
					const status = column.matchStatus ?? " ";
					statusSelect.value = markerOptions.some((option) => option.value === status) ? status : "custom";
					customStatusInput.value = status === " " ? "" : status;
					customStatusInput.toggleClass("is-visible", statusSelect.value === "custom");
				};
				setStatusControlValues();
				statusSelect.addEventListener("change", () => {
					if (statusSelect.value !== "custom") {
						column.matchStatus = statusSelect.value;
						setStatusControlValues();
					} else if (!column.matchStatus || column.matchStatus === " ") {
						column.matchStatus = "";
						customStatusInput.value = "";
						customStatusInput.focus();
					}
					customStatusInput.toggleClass("is-visible", statusSelect.value === "custom");
					updateRenameOption();
					this.touchSettings();
				});
				customStatusInput.addEventListener("input", () => {
					column.matchStatus = customStatusInput.value;
					statusSelect.value = markerOptions.some((option) => option.value === column.matchStatus)
						? column.matchStatus
						: "custom";
					customStatusInput.toggleClass("is-visible", statusSelect.value === "custom");
					updateRenameOption();
					this.touchSettings();
				});
			}

			if (usesPriorityMatching(column)) {
				const priorityField = matchPopover.createDiv({ cls: "column-editor-popover-field column-editor-field-priority" });
				priorityField.createDiv({ cls: "column-editor-inline-label", text: "Priority" });
				if (this.canEditPriorityValue(column)) {
					if (getColumnPrioritySchema(column) === PropertySchemaOption.Dataview) {
						const priorityInput = priorityField.createEl("input", {
							type: "text",
							value: column.matchPriority ?? "",
							placeholder: "high",
						});
						priorityInput.addClass("column-editor-inline-input");
						priorityInput.setAttribute("aria-label", `${column.label} priority`);
						priorityInput.addEventListener("input", () => {
							column.matchPriority = priorityInput.value;
							column.matchPropertySchema = PropertySchemaOption.Dataview;
							updateRenameOption();
							this.touchSettings();
						});
					} else {
						const prioritySelect = priorityField.createEl("select");
						prioritySelect.addClass("dropdown");
						prioritySelect.setAttribute("aria-label", `${column.label} priority`);
						for (const option of TASKS_PRIORITY_OPTIONS) {
							prioritySelect.createEl("option", {
								value: option.value,
								text: `${option.label} ${option.emoji}`,
							});
						}
						prioritySelect.value = column.matchPriority ?? "medium";
						prioritySelect.addEventListener("change", () => {
							column.matchPriority = prioritySelect.value;
							column.matchPropertySchema = PropertySchemaOption.TasksPlugin;
							updateRenameOption();
							this.touchSettings();
						});
					}
				} else {
					const schemaLabel = getColumnPrioritySchema(column) === PropertySchemaOption.Dataview
						? "Dataview"
						: "Tasks Plugin";
					priorityField.createDiv({
						cls: "setting-item-description",
						text: `${schemaLabel}: ${getPriorityColumnLabel(column.matchPriority)}. Switch Property schema to ${schemaLabel} to edit this value.`,
					});
				}
			}

			const renameOption = matchPopover.createDiv({ cls: "column-editor-rename-option" });
			const renameCheckbox = renameOption.createEl("input", { type: "checkbox" });
			const renameCheckboxId = `column-editor-update-${column.id}`;
			renameCheckbox.id = renameCheckboxId;
			const renameLabel = renameOption.createEl("label", {
				text: "Update existing tasks",
			});
			renameLabel.htmlFor = renameCheckboxId;
			updateRenameOption = () => {
				const show = this.shouldShowRetagOption(column);
				renameOption.style.display = show ? "flex" : "none";
				renameCheckbox.checked = this.shouldUpdateExistingTaskTags(column.id);
				renameCheckbox.setAttribute("aria-label", `Update existing tasks for ${column.label || "column"}`);
				void renameLabel;
			};
			updateRenameOption();
			renameCheckbox.addEventListener("change", () => {
				this.updateExistingTaskTagsByColumnId.set(column.id, renameCheckbox.checked);
				this.touchSettings();
			});
			this.mountColumnPopoverDismiss(matchPopover, matchSummary);
		}

		labelInput.addEventListener("input", () => {
			column.label = labelInput.value;
			updateRenameOption();
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
		this.scheduleEmbeddedSubmit();
	}

	onOpen() {
		if (this.isEmbedded()) {
			this.contentEl.addClass("task-list-kanban-settings-inline");
		} else {
			// Set up flex layout — need classes on both modalEl and contentEl
			// so contentEl fills the modal and our inner flex layout works
			this.modalEl.addClass("task-list-kanban-settings-modal-container");
			this.contentEl.addClass("task-list-kanban-settings-modal");
		}

		this.scrollWrapper = this.contentEl.createDiv({ cls: "settings-scroll-wrapper" });
		const header = this.scrollWrapper.createDiv({ cls: "settings-header" });
		header.createEl(this.isEmbedded() ? "h2" : "h1", { text: this.options.title ?? "Settings" });
		const headerStatus = header.createDiv({ cls: "settings-header-status" });
		this.headerValidationPill = headerStatus.createDiv({ cls: "settings-status-pill settings-status-pill-validation" });
		this.headerDirtyPill = headerStatus.createDiv({ cls: "settings-status-pill settings-status-pill-dirty" });

		const settingsBody = this.scrollWrapper.createDiv({
			cls: this.isEmbedded() ? "settings-body settings-body-inline" : "settings-body",
		});
		const settingsNav = this.isEmbedded() ? null : settingsBody.createDiv({ cls: "settings-nav" });
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
			if (settingsNav) {
				const navButton = settingsNav.createEl("button", { text: title });
				navButton.type = "button";
				navButton.addEventListener("click", () => {
					section.scrollIntoView({ behavior: "smooth", block: "start" });
				});
			}

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
		const statusMarkersSection = createSection(
			"status-markers",
			"Status markers",
			"Task status markers and status-specific board behavior.",
		);

		this.columnsEditorEl = columnsSection;
		this.renderColumnsEditor();
		this.validateColumns();
		void this.refreshAvailableColumnTags();

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

		new Setting(taskPropertiesSection)
			.setName("Show properties")
			.setDesc(
				"How parsed property values are displayed below task text. \"Pretty\" shows formatted values; \"Debug (JSON)\" shows the raw parsed data."
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOption(PropertyDisplayMode.None, "None")
					.addOption(PropertyDisplayMode.Pretty, "Pretty")
					.addOption(PropertyDisplayMode.Debug, "Debug (JSON)")
					.setValue(this.settings.propertyDisplay ?? PropertyDisplayMode.None)
					.onChange((value) => {
						this.settings.propertyDisplay = value as PropertyDisplayMode;
						this.updateDirtyBanner();
					});
			});

		new Setting(taskPropertiesSection)
			.setName("Treat nested tasks as subtasks")
			.setDesc("Display nested task rows inside their root task card instead of as separate cards.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.settings.treatNestedTasksAsSubtasks ?? false)
					.onChange((value) => {
						this.settings.treatNestedTasksAsSubtasks = value;
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
			if (this.isGlobalDefaultsMode()) {
				setDefaultTaskFileError("");
				return;
			}
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

		let folderListContainer: HTMLDivElement | null = null;
		let folderListEl: HTMLDivElement | null = null;

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
			if (!folderListEl) return;
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
			if (!folderListContainer) return;
			folderListContainer.style.display =
				this.settings.scope === ScopeOption.SelectedFolders
					? "block"
					: "none";
		};

		new Setting(scopeContainer)
			.setName("Included folders")
			.setDesc("Folders the board searches for tasks. The board's own folder is always included.")
			.addDropdown((dropdown) => {
				dropdown.addOption(ScopeOption.Folder, "Same as board folder");
				dropdown.addOption(ScopeOption.Everywhere, "Every folder");
				dropdown.addOption(
					ScopeOption.SelectedFolders,
					this.isGlobalDefaultsMode()
						? "Selected folders (configured per board)"
						: "Selected folders"
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

		if (this.isGlobalDefaultsMode()) {
			scopeContainer.createEl("p", {
				text: "Selected folder paths stay board-local. The global default only chooses the scope mode.",
				cls: "setting-item-description",
			});
		} else {
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
		}

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

		if (!this.isGlobalDefaultsMode()) {
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
		}

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

		new Setting(statusMarkersSection)
			.setName("Status marker order")
			.setDesc(
				"Ascending order for status grouping and status sorting. Unchecked tasks come first unless this order includes a literal space. Unspecified markers appear afterward alphabetically, followed by done markers."
			)
			.addText((text) => {
				text.setValue(this.settings.statusMarkerOrder ?? "");
				text.onChange((value) => {
					const errors = validateStatusMarkerOrder(value);
					if (errors.length > 0) {
						text.inputEl.style.borderColor = "var(--text-error)";
						text.inputEl.title = `Invalid: ${errors.join(', ')}`;
					} else {
						text.inputEl.style.borderColor = "";
						text.inputEl.title = "Valid status marker order";
						this.settings.statusMarkerOrder = value;
						this.touchSettings();
					}
				});
			});

		new Setting(statusMarkersSection)
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
						this.touchSettings();
					}
				});
			});

		new Setting(statusMarkersSection)
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
						this.touchSettings();
					}
				});
			});

		new Setting(statusMarkersSection)
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
						this.touchSettings();
					}
				});
			});

		if (!this.isEmbedded()) {
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
		}

		// Apply validation state to save button now that it exists
		if (this.validationError && this.saveBtn) {
			this.saveBtn.disabled = true;
		}
	}

	onClose() {
		if (this.embeddedSubmitTimer) {
			clearTimeout(this.embeddedSubmitTimer);
			this.embeddedSubmitTimer = null;
		}
		for (const destroy of this.mountedColumnControls) {
			destroy();
		}
		this.mountedColumnControls = [];
		this.contentEl.empty();
	}

	private getScopeFilter(): string[] | null {
		return resolveScopeFilter(this.settings.scope, this.settings.scopeFolders, this.boardFolderPath);
	}
}

