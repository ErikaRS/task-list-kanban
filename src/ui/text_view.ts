import { Notice, TextFileView, WorkspaceLeaf } from "obsidian";

import Main from "./main.svelte";
import { SettingsModal } from "./settings/settings";
import {
	createSettingsStore,
	type BoardSettingsStore,
	type SavedView,
	type SettingValues,
} from "./settings/settings_store";
import { resolveScopeFilter } from "./tasks/scope";
import { get, writable, type Readable, type Writable } from "svelte/store";
import type { BoardIndexEntry } from "./boards/board_index";
import type { TabsSettings } from "./settings/global_settings";
import { createTasksStore } from "./tasks/store";
import type { Task } from "./tasks/task";
import type { TaskActions } from "./tasks/actions";
import {
	parseKanbanSettingsOverridesFromViewData,
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
	private readonly settingsStore: BoardSettingsStore;
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
	private readonly currentPathStore = writable<string | null>(null);

	private readonly tasksStore: Writable<Task[]>;
	private readonly taskActions: TaskActions;
	private readonly initialiseTasksStore: () => void;
	private readonly pendingSelfTaskFileWrites: string[] = [];

	component: Main | undefined;
	icon = "kanban-square";

	constructor(
		leaf: WorkspaceLeaf,
		inheritedSettingsStore?: Readable<Partial<SettingValues>>,
		private readonly globalViewsStore?: Readable<SavedView[]>,
		private readonly boardIndexStore?: Readable<BoardIndexEntry[]>,
		private readonly tabsSettingsStore?: Readable<TabsSettings | undefined>,
		private readonly onReorderTabs?: (orderedPaths: string[]) => void,
	) {
		super(leaf);

		this.settingsStore = createSettingsStore(inheritedSettingsStore);
		this.destroySettingsStore = this.settingsStore.subscribe((settings) => {
			this.boardFolderPath = this.file?.parent?.path ?? null;
			this.filenameFilter = resolveScopeFilter(
				settings.scope,
				settings.scopeFolders,
				this.boardFolderPath,
			);

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
			() => this.requestSave(),
			(fileHandle, nextContent) => this.prepareTaskWriteContent(fileHandle, nextContent)
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

	// In-leaf board switching (SPEC 0032). Setting the view state straight
	// to the kanban type skips the markdown-view detour `openFile` would
	// take; the unload of the current file flushes any pending save first.
	private async openBoard(path: string): Promise<void> {
		if (path === this.file?.path) {
			return;
		}
		await this.leaf.setViewState({
			type: KANBAN_VIEW_NAME,
			state: { file: path },
			active: true,
		});
	}

	getViewType() {
		return KANBAN_VIEW_NAME;
	}

	getViewData(): string {
		return writeKanbanSettingsToViewData(this.data, this.settingsStore.getOverrides());
	}

	getResolvedSettingsSnapshot(): SettingValues {
		return structuredClone(get(this.settingsStore));
	}

	getSettingsOverridesSnapshot(): Partial<SettingValues> {
		return structuredClone(this.settingsStore.getOverrides());
	}

	setViewData(data: string, clear?: boolean): void {
		this.data = data;
		this.currentPathStore.set(this.file?.path ?? null);

		const selfWriteIndex = this.pendingSelfTaskFileWrites.indexOf(data);
		if (selfWriteIndex !== -1) {
			this.pendingSelfTaskFileWrites.splice(selfWriteIndex, 1);
			return;
		}

		this.settingsStore.load(parseKanbanSettingsOverridesFromViewData(data));
		this.initialiseTasksStore();
	}

	private prepareTaskWriteContent(fileHandle: { path: string }, nextContent: string): string {
		if (fileHandle.path !== this.file?.path) {
			return nextContent;
		}

		const preparedContent = writeKanbanSettingsToViewData(nextContent, this.settingsStore.getOverrides());
		this.pendingSelfTaskFileWrites.push(preparedContent);
		return preparedContent;
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
				globalViewsStore: this.globalViewsStore,
				boardIndexStore: this.boardIndexStore,
				tabsSettingsStore: this.tabsSettingsStore,
				currentPathStore: this.currentPathStore,
				openBoard: (path: string) => void this.openBoard(path),
				onReorderTabs: this.onReorderTabs,
				requestSave: () => this.requestSave(),
			},
		});
	}

	async onClose() {
		this.contentEl.removeClass("task-list-kanban-view");
		this.component?.$destroy();
		this.destroySettingsStore();
		this.settingsStore.destroy();
	}
}
