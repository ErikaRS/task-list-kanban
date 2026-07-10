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

function normalizePathInput(raw: string): string {
	return raw.trim().replace(/^\//, "").replace(/\/$/, "");
}

function normalizeTagInput(raw: string): string {
	return raw.trim().replace(/^#/, "");
}

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** The trimmed color when it is a valid #RRGGBB value, else null. */
function validHexColor(color: string | undefined): string | null {
	const trimmed = color?.trim();
	return trimmed && HEX_COLOR_PATTERN.test(trimmed) ? trimmed : null;
}

interface SettingsModalOptions {
	title?: string;
	mode?: "board" | "globalDefaults";
	layout?: "modal" | "embedded";
	/**
	 * Board mode only: enables inherited-vs-overridden indication with
	 * pin/reset affordances. `overriddenKeys` is the board's sparse override
	 * set at open time; `baseSettings` is what a field falls back to when
	 * its override is shed (builtin defaults ⊕ global defaults).
	 */
	overrideContext?: {
		overriddenKeys: (keyof SettingValues)[];
		baseSettings: SettingValues;
	};
}

/** The override lifecycle decisions a modal session hands back on submit. */
export interface SettingsSubmitOptions {
	updateExistingTaskTagsByColumnId: Record<string, boolean>;
	/** Fields to freeze at their current value even though it matches the default. */
	pinnedSettingKeys: (keyof SettingValues)[];
	/** Fields whose overrides should be shed so they follow the defaults again. */
	clearedSettingKeys: (keyof SettingValues)[];
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
	private defaultTaskFileInputEl: HTMLInputElement | null = null;
	private defaultTaskFileErrorEl: HTMLElement | null = null;
	// Override lifecycle state (SPEC 0030 Phase 4): which fields the board
	// overrode at open time, and the pin/reset decisions made this session.
	// Updaters refresh every chip and section-reset button after each change;
	// stale entries (from re-renders) drop out when they report disconnected.
	private readonly initialOverriddenKeys: Set<keyof SettingValues>;
	private readonly pinnedKeys = new Set<keyof SettingValues>();
	private readonly clearedKeys = new Set<keyof SettingValues>();
	private overrideChipUpdaters: Array<() => boolean> = [];

	constructor(
		app: App,
		private settings: SettingValues,
		private readonly onSubmit: (
			newSettings: SettingValues,
			options: SettingsSubmitOptions,
		) => void | Promise<void>,
		private readonly boardFolderPath: string | null,
		private readonly options: SettingsModalOptions = {},
	) {
		super(app);
		this.originalSettings = structuredClone(settings);
		this.originalSettingsSnapshot = JSON.stringify(settings);
		this.initialOverriddenKeys = new Set(options.overrideContext?.overriddenKeys ?? []);
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
		return (
			JSON.stringify(this.settings) !== this.originalSettingsSnapshot ||
			this.pinnedKeys.size > 0 ||
			this.clearedKeys.size > 0
		);
	}

	private overrideTrackingEnabled(): boolean {
		return !this.isGlobalDefaultsMode() && !!this.options.overrideContext;
	}

	private baseSettingsRecord(): Record<string, unknown> {
		return (this.options.overrideContext?.baseSettings ??
			defaultSettings) as unknown as Record<string, unknown>;
	}

	/**
	 * Whether a field would be persisted as an override if the modal were
	 * saved now: it was an override at open time (and not reset since), it
	 * was pinned this session, or its value was edited away from the
	 * original resolved value.
	 */
	private isEffectivelyOverridden(key: keyof SettingValues): boolean {
		const settingsRecord = this.settings as unknown as Record<string, unknown>;
		if (this.clearedKeys.has(key)) {
			// Editing a field after resetting it re-overrides it.
			return (
				JSON.stringify(settingsRecord[key]) !==
				JSON.stringify(this.baseSettingsRecord()[key])
			);
		}
		if (this.initialOverriddenKeys.has(key) || this.pinnedKeys.has(key)) {
			return true;
		}
		const originalRecord = this.originalSettings as unknown as Record<string, unknown>;
		return JSON.stringify(settingsRecord[key]) !== JSON.stringify(originalRecord[key]);
	}

	/** Sheds the fields' overrides: restores base values and marks them cleared. */
	private resetOverrideKeys(keys: readonly (keyof SettingValues)[]) {
		const settingsRecord = this.settings as unknown as Record<string, unknown>;
		const baseRecord = this.baseSettingsRecord();
		let valuesChanged = false;
		for (const key of keys) {
			if (!this.isEffectivelyOverridden(key)) {
				continue;
			}
			if (this.pinnedKeys.delete(key) && !this.initialOverriddenKeys.has(key)) {
				// A pin from this session froze the value at the base; undoing
				// the pin is the whole reset.
				continue;
			}
			if (
				JSON.stringify(settingsRecord[key]) !== JSON.stringify(baseRecord[key])
			) {
				settingsRecord[key] = structuredClone(baseRecord[key]);
				valuesChanged = true;
			}
			this.clearedKeys.add(key);
		}
		if (valuesChanged) {
			this.rerender();
		}
		this.touchSettings();
	}

	/**
	 * Pins fields at their current values. On a field that was reset earlier
	 * this session, this instead undoes the reset (restores the original
	 * override value).
	 */
	private pinOverrideKeys(keys: readonly (keyof SettingValues)[]) {
		const settingsRecord = this.settings as unknown as Record<string, unknown>;
		const originalRecord = this.originalSettings as unknown as Record<string, unknown>;
		let valuesChanged = false;
		for (const key of keys) {
			if (this.clearedKeys.delete(key)) {
				if (
					this.initialOverriddenKeys.has(key) &&
					JSON.stringify(settingsRecord[key]) !== JSON.stringify(originalRecord[key])
				) {
					settingsRecord[key] = structuredClone(originalRecord[key]);
					valuesChanged = true;
				}
			} else {
				this.pinnedKeys.add(key);
			}
		}
		if (valuesChanged) {
			this.rerender();
		}
		this.touchSettings();
	}

	/** The pin/reset decisions to hand to onSubmit, reconciled with edits. */
	private overrideLifecycleOptions(): Pick<
		SettingsSubmitOptions,
		"pinnedSettingKeys" | "clearedSettingKeys"
	> {
		if (!this.overrideTrackingEnabled()) {
			return { pinnedSettingKeys: [], clearedSettingKeys: [] };
		}
		const settingsRecord = this.settings as unknown as Record<string, unknown>;
		const baseRecord = this.baseSettingsRecord();
		// A reset followed by fresh edits is an override again, not a clear.
		const clearedSettingKeys = [...this.clearedKeys].filter(
			(key) =>
				JSON.stringify(settingsRecord[key]) === JSON.stringify(baseRecord[key]),
		);
		const clearedSet = new Set(clearedSettingKeys);
		const pinnedSettingKeys = [...this.pinnedKeys].filter((key) => !clearedSet.has(key));
		return { pinnedSettingKeys, clearedSettingKeys };
	}

	/**
	 * The inherited/overridden chip shown beside a setting. One chip can
	 * cover several fields (e.g. a bookend column's name and visibility);
	 * clicking toggles between resetting to the inherited values and
	 * pinning the current ones.
	 */
	private createOverrideChip(
		containerEl: HTMLElement,
		keys: readonly (keyof SettingValues)[],
	) {
		if (!this.overrideTrackingEnabled()) {
			return;
		}
		const chip = containerEl.createEl("button", { cls: "settings-override-chip" });
		chip.type = "button";
		const update = () => {
			if (!chip.isConnected) {
				return false;
			}
			const overridden = keys.some((key) => this.isEffectivelyOverridden(key));
			// The overridden state reads as its action so it is discoverable;
			// the inherited state stays a status label (clicking pins).
			chip.setText(overridden ? "Reset to defaults" : "Inherited");
			chip.toggleClass("is-overridden", overridden);
			chip.setAttribute(
				"aria-label",
				overridden
					? "This board overrides the default. Click to reset to the inherited value."
					: "Following the default. Click to pin the current value to this board.",
			);
			chip.title = chip.getAttribute("aria-label") ?? "";
			return true;
		};
		update();
		this.overrideChipUpdaters.push(update);
		chip.addEventListener("click", () => {
			const overridden = keys.some((key) => this.isEffectivelyOverridden(key));
			if (overridden) {
				this.resetOverrideKeys(keys);
			} else {
				this.pinOverrideKeys(keys);
			}
		});
	}

	/** Rebuilds the whole modal body (used when a reset changes field values). */
	private rerender() {
		const scrollTop = this.scrollWrapper?.scrollTop ?? 0;
		for (const destroy of this.mountedColumnControls) {
			destroy();
		}
		this.mountedColumnControls = [];
		this.overrideChipUpdaters = [];
		this.contentEl.empty();
		this.onOpen();
		this.scrollWrapper.scrollTop = scrollTop;
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
				...this.overrideLifecycleOptions(),
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
			overrideKeys: ["uncategorizedColumnName", "uncategorizedVisibility"],
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
			overrideKeys: ["doneColumnName", "doneVisibility"],
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
			overrideKeys: readonly (keyof SettingValues)[];
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

		this.createOverrideChip(fields, options.overrideKeys);
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

	/**
	 * A text setting that only commits valid values: invalid input gets an
	 * error border and tooltip while the last valid value stays in effect.
	 */
	private addValidatedTextSetting(
		container: HTMLElement,
		options: {
			name: string;
			desc: string;
			value: string;
			validTitle: string;
			overrideKey?: keyof SettingValues;
			validate: (value: string) => string[];
			onValid: (value: string) => void;
		},
	) {
		new Setting(container)
			.setName(options.name)
			.setDesc(options.desc)
			.addText((text) => {
				text.setValue(options.value);
				text.onChange((value) => {
					const errors = options.validate(value);
					if (errors.length > 0) {
						text.inputEl.style.borderColor = "var(--text-error)";
						text.inputEl.title = `Invalid: ${errors.join(", ")}`;
					} else {
						text.inputEl.style.borderColor = "";
						text.inputEl.title = options.validTitle;
						options.onValid(value);
						this.touchSettings();
					}
				});
			})
			.then((setting) => {
				if (options.overrideKey) {
					this.createOverrideChip(setting.nameEl, [options.overrideKey]);
				}
			});
	}

	/**
	 * A string-list editor: an input row (suggester + Enter/Add commit)
	 * above removable rows. Empty, duplicate, and rejected values are
	 * silently ignored.
	 */
	private createStringListEditor(
		container: HTMLDivElement,
		options: {
			placeholder: string;
			normalize: (raw: string) => string;
			/** Values silently refused on add (e.g. the board's own folder). */
			reject?: (value: string) => boolean;
			getItems: () => string[];
			setItems: (items: string[]) => void;
			/** Items to display; defaults to getItems. */
			renderItems?: () => string[];
			createSuggest: (inputEl: HTMLInputElement, commit: () => void) => void;
			/** Runs after every add/remove. */
			onChanged?: () => void;
			removeStyle: "icon" | "text";
			monospaceLabels?: boolean;
			warnWhenMissingFromVault?: boolean;
			/** Non-removable first row (the board's own folder). */
			pinnedRow?: { label: string; badge: string };
		},
	): { addRowEl: HTMLDivElement; refresh: () => void } {
		const addRowEl = container.createDiv({ cls: "settings-list-add-row" });
		const inputEl = addRowEl.createEl("input", {
			type: "text",
			placeholder: options.placeholder,
		});
		inputEl.addClass("setting-input");
		const listEl = container.createDiv();

		const refresh = () => {
			listEl.empty();
			if (options.pinnedRow) {
				const row = listEl.createDiv({ cls: "settings-list-row" });
				row.createSpan({ cls: "settings-list-label", text: options.pinnedRow.label });
				row.createSpan({ cls: "settings-list-note", text: options.pinnedRow.badge });
			}
			for (const item of (options.renderItems ?? options.getItems)()) {
				const row = listEl.createDiv({ cls: "settings-list-row" });
				row.createSpan({
					cls: options.monospaceLabels ? "settings-list-label-mono" : "settings-list-label",
					text: item,
				});
				if (options.warnWhenMissingFromVault && !this.app.vault.getAbstractFileByPath(item)) {
					row.createSpan({ cls: "settings-list-note is-warning", text: " (not found)" });
				}
				const removeButton = row.createEl("button", {
					text: options.removeStyle === "icon" ? "✕" : "Remove",
					cls:
						options.removeStyle === "icon"
							? "settings-list-remove-icon"
							: "settings-list-remove-text",
				});
				removeButton.addEventListener("click", () => {
					options.setItems(options.getItems().filter((candidate) => candidate !== item));
					refresh();
					options.onChanged?.();
				});
			}
		};

		const add = () => {
			const value = options.normalize(inputEl.value);
			if (!value || options.reject?.(value)) return;
			const items = options.getItems();
			if (items.includes(value)) return;
			options.setItems([...items, value]);
			inputEl.value = "";
			refresh();
			options.onChanged?.();
		};
		options.createSuggest(inputEl, add);

		const addButton = addRowEl.createEl("button", { text: "Add" });
		addButton.addEventListener("click", add);
		inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
			if (event.key === "Enter") {
				event.preventDefault();
				add();
			}
		});

		refresh();
		return { addRowEl, refresh };
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

	private wireColumnDragAndDrop(
		container: HTMLDivElement,
		row: HTMLDivElement,
		dragHandle: HTMLButtonElement,
		column: ColumnDefinition,
	) {
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
		this.wireColumnDragAndDrop(container, row, dragHandle, column);

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

		const updateSummarySwatch = () => {
			const hexColor = validHexColor(column.color);
			colorSummary.toggleClass("has-color", !!hexColor);
			colorSummary.style.setProperty("--column-editor-swatch-color", hexColor ?? "transparent");
			colorSummary.title = hexColor ?? "No color";
		};
		if (activePopover === "color") {
			this.renderColumnColorPopover(column, colorAnchor, colorSummary, updateSummarySwatch);
		}
		updateSummarySwatch();

		const updateRenameOption =
			activePopover === "match"
				? this.renderColumnMatchPopover(column, matchAnchor, matchSummary)
				: () => undefined;

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

	private renderColumnColorPopover(
		column: ColumnDefinition,
		anchor: HTMLDivElement,
		summaryButton: HTMLButtonElement,
		refreshSummarySwatch: () => void,
	) {
		const popover = anchor.createDiv({
			cls: "column-editor-popover column-editor-color-popover",
			attr: { role: "dialog", "aria-label": `${column.label || "Column"} color settings` },
		});
		popover.addEventListener("click", (event) => event.stopPropagation());
		const colorField = popover.createDiv({ cls: "column-editor-popover-field column-editor-field-color" });
		colorField.createDiv({ cls: "column-editor-inline-label", text: "Color" });
		const swatchButton = colorField.createEl("button", {
			cls: "column-editor-color-swatch",
		});
		swatchButton.type = "button";
		swatchButton.setAttribute("aria-label", `Pick color for ${column.label}`);
		const pickerInput = colorField.createEl("input", {
			type: "color",
			value: validHexColor(column.color) ?? "#000000",
		});
		pickerInput.addClass("column-editor-color-picker");
		const textInput = colorField.createEl("input", {
			type: "text",
			value: column.color ?? "",
			placeholder: "#RRGGBB",
		});
		textInput.addClass("setting-input");
		textInput.setAttribute("aria-label", `${column.label} color`);

		const refreshControls = () => {
			const hexColor = validHexColor(column.color);
			swatchButton.toggleClass("has-color", !!hexColor);
			swatchButton.style.setProperty("--column-editor-swatch-color", hexColor ?? "transparent");
			pickerInput.value = hexColor ?? "#000000";
			textInput.value = column.color ?? "";
			refreshSummarySwatch();
		};
		textInput.addEventListener("input", () => {
			column.color = textInput.value.trim() || undefined;
			refreshControls();
			this.touchSettings();
		});
		swatchButton.addEventListener("click", () => {
			pickerInput.click();
		});
		pickerInput.addEventListener("input", () => {
			column.color = pickerInput.value;
			refreshControls();
			this.touchSettings();
		});
		refreshControls();
		this.mountColumnPopoverDismiss(popover, summaryButton);
	}

	/**
	 * Renders the match-rule popover and returns the refresher for its
	 * "Update existing tasks" row, which the label input also triggers.
	 */
	private renderColumnMatchPopover(
		column: ColumnDefinition,
		anchor: HTMLDivElement,
		summaryButton: HTMLButtonElement,
	): () => void {
		let updateRenameOption: () => void = () => undefined;
		const matchPopover = anchor.createDiv({
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
		};
		updateRenameOption();
		renameCheckbox.addEventListener("change", () => {
			this.updateExistingTaskTagsByColumnId.set(column.id, renameCheckbox.checked);
			this.touchSettings();
		});
		this.mountColumnPopoverDismiss(matchPopover, summaryButton);
		return updateRenameOption;
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
		this.overrideChipUpdaters = this.overrideChipUpdaters.filter((update) => update());
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
			resetKeys?: readonly (keyof SettingValues)[],
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
			const headerRow = sectionHeader.createDiv({ cls: "settings-section-header-row" });
			headerRow.createEl("h2", { text: title });
			if (resetKeys && this.overrideTrackingEnabled()) {
				const resetButton = headerRow.createEl("button", {
					text: "Reset to defaults",
					cls: "settings-override-chip settings-section-reset",
				});
				resetButton.type = "button";
				resetButton.title =
					"Reset this section's settings to the inherited defaults. Board-only settings are not changed.";
				resetButton.addEventListener("click", () => this.resetOverrideKeys(resetKeys));
				const update = () => {
					if (!resetButton.isConnected) {
						return false;
					}
					resetButton.disabled = !resetKeys.some((key) =>
						this.isEffectivelyOverridden(key),
					);
					return true;
				};
				update();
				this.overrideChipUpdaters.push(update);
			}
			sectionHeader.createEl("p", { text: description, cls: "setting-item-description" });
			return section.createDiv({ cls: "settings-section-body" });
		};

		// Only globally-inheritable (Tier 1) fields participate in section
		// resets; board-local state (scope folders, default task file, …)
		// has no global default to fall back to.
		const columnsSection = createSection(
			"columns",
			"Columns",
			"Board columns, column labels, matching rules, and color accents.",
			[
				"columns",
				"uncategorizedColumnName",
				"uncategorizedVisibility",
				"doneColumnName",
				"doneVisibility",
			],
		);
		const taskPropertiesSection = createSection(
			"task-properties",
			"Task properties",
			"Property parsing, card property display, and task creation defaults.",
			["propertySchema", "propertyDisplay", "treatNestedTasksAsSubtasks"],
		);
		const scopeSection = createSection(
			"scope",
			"Scope",
			"Choose where the board looks for tasks, then subtract paths it should ignore.",
			["scope", "excludePaths"],
		);
		const displaySection = createSection(
			"display",
			"Display",
			"Card metadata, filepath, and tag display behavior.",
			["excludedTags", "excludedTaskTags", "showFilepath", "consolidateTags"],
		);
		const statusMarkersSection = createSection(
			"status-markers",
			"Status markers",
			"Task status markers and status-specific board behavior.",
			[
				"statusMarkerOrder",
				"doneStatusMarkers",
				"cancelledStatusMarkers",
				"ignoredStatusMarkers",
			],
		);

		this.columnsEditorEl = columnsSection;
		this.renderColumnsEditor();
		this.validateColumns();
		void this.refreshAvailableColumnTags();

		this.renderTaskPropertiesSection(taskPropertiesSection);
		this.renderScopeSection(scopeSection);
		this.renderDisplaySection(displaySection);
		this.renderStatusMarkersSection(statusMarkersSection);

		if (!this.isEmbedded()) {
			this.renderButtonBar();
		}

		// Apply validation state to save button now that it exists
		if (this.validationError && this.saveBtn) {
			this.saveBtn.disabled = true;
		}
	}

	private setDefaultTaskFileError(message: string) {
		if (!this.defaultTaskFileInputEl) return;
		if (message) {
			this.defaultTaskFileInputEl.style.outline =
				"2px solid var(--text-error)";
			this.defaultTaskFileInputEl.style.outlineOffset = "-1px";
			this.defaultTaskFileInputEl.title = message;
			if (this.defaultTaskFileErrorEl) {
				this.defaultTaskFileErrorEl.setText(message);
				this.defaultTaskFileErrorEl.style.visibility = "visible";
			}
		} else {
			this.defaultTaskFileInputEl.style.outline = "";
			this.defaultTaskFileInputEl.style.outlineOffset = "";
			this.defaultTaskFileInputEl.title = "";
			if (this.defaultTaskFileErrorEl) {
				this.defaultTaskFileErrorEl.setText("");
				this.defaultTaskFileErrorEl.style.visibility = "hidden";
			}
		}
	}

	/** Re-checked from the scope controls too: scope decides file validity. */
	private validateDefaultTaskFile() {
		if (this.isGlobalDefaultsMode()) {
			this.setDefaultTaskFileError("");
			return;
		}
		const value = this.settings.defaultTaskFile ?? "";
		if (!value) {
			this.setDefaultTaskFileError("");
			return;
		}
		const abstractFile =
			this.app.vault.getAbstractFileByPath(value);
		if (!(abstractFile instanceof TFile)) {
			this.setDefaultTaskFileError("File not found");
			return;
		}
		const scopeFilter = this.getScopeFilter();
		if (!shouldIncludeFilePath(value, scopeFilter, this.settings.excludePaths ?? [], this.boardFolderPath)) {
			const excludePaths = this.settings.excludePaths ?? [];
			const isExcludedByPath = excludePaths.length > 0 &&
				shouldIncludeFilePath(value, scopeFilter) &&
				!shouldIncludeFilePath(value, scopeFilter, excludePaths, this.boardFolderPath);
			this.setDefaultTaskFileError(
				isExcludedByPath
					? "File is excluded from the board's scope"
					: "File is outside the board's folder scope"
			);
			return;
		}
		this.setDefaultTaskFileError("");
	}

	private renderTaskPropertiesSection(container: HTMLDivElement) {
		new Setting(container)
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
			})
			.then((setting) => this.createOverrideChip(setting.nameEl, ["propertySchema"]));

		new Setting(container)
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
			})
			.then((setting) => this.createOverrideChip(setting.nameEl, ["propertyDisplay"]));

		new Setting(container)
			.setName("Treat nested tasks as subtasks")
			.setDesc("Display nested task rows inside their root task card instead of as separate cards.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.settings.treatNestedTasksAsSubtasks ?? false)
					.onChange((value) => {
						this.settings.treatNestedTasksAsSubtasks = value;
						this.updateDirtyBanner();
					});
			})
			.then((setting) =>
				this.createOverrideChip(setting.nameEl, ["treatNestedTasksAsSubtasks"]),
			);

		if (!this.isGlobalDefaultsMode()) {
			const defaultTaskFileSetting = new Setting(container)
				.setName("Default task file")
				.setDesc(
					"New tasks from 'Add new' will be created in this file by default. Use the vault-relative path (e.g., 'folder/tasks.md'). Leave empty to always show the full file picker."
				)
				.addText((text) => {
					this.defaultTaskFileInputEl = text.inputEl;
					text.setPlaceholder("e.g., notes/tasks.md");
					text.setValue(this.settings.defaultTaskFile ?? "");
					text.onChange((value) => {
						this.settings.defaultTaskFile = value;
						this.validateDefaultTaskFile();
						this.updateDirtyBanner();
					});
					new FileSuggest(this.app, text.inputEl);
				});
			defaultTaskFileSetting.controlEl.style.flexDirection = "column";
			defaultTaskFileSetting.controlEl.style.alignItems = "flex-end";
			const errorEl = createEl("div", {
				cls: "setting-error-message",
			});
			errorEl.style.color = "var(--text-error)";
			errorEl.style.fontSize = "var(--font-smallest)";
			errorEl.style.fontStyle = "italic";
			errorEl.style.marginTop = "4px";
			errorEl.style.minHeight = "1.2em";
			errorEl.style.visibility = "hidden";
			defaultTaskFileSetting.controlEl.appendChild(errorEl);
			this.defaultTaskFileErrorEl = errorEl;
			this.validateDefaultTaskFile();
		}
	}

	private renderScopeSection(scopeSection: HTMLDivElement) {
		// --- Folder scope dropdown + selected folders UI ---
		const scopeContainer = scopeSection.createDiv();

		let folderListContainer: HTMLDivElement | null = null;

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
					this.validateDefaultTaskFile();
					this.updateDirtyBanner();
				});
			})
			.then((setting) => this.createOverrideChip(setting.nameEl, ["scope"]));

		if (this.isGlobalDefaultsMode()) {
			scopeContainer.createEl("p", {
				text: "Selected folder paths stay board-local. The global default only chooses the scope mode.",
				cls: "setting-item-description",
			});
		} else {
			// Selected folders list UI
			folderListContainer = scopeContainer.createDiv({
				cls: "settings-list-indent settings-list-block",
			});
			this.createStringListEditor(folderListContainer, {
				placeholder: "e.g., projects/active",
				normalize: normalizePathInput,
				// The board's own folder is already included implicitly.
				reject: (value) => value === this.boardFolderPath,
				getItems: () => this.settings.scopeFolders ?? [],
				setItems: (items) => {
					this.settings.scopeFolders = items;
				},
				renderItems: () =>
					(this.settings.scopeFolders ?? []).filter(
						(folder) => folder !== this.boardFolderPath,
					),
				createSuggest: (inputEl, commit) => {
					new FolderSuggest(this.app, inputEl, commit);
				},
				onChanged: () => {
					this.validateDefaultTaskFile();
					this.updateDirtyBanner();
				},
				removeStyle: "icon",
				warnWhenMissingFromVault: true,
				pinnedRow: this.boardFolderPath
					? { label: this.boardFolderPath, badge: " (this board)" }
					: undefined,
			});
			updateFolderListVisibility();
		}

		// --- Excluded paths UI ---
		const excludeContainer = scopeSection.createDiv({ cls: "settings-subsection" });

		new Setting(excludeContainer)
			.setName("Excluded paths")
			.setDesc(
				"Folders and files the board skips after included folders are chosen."
			)
			.then((setting) => this.createOverrideChip(setting.nameEl, ["excludePaths"]));

		const excludeInputContainer = excludeContainer.createDiv({ cls: "settings-list-indent" });
		this.createStringListEditor(excludeInputContainer, {
			placeholder: "e.g., templates or notes/scratch.md",
			normalize: normalizePathInput,
			// The board's own folder can't be excluded directly.
			reject: (value) => value === this.boardFolderPath,
			getItems: () => this.settings.excludePaths ?? [],
			setItems: (items) => {
				this.settings.excludePaths = items;
			},
			createSuggest: (inputEl, commit) => {
				new PathSuggest(this.app, inputEl, commit);
			},
			onChanged: () => {
				this.validateDefaultTaskFile();
				this.updateDirtyBanner();
			},
			removeStyle: "icon",
			warnWhenMissingFromVault: true,
		});
	}

	private renderDisplaySection(displaySection: HTMLDivElement) {
		const excludedTagsContainer = displaySection.createDiv({ cls: "settings-subsection" });

		new Setting(excludedTagsContainer)
			.setName("Hidden Tags")
			.setDesc(
				"Tags to hide from display on task cards. The tasks themselves will still appear on the board."
			)
			.then((setting) => this.createOverrideChip(setting.nameEl, ["excludedTags"]));

		const excludedTagsInputContainer = excludedTagsContainer.createDiv({
			cls: "settings-list-indent",
		});
		const hiddenTagsEditor = this.createStringListEditor(excludedTagsInputContainer, {
			placeholder: "e.g., status",
			normalize: normalizeTagInput,
			getItems: () => this.settings.excludedTags ?? [],
			setItems: (items) => {
				this.settings.excludedTags = items;
			},
			createSuggest: (inputEl, commit) => {
				new TagSuggest(this.app, inputEl, commit);
			},
			onChanged: () => this.updateDirtyBanner(),
			removeStyle: "text",
			monospaceLabels: true,
		});

		const excludeColumnTagsBtn = hiddenTagsEditor.addRowEl.createEl("button", {
			text: "Exclude column tags",
		});
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
			hiddenTagsEditor.refresh();
			this.updateDirtyBanner();
		});

		const excludedTaskTagsContainer = displaySection.createDiv({ cls: "settings-subsection" });

		new Setting(excludedTaskTagsContainer)
			.setName("Excluded task tags")
			.setDesc(
				"Tasks containing these tags will be completely excluded from the board."
			)
			.then((setting) => this.createOverrideChip(setting.nameEl, ["excludedTaskTags"]));

		const excludedTaskTagsInputContainer = excludedTaskTagsContainer.createDiv({
			cls: "settings-list-indent",
		});
		this.createStringListEditor(excludedTaskTagsInputContainer, {
			placeholder: "e.g., archived",
			normalize: normalizeTagInput,
			getItems: () => this.settings.excludedTaskTags ?? [],
			setItems: (items) => {
				this.settings.excludedTaskTags = items;
			},
			createSuggest: (inputEl, commit) => {
				new TagSuggest(this.app, inputEl, commit);
			},
			onChanged: () => this.updateDirtyBanner(),
			removeStyle: "text",
			monospaceLabels: true,
		});

		new Setting(displaySection)
			.setName("Show filepath")
			.setDesc("Show the filepath on each task in Kanban?")
			.addToggle((toggle) => {
				toggle.setValue(this.settings.showFilepath ?? true);
				toggle.onChange((value) => {
					this.settings.showFilepath = value;
					this.updateDirtyBanner();
				});
			})
			.then((setting) => this.createOverrideChip(setting.nameEl, ["showFilepath"]));

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
			})
			.then((setting) => this.createOverrideChip(setting.nameEl, ["consolidateTags"]));
	}

	private renderStatusMarkersSection(statusMarkersSection: HTMLDivElement) {
		this.addValidatedTextSetting(statusMarkersSection, {
			name: "Status marker order",
			overrideKey: "statusMarkerOrder",
			desc: "Ascending order for status grouping and status sorting. Unchecked tasks come first unless this order includes a literal space. Unspecified markers appear afterward alphabetically, followed by done markers.",
			value: this.settings.statusMarkerOrder ?? "",
			validTitle: "Valid status marker order",
			validate: validateStatusMarkerOrder,
			onValid: (value) => {
				this.settings.statusMarkerOrder = value;
			},
		});

		this.addValidatedTextSetting(statusMarkersSection, {
			name: "Done status markers",
			overrideKey: "doneStatusMarkers",
			desc: "Characters that mark a task as done (e.g., 'xX' for [x] and [X]). Each character should be a single Unicode character without spaces.",
			value: this.settings.doneStatusMarkers ?? DEFAULT_DONE_STATUS_MARKERS,
			validTitle: "Valid done status markers",
			validate: validateDoneStatusMarkers,
			onValid: (value) => {
				this.settings.doneStatusMarkers = value;
			},
		});

		this.addValidatedTextSetting(statusMarkersSection, {
			name: "Cancelled status markers",
			overrideKey: "cancelledStatusMarkers",
			desc: "Characters that mark a task as cancelled (e.g., '-' for [-]). Each character should be a single Unicode character without spaces.",
			value: this.settings.cancelledStatusMarkers ?? DEFAULT_CANCELLED_STATUS_MARKERS,
			validTitle: "Valid cancelled status markers",
			validate: validateCancelledStatusMarkers,
			onValid: (value) => {
				this.settings.cancelledStatusMarkers = value;
			},
		});

		this.addValidatedTextSetting(statusMarkersSection, {
			name: "Ignored status markers",
			overrideKey: "ignoredStatusMarkers",
			desc: "Characters that mark tasks to be completely ignored by the kanban (e.g., '-' for [-] cancelled tasks). Leave empty to process all task-like strings. Each character should be a single Unicode character without spaces.",
			value: this.settings.ignoredStatusMarkers ?? DEFAULT_IGNORED_STATUS_MARKERS,
			validTitle: "Valid ignored status markers",
			validate: validateIgnoredStatusMarkers,
			onValid: (value) => {
				this.settings.ignoredStatusMarkers = value;
			},
		});
	}

	private renderButtonBar() {
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
					...this.overrideLifecycleOptions(),
				});
				this.close();
			} finally {
				if (this.saveBtn) {
					this.saveBtn.disabled = false;
				}
			}
		});
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

