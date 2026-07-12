import { App, Modal, Notice, Setting, TFile } from "obsidian";
import type { BoardIndexEntry } from "../boards/board_index";
import { createColumnData, type ColumnTag } from "../columns/columns";
import {
	parseKanbanSettingsOverridesFromViewData,
	writeKanbanSettingsToViewData,
} from "../kanban_frontmatter";
import {
	inheritedSettingsFromGlobalSettings,
	type GlobalSettings,
} from "../settings/global_settings";
import {
	resolveSettings,
	type SettingValues,
} from "../settings/settings_store";
import { shouldIncludeFilePath } from "./scope";
import { resolveScopeFilter } from "./scope";
import { updateRow } from "./source_line_editor";
import { buildNewTaskLine, type NewTaskColumn } from "./task_line_builder";
import { PropertySchemaOption } from "../../parsing/properties";

interface BoardOption {
	entry: BoardIndexEntry;
	file: TFile;
	settings: SettingValues;
	overrides: Partial<SettingValues>;
	boardContents: string;
	fileOptions: TFile[];
}

interface ColumnOption {
	id: NewTaskColumn;
	label: string;
}

export async function openCreateCardModal(
	app: App,
	boards: BoardIndexEntry[],
	globalSettings: GlobalSettings,
	preferredBoardPath?: string,
): Promise<void> {
	const boardOptions = await loadBoardOptions(app, boards, globalSettings);
	if (boardOptions.length === 0) {
		new Notice("No kanban boards found.");
		return;
	}

	new CreateCardModal(app, boardOptions, preferredBoardPath).open();
}

async function loadBoardOptions(
	app: App,
	boards: BoardIndexEntry[],
	globalSettings: GlobalSettings,
): Promise<BoardOption[]> {
	const options: BoardOption[] = [];
	for (const entry of boards) {
		const file = app.vault.getAbstractFileByPath(entry.path);
		if (!(file instanceof TFile)) {
			continue;
		}
		const boardContents = await app.vault.cachedRead(file);
		const overrides = parseKanbanSettingsOverridesFromViewData(boardContents);
		const settings = resolveSettings(
			inheritedSettingsFromGlobalSettings(globalSettings),
			overrides,
		);
		const boardFolderPath = file.parent?.path ?? null;
		const filenameFilter = resolveScopeFilter(
			settings.scope,
			settings.scopeFolders,
			boardFolderPath,
		);
		const excludeFilter = (settings.excludePaths ?? []).length > 0
			? settings.excludePaths ?? []
			: null;
		const fileOptions = app.vault
			.getMarkdownFiles()
			.filter((candidate) =>
				shouldIncludeFilePath(
					candidate.path,
					filenameFilter,
					excludeFilter,
					boardFolderPath,
				),
			)
			.sort((a, b) => a.path.localeCompare(b.path));

		options.push({ entry, file, settings, overrides, boardContents, fileOptions });
	}
	return options;
}

class CreateCardModal extends Modal {
	private selectedBoardIndex = 0;
	private selectedColumn: NewTaskColumn;
	private selectedFilePath = "";
	private draftContent = "";
	private textAreaEl: HTMLTextAreaElement | null = null;
	private submitButtonEl: HTMLButtonElement | null = null;

	constructor(
		app: App,
		private readonly boardOptions: BoardOption[],
		preferredBoardPath?: string,
	) {
		super(app);
		const preferredIndex = preferredBoardPath
			? this.boardOptions.findIndex((option) => option.entry.path === preferredBoardPath)
			: -1;
		this.selectedBoardIndex = preferredIndex >= 0 ? preferredIndex : 0;
		const initialBoard = this.boardOptions[this.selectedBoardIndex]!;
		this.selectedColumn = defaultColumnFor(initialBoard.settings);
		this.selectedFilePath = defaultFileFor(initialBoard)?.path ?? "";
	}

	onOpen() {
		this.modalEl.addClass("task-list-kanban-create-card-modal-container");
		this.contentEl.addClass("task-list-kanban-create-card-modal");
		this.render();
		window.requestAnimationFrame(() => this.textAreaEl?.focus());
	}

	onClose() {
		this.contentEl.empty();
	}

	private render() {
		this.contentEl.empty();
		this.contentEl.createEl("h2", { text: "Add card" });

		const contentSetting = new Setting(this.contentEl)
			.setName("Card text")
			.setClass("create-card-setting")
			.setClass("create-card-content-setting");
		this.textAreaEl = contentSetting.controlEl.createEl("textarea", {
			cls: "create-card-text",
			attr: { rows: "4" },
		});
		this.textAreaEl.value = this.draftContent;
		this.textAreaEl.addEventListener("input", () => {
			this.draftContent = this.textAreaEl?.value ?? "";
			this.updateSubmitState();
		});
		this.textAreaEl.addEventListener("keydown", (event) => {
			if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				void this.submit();
			}
		});

