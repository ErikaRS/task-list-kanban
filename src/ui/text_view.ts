import { Notice, TextFileView, WorkspaceLeaf } from "obsidian";

import Main from "./main.svelte";
import { SettingsModal } from "./settings/settings";
import {
	createSettingsStore,
	ScopeOption,
	type SettingValues,
} from "./settings/settings_store";
import { get, type Readable, type Writable } from "svelte/store";
import { createTasksStore } from "./tasks/store";
import type { Task } from "./tasks/task";
import type { TaskActions } from "./tasks/actions";
import {
	parseKanbanSettingsFromViewData,
	writeKanbanSettingsToViewData,
} from "./kanban_frontmatter";
import {
	createColumnStores,
	type ColumnDefinition,
	type ColumnTagTable,
	type ColumnColourTable,
	type ColumnPlacementTagTable,
	type ColumnMatchTagTable,
	type ColumnSubtitleTable,
} from "./columns/columns";
import { applyChangedColumnTagUpdates } from "./settings/column_rename_migration";

export const KANBAN_VIEW_NAME = "kanban-view";

export class KanbanView extends TextFileView {
	private readonly settingsStore: Writable<SettingValues>;
	private readonly destroySettingsStore: () => void;

	private readonly columnDefinitionsStore: Readable<ColumnDefinition[]>;
	private readonly columnTagTableStore: Readable<ColumnTagTable>;
	private readonly columnColourTableStore: Readable<ColumnColourTable>;
	private readonly columnPlacementTagTableStore: Readable<ColumnPlacementTagTable>;
	private readonly columnMatchTagTableStore: Readable<ColumnMatchTagTable>;
	private readonly columnSubtitleTableStore: Readable<ColumnSubtitleTable>;

	private filenameFilter: string[] | null = null;
	private excludeFilter: string[] | null = null;
	private boardFolderPath: string | null = null;

	private readonly tasksStore: Writable<Task[]>;
	private readonly taskActions: TaskActions;
	private readonly initialiseTasksStore: () => void;

	component: Main | undefined;
	icon = "kanban-square";

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);

		this.settingsStore = createSettingsStore();
		this.destroySettingsStore = this.settingsStore.subscribe((settings) => {
			this.boardFolderPath = this.file?.parent?.path ?? null;

			switch (settings.scope) {
				case ScopeOption.Everywhere:
					this.filenameFilter = null;
					break;
				case ScopeOption.Folder: {
					this.filenameFilter = this.boardFolderPath !== null ? [this.boardFolderPath] : null;
					break;
				}
				case ScopeOption.SelectedFolders: {
					const selected = settings.scopeFolders ?? [];
					this.filenameFilter = this.boardFolderPath !== null
						? [this.boardFolderPath, ...selected.filter((f) => f !== this.boardFolderPath)]
						: selected;
					break;
				}
				default:
					this.filenameFilter = null;
					break;
			}

			const excludePaths = settings.excludePaths ?? [];
			this.excludeFilter = excludePaths.length > 0 ? excludePaths : null;
		});

		const {
			columnDefinitions,
			columnTagTable,
			columnColourTable,
			columnPlacementTagTable,
			columnMatchTagTable,
			columnSubtitleTable,
		} = createColumnStores(
			this.settingsStore
		);
		this.columnDefinitionsStore = columnDefinitions;
		this.columnTagTableStore = columnTagTable;
		this.columnColourTableStore = columnColourTable;
		this.columnPlacementTagTableStore = columnPlacementTagTable;
		this.columnMatchTagTableStore = columnMatchTagTable;
		this.columnSubtitleTableStore = columnSubtitleTable;

		const { tasksStore, taskActions, initialise } = createTasksStore(
			this.app.vault,
			this.app.workspace,
			this.registerEvent.bind(this),
			this.columnDefinitionsStore,
			this.columnPlacementTagTableStore,
			() => this.filenameFilter,
			() => this.excludeFilter,
			() => this.boardFolderPath,
			this.settingsStore,
			() => this.requestSave()
		);

		this.tasksStore = tasksStore;
		this.taskActions = taskActions;
		this.initialiseTasksStore = initialise;
	}

	private async onLocalSettingsChange(
		newSettings: SettingValues,
		options: { updateExistingTaskTagsByColumnId: Record<string, boolean> },
	) {
		const previousSettings = structuredClone(get(this.settingsStore));
		try {
			await applyChangedColumnTagUpdates({
				vault: this.app.vault,
				oldSettings: previousSettings,
				newSettings,
				boardFolderPath: this.file?.parent?.path ?? null,
				updateChoices: options.updateExistingTaskTagsByColumnId,
			});
		} catch (error) {
			console.error("Failed to update changed column task tags", error);
			new Notice("Failed to update existing task tags for changed columns.");
			return;
		}

		this.settingsStore.set(newSettings);
		this.initialiseTasksStore();
		this.requestSave();
	}

	private openSettingsModal(): Promise<void> {
		const settingsModal = new SettingsModal(
			this.app,
			structuredClone(get(this.settingsStore)),
			(newSettings, options) => this.onLocalSettingsChange(newSettings, options),
			this.file?.parent?.path ?? null
		);

		settingsModal.open();
		return new Promise((resolve) => {
			settingsModal.onClose = () => {
				resolve();
				settingsModal.onClose = () => undefined;
			};
		});
	}

	getViewType() {
		this.leaf.openFile;
		return KANBAN_VIEW_NAME;
	}

	getViewData(): string {
		return writeKanbanSettingsToViewData(this.data, get(this.settingsStore));
	}

	setViewData(data: string, clear?: boolean): void {
		this.data = data;
		this.settingsStore.set(this.getInitialSettings(data));
		this.initialiseTasksStore();
	}

	private getInitialSettings(data: string): SettingValues {
		return parseKanbanSettingsFromViewData(data);
	}

	clear(): void {
		// TODO
	}

	async onOpen() {
		this.contentEl.addClass("task-list-kanban-view");
		this.component = new Main({
			target: this.contentEl,
			props: {
				app: this.app,
				tasksStore: this.tasksStore,
				taskActions: this.taskActions,
				columnTagTableStore: this.columnTagTableStore,
				columnColourTableStore: this.columnColourTableStore,
				columnMatchTagTableStore: this.columnMatchTagTableStore,
				columnSubtitleTableStore: this.columnSubtitleTableStore,
				openSettings: () => this.openSettingsModal(),
				settingsStore: this.settingsStore,
				requestSave: () => this.requestSave(),
			},
		});
	}

	async onClose() {
		this.contentEl.removeClass("task-list-kanban-view");
		this.component?.$destroy();
		this.destroySettingsStore();
	}
}
