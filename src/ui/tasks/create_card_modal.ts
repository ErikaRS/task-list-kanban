import { App, Modal, Notice, Setting, TFile } from "obsidian";
import type { BoardIndexEntry } from "../boards/board_index";
import { createColumnData, type ColumnTag } from "../columns/columns";
import {
	parseKanbanPathScopeFromViewData,
	parseKanbanSettingsOverridesFromViewData,
	writeKanbanSettingsToViewData,
} from "../kanban_frontmatter";
import {
	inheritedSettingsFromGlobalSettings,
	type GlobalSettings,
} from "../settings/global_settings";
import {
	resolveSettings,
	ScopeOption,
	type SettingValues,
} from "../settings/settings_store";
import {
	getProtectedBoardFolderPath,
	resolveScopeFilter,
	shouldIncludeFilePath,
} from "./scope";
import { resolveDateTemplate, type PathScopeV2 } from "./path_scope";
import {
	createDailyNote,
	DAILY_NOTE_TARGET,
	getDailyNoteSource,
	resolveDailyNotePath,
	type DailyNoteSource,
} from "./daily_note";
import { insertNewTask } from "./task_insertion";
import { buildNewTaskLine, type NewTaskColumn } from "./task_line_builder";
import { PropertySchemaOption } from "../../parsing/properties";

interface BoardOption {
	entry: BoardIndexEntry;
	file: TFile;
	settings: SettingValues;
	overrides: Partial<SettingValues>;
	boardContents: string;
	fileOptions: TFile[];
	pathScope?: PathScopeV2;
	dailyNoteSource: DailyNoteSource;
	isInScope: (path: string, now?: Date) => boolean;
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
		let settings = resolveSettings(
			inheritedSettingsFromGlobalSettings(globalSettings),
			overrides,
		);
		const pathScope = parseKanbanPathScopeFromViewData(boardContents);
		if (pathScope?.active) {
			settings = { ...settings, scope: ScopeOption.SelectedPaths };
		}
		const boardFolderPath = file.parent?.path ?? null;
		const excludeFilter = (settings.excludePaths ?? []).length > 0
			? settings.excludePaths ?? []
			: null;
		// Dated Selected paths must resolve for the same day as the destination.
		const isInScope = (path: string, now = new Date()) =>
			shouldIncludeFilePath(
				path,
				resolveScopeFilter(settings.scope, settings.scopeFolders, boardFolderPath, pathScope, now),
				excludeFilter,
				getProtectedBoardFolderPath(settings.scope, boardFolderPath),
			);
		const fileOptions = app.vault
			.getMarkdownFiles()
			.filter((candidate) => isInScope(candidate.path))
			.sort((a, b) => a.path.localeCompare(b.path));
		const dailyNoteSource = getDailyNoteSource(app, settings.dailyNotePath ?? "");

		options.push({
			entry, file, settings, overrides, boardContents, fileOptions, pathScope, dailyNoteSource, isInScope,
		});
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
		this.selectedFilePath = defaultFileFor(initialBoard);
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
				this.selectedFilePath = defaultFileFor(board);
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
			options: fileSelectOptionsFor(this.app, this.currentBoard()),
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
			fileSelectOptionsFor(this.app, this.currentBoard()).length === 0;
	}

	private async submit() {
		const content = this.textAreaEl?.value.trim() ?? "";
		if (!content) {
			return;
		}
		const board = this.currentBoard();
		const now = new Date();
		const dailyNotePath = this.selectedFilePath === DAILY_NOTE_TARGET
			? todaysDailyNotePath(board, now)
			: null;
		const targetFile = board.fileOptions.find(
			(file) => file.path === this.selectedFilePath,
		);
		if (!targetFile && !dailyNotePath) {
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
			lastUsedTaskFile: dailyNotePath ? DAILY_NOTE_TARGET : targetFile!.path,
		};

		if (this.submitButtonEl) {
			this.submitButtonEl.disabled = true;
		}
		try {
			const { file, created } = dailyNotePath
				? await createDailyNote(
					this.app.vault,
					dailyNotePath,
					board.dailyNoteSource,
					now,
					(initialContents) => insertNewTask(initialContents, taskLine, board.settings),
				)
				: { file: targetFile!, created: false };
			if (!created) {
				const contents = await this.app.vault.read(file);
				const nextContents = insertNewTask(contents, taskLine, board.settings);
				await this.app.vault.modify(
					file,
					file.path === board.file.path
						? writeKanbanSettingsToViewData(nextContents, nextOverrides, board.pathScope)
						: nextContents,
				);
			}
			if (file.path !== board.file.path) {
				await this.app.vault.modify(
					board.file,
					writeKanbanSettingsToViewData(board.boardContents, nextOverrides, board.pathScope),
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

/** Today's in-scope daily note path for a board, or null. */
function todaysDailyNotePath(board: BoardOption, now = new Date()): string | null {
	const path = resolveDailyNotePath(board.dailyNoteSource, now);
	return path && board.isInScope(path, now) ? path : null;
}

function fileSelectOptionsFor(app: App, board: BoardOption): Array<{ value: string; label: string }> {
	const options = board.fileOptions.map((file) => ({ value: file.path, label: file.path }));
	const dailyNotePath = todaysDailyNotePath(board);
	if (dailyNotePath) {
		const exists = app.vault.getAbstractFileByPath(dailyNotePath) instanceof TFile;
		options.unshift({
			value: DAILY_NOTE_TARGET,
			label: `Today's daily note — ${dailyNotePath}${exists ? "" : " (new)"}`,
		});
	}
	return options;
}

/** The File select's initial value: default, then last used, then the first file. */
function defaultFileFor(board: BoardOption): string {
	const preferredPaths = [
		board.settings.defaultTaskFile,
		board.settings.lastUsedTaskFile,
	].filter((path): path is string => !!path);
	for (const path of preferredPaths) {
		if (path === DAILY_NOTE_TARGET) {
			if (todaysDailyNotePath(board)) return DAILY_NOTE_TARGET;
			continue;
		}
		const resolvedPath = resolveDateTemplate(path);
		const file = board.fileOptions.find((candidate) => candidate.path === resolvedPath);
		if (file) {
			return file.path;
		}
	}
	return board.fileOptions[0]?.path ?? "";
}