		this.createSelectField({
			label: "Board",
			options: this.boardOptions.map((option, index) => ({
				value: String(index),
				label: option.entry.name,
			})),
			value: String(this.selectedBoardIndex),
			onChange: (value) => {
				this.selectedBoardIndex = Number(value);
				const board = this.currentBoard();
				this.selectedColumn = defaultColumnFor(board.settings);
				this.selectedFilePath = defaultFileFor(board)?.path ?? "";
				this.render();
			},
		});

		this.createSelectField({
			label: "Column",
			options: columnOptionsFor(this.currentBoard().settings).map((option) => ({
				value: option.id,
				label: option.label,
			})),
			value: this.selectedColumn,
			onChange: (value) => {
				this.selectedColumn = value as NewTaskColumn;
			},
		});

		this.createSelectField({
			label: "File",
			options: this.currentBoard().fileOptions.map((file) => ({
				value: file.path,
				label: file.path,
			})),
			value: this.selectedFilePath,
			onChange: (value) => {
				this.selectedFilePath = value;
			},
		});

		const actions = this.contentEl.createDiv({ cls: "confirm-modal-actions" });
		const cancelButton = actions.createEl("button", { text: "Cancel" });
		cancelButton.addEventListener("click", () => this.close());
		this.submitButtonEl = actions.createEl("button", {
			text: "Add card",
			cls: "mod-cta",
		});
		this.submitButtonEl.addEventListener("click", () => void this.submit());
		this.updateSubmitState();
	}

	private createSelectField({
		label,
		options,
		value,
		onChange,
	}: {
		label: string;
		options: Array<{ value: string; label: string }>;
		value: string;
		onChange: (value: string) => void;
	}): HTMLSelectElement {
		const setting = new Setting(this.contentEl)
			.setName(label)
			.setClass("create-card-setting");
		const select = setting.controlEl.createEl("select", {
			cls: "create-card-select",
		});
		for (const option of options) {
			select.createEl("option", {
				text: option.label,
				value: option.value,
			});
		}
		select.value = value;
		select.addEventListener("change", () => onChange(select.value));
		return select;
	}

	private currentBoard(): BoardOption {
		return this.boardOptions[this.selectedBoardIndex] ?? this.boardOptions[0]!;
	}

	private updateSubmitState() {
		if (!this.submitButtonEl) {
			return;
		}
		this.submitButtonEl.disabled =
			(this.textAreaEl?.value.trim() ?? "") === "" ||
			!this.selectedFilePath ||
			this.currentBoard().fileOptions.length === 0;
	}

	private async submit() {
		const content = this.textAreaEl?.value.trim() ?? "";
		if (!content) {
			return;
		}
		const board = this.currentBoard();
		const targetFile = board.fileOptions.find(
			(file) => file.path === this.selectedFilePath,
		);
		if (!targetFile) {
			new Notice("Choose a file for the new card.");
			return;
		}

		const { columnPlacementTagTable } = createColumnData(board.settings.columns);
		const taskLine = buildNewTaskLine({
			content,
			column: this.selectedColumn,
			columnDefinitions: board.settings.columns,
			getPlacementTagsForColumn: (column: ColumnTag) =>
				columnPlacementTagTable[column] ?? [column],
			propertySchemaOption: board.settings.propertySchema ?? PropertySchemaOption.None,
		});
		const nextOverrides = {
			...board.overrides,
			lastUsedTaskFile: targetFile.path,
		};

		if (this.submitButtonEl) {
			this.submitButtonEl.disabled = true;
		}
		try {
			await updateRow(
				this.app.vault,
				targetFile,
				undefined,
				taskLine,
				(file, nextContents) =>
					file.path === board.file.path
						? writeKanbanSettingsToViewData(nextContents, nextOverrides)
						: nextContents,
			);
			if (targetFile.path !== board.file.path) {
				await this.app.vault.modify(
					board.file,
					writeKanbanSettingsToViewData(board.boardContents, nextOverrides),
				);
			}
			new Notice("Card added.");
			this.close();
		} catch (error) {
			console.error("Failed to add card from command", error);
			new Notice("Failed to add card.");
			if (this.submitButtonEl) {
				this.submitButtonEl.disabled = false;
			}
		}
	}
}

function columnOptionsFor(settings: SettingValues): ColumnOption[] {
	return [
		{ id: "uncategorised", label: settings.uncategorizedColumnName || "Uncategorized" },
		...settings.columns.map((column) => ({ id: column.id, label: column.label })),
		{ id: "done", label: settings.doneColumnName || "Done" },
	];
}

function defaultColumnFor(settings: SettingValues): NewTaskColumn {
	return settings.columns[0]?.id ?? "uncategorised";
}

function defaultFileFor(board: BoardOption): TFile | null {
	const preferredPaths = [
		board.settings.defaultTaskFile,
		board.settings.lastUsedTaskFile,
	].filter((path): path is string => !!path);
	for (const path of preferredPaths) {
		const file = board.fileOptions.find((candidate) => candidate.path === path);
		if (file) {
			return file;
		}
	}
	return board.fileOptions[0] ?? null;
}
