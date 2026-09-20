import { Notice, TextFileView, WorkspaceLeaf, type TFile } from "obsidian";
import { mount, unmount } from "svelte";

import Main from "./main.svelte";
import { SettingsModal, type SettingsSubmitOptions } from "./settings/settings";
import {
	createSettingsStore,
	ScopeOption,
	type BoardSettingsStore,
	type SavedView,
	type SettingValues,
} from "./settings/settings_store";
import { getProtectedBoardFolderPath, resolveScopeFilter } from "./tasks/scope";
import { get, writable, type Readable, type Writable } from "svelte/store";
import type { BoardIndexEntry } from "./boards/board_index";
import type { BoardListSettings, BoardRailSettings } from "./settings/global_settings";
import type { BoardTaskCounts } from "./dashboard/board_stats";
import { createTasksStore } from "./tasks/store";
import type { Task } from "./tasks/task";
import type { TaskActions } from "./tasks/actions";
import {
	parseKanbanPathScopeFromViewData,
	parseKanbanSettingsOverridesFromViewData,
	writeKanbanSettingsToViewData,
} from "./kanban_frontmatter";
import {
	pathScopeHasDateTemplate,
	setPathScopeActive,
	type PathScopeV2,
} from "./tasks/path_scope";
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

type MainComponent = Main & {
	openCurrentBoardSettings: () => Promise<boolean>;
	hasVisibleSelectedCards: () => boolean;
	markSelectedCardsDone: () => Promise<boolean>;
	archiveSelectedCards: () => Promise<boolean>;
	cancelSelectedCards: () => Promise<boolean>;
	duplicateSelectedCards: () => Promise<boolean>;
	deleteSelectedCardsCommand: () => Promise<boolean>;
};

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
	private scopeBoardFolderPath: string | null = null;
	private pathScope: PathScopeV2 | undefined;
	private scopeRefreshTimer: number | undefined;
	private readonly currentPathStore = writable<string | null>(null);
	// Transient by design (SPEC 0033): the dashboard never reopens itself
	// after a reload or board switch.
	private readonly dashboardOpenStore = writable(false);

	private readonly tasksStore: Writable<Task[]>;
	private readonly taskActions: TaskActions;
	private readonly initialiseTasksStore: () => void;
	private readonly pendingSelfTaskFileWrites: string[] = [];

	component: MainComponent | undefined;
	icon = "kanban-square";

	constructor(
		leaf: WorkspaceLeaf,
		inheritedSettingsStore?: Readable<Partial<SettingValues>>,
		private readonly globalViewsStore?: Readable<SavedView[]>,
		private readonly boardIndexStore?: Readable<BoardIndexEntry[]>,
		private readonly boardListSettingsStore?: Readable<BoardListSettings | undefined>,
		private readonly onSetBoardHidden?: (path: string, hidden: boolean) => void,
		private readonly onReorderBoards?: (orderedPaths: string[]) => void,
		private readonly boardCountsStore?: Readable<ReadonlyMap<string, BoardTaskCounts>>,
		private readonly onRequestBoardCounts?: (paths: string[]) => void,
		private readonly lastOpenedStore?: Readable<Record<string, number>>,
		private readonly onBoardOpened?: (path: string) => void,
		private readonly boardRailSettingsStore?: Readable<BoardRailSettings | undefined>,
		private readonly onSetRailWidth?: (width: number) => void,
		private readonly onCreateBoardFromDashboard?: (view: KanbanView) => Promise<boolean>,
		private readonly onDeleteBoardFromDashboard?: (path: string) => Promise<boolean>,
	) {
		super(leaf);

		this.settingsStore = createSettingsStore(inheritedSettingsStore);
		this.destroySettingsStore = this.settingsStore.subscribe((settings) => {
			this.updateScopeFilters(settings);
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
			() => this.scopeBoardFolderPath,
			this.settingsStore,
			() => this.requestSave(),
			(fileHandle, nextContent) => this.prepareTaskWriteContent(fileHandle, nextContent)
		);

		this.tasksStore = tasksStore;
		this.taskActions = taskActions;
		this.initialiseTasksStore = initialise;
	}

	private updateScopeFilters(settings: SettingValues) {
		this.boardFolderPath = this.file?.parent?.path ?? null;
		this.filenameFilter = resolveScopeFilter(
			settings.scope,
			settings.scopeFolders,
			this.boardFolderPath,
			this.pathScope,
		);
		this.scopeBoardFolderPath = getProtectedBoardFolderPath(
			settings.scope,
			this.boardFolderPath,
		);

		const excludePaths = settings.excludePaths ?? [];
		this.excludeFilter = excludePaths.length > 0 ? excludePaths : null;
	}

	private async onLocalSettingsChange(
		newSettings: SettingValues,
		options: SettingsSubmitOptions,
		pathScope?: PathScopeV2,
	) {
		const previousSettings = structuredClone(get(this.settingsStore));
		try {
			await applyChangedColumnTagUpdates({
				vault: this.app.vault,
				oldSettings: previousSettings,
				newSettings,
				boardFolderPath: this.file?.parent?.path ?? null,
				pathScope,
				updateChoices: options.updateExistingTaskTagsByColumnId,
			});
		} catch (error) {
			console.error("Failed to update changed column task tags", error);
			new Notice("Failed to update existing task tags for changed columns.");
			return;
		}

		if (newSettings.scope === ScopeOption.SelectedPaths) {
			this.pathScope = pathScope
				? setPathScopeActive(pathScope, true, "selectedFolders", pathScope.paths) ?? pathScope
				: undefined;
		} else if (pathScope) {
			this.pathScope = setPathScopeActive(
				pathScope,
				false,
				newSettings.scope,
				newSettings.scopeFolders ?? [],
			) ?? undefined;
		} else {
			this.pathScope = undefined;
		}
		this.settingsStore.set(newSettings);
		// Pin/reset decisions from the modal come after the value write:
		// set() only records overrides for value-*changing* writes, so
		// pinning at the inherited value and shedding an override both need
		// the explicit lifecycle calls.
		if (options.pinnedSettingKeys.length > 0) {
			this.settingsStore.pinOverrides(options.pinnedSettingKeys);
		}
		if (options.clearedSettingKeys.length > 0) {
			this.settingsStore.clearOverrides(options.clearedSettingKeys);
		}
		this.initialiseTasksStore();
		this.scheduleScopeRefresh();
		this.requestSave();
	}

	private openSettingsModal(): Promise<void> {
		const settingsModal = new SettingsModal(
			this.app,
			structuredClone(get(this.settingsStore)),
			(newSettings, options, pathScope) => this.onLocalSettingsChange(newSettings, options, pathScope),
			this.file?.parent?.path ?? null,
			{
				overrideContext: {
					overriddenKeys: Object.keys(
						this.settingsStore.getOverrides(),
					) as (keyof SettingValues)[],
					baseSettings: this.settingsStore.getBaseSettings(),
				},
			},
			this.pathScope,
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
	async openBoard(path: string): Promise<void> {
		if (path === this.file?.path) {
			return;
		}
		await this.leaf.setViewState({
			type: KANBAN_VIEW_NAME,
			state: { file: path },
			active: true,
		});
	}

	// The "Show board dashboard" command's entry point; the button in the
	// board chrome flips the same store.
	toggleDashboard(): void {
		this.dashboardOpenStore.update((open) => !open);
	}

	openCurrentBoardSettings(): void {
		void this.component?.openCurrentBoardSettings();
	}

	hasVisibleSelectedCards(): boolean {
		return this.component?.hasVisibleSelectedCards() ?? false;
	}

	markSelectedCardsDone(): void {
		void this.component?.markSelectedCardsDone();
	}

	archiveSelectedCards(): void {
		void this.component?.archiveSelectedCards();
	}

	cancelSelectedCards(): void {
		void this.component?.cancelSelectedCards();
	}

	duplicateSelectedCards(): void {
		void this.component?.duplicateSelectedCards();
	}

	deleteSelectedCards(): void {
		void this.component?.deleteSelectedCardsCommand();
	}

	getViewType() {
		return KANBAN_VIEW_NAME;
	}

	getViewData(): string {
		return writeKanbanSettingsToViewData(this.data, this.settingsStore.getOverrides(), this.pathScope);
	}

	getResolvedSettingsSnapshot(): SettingValues {
		return structuredClone(get(this.settingsStore));
	}

	getSettingsOverridesSnapshot(): Partial<SettingValues> {
		return structuredClone(this.settingsStore.getOverrides());
	}

	// The escape hatch for legacy fully-materialized boards (SPEC 0030
	// Part A): sheds every override that matches what the board would
	// inherit anyway, so those fields start following the defaults again.
	pruneSettingsMatchingDefaults(): void {
		const prunedKeys = this.settingsStore.pruneOverridesMatchingDefaults();
		if (prunedKeys.length === 0) {
			new Notice("No board settings match the defaults.");
			return;
		}
		this.requestSave();
		new Notice(
			`Pruned ${prunedKeys.length} board setting${prunedKeys.length === 1 ? "" : "s"} matching the defaults.`,
		);
	}

	// Fires once per file this view loads (initial open and in-leaf board
	// switches alike) — unlike setViewData, never on external edits — so it
	// is the "board opened" moment for the dashboard's last-opened stamps
	// (SPEC 0033 Phase 3c).
	async onLoadFile(file: TFile): Promise<void> {
		await super.onLoadFile(file);
		this.onBoardOpened?.(file.path);
	}

	// Renaming the open board keeps this view; only the path store needs to
	// follow so the active tab highlight does too.
	async onRename(file: TFile): Promise<void> {
		await super.onRename(file);
		this.currentPathStore.set(file.path);
	}

	setViewData(data: string, clear?: boolean): void {
		this.data = data;
		this.currentPathStore.set(this.file?.path ?? null);

		const selfWriteIndex = this.pendingSelfTaskFileWrites.indexOf(data);
		if (selfWriteIndex !== -1) {
			this.pendingSelfTaskFileWrites.splice(selfWriteIndex, 1);
			return;
		}

		this.pathScope = parseKanbanPathScopeFromViewData(data);
		const overrides = parseKanbanSettingsOverridesFromViewData(data);
		if (this.pathScope?.active) {
			overrides.scope = ScopeOption.SelectedPaths;
		}
		this.settingsStore.load(overrides);
		this.initialiseTasksStore();
		this.scheduleScopeRefresh();
	}

	private prepareTaskWriteContent(fileHandle: { path: string }, nextContent: string): string {
		if (fileHandle.path !== this.file?.path) {
			return nextContent;
		}

		const preparedContent = writeKanbanSettingsToViewData(nextContent, this.settingsStore.getOverrides(), this.pathScope);
		this.pendingSelfTaskFileWrites.push(preparedContent);
		return preparedContent;
	}

	private scheduleScopeRefresh() {
		if (this.scopeRefreshTimer !== undefined) {
			window.clearTimeout(this.scopeRefreshTimer);
			this.scopeRefreshTimer = undefined;
		}
		if (!pathScopeHasDateTemplate(this.pathScope)) return;
		const now = new Date();
		const nextMidnight = new Date(now);
		nextMidnight.setHours(24, 0, 1, 0);
		this.scopeRefreshTimer = window.setTimeout(() => {
			this.scopeRefreshTimer = undefined;
			this.updateScopeFilters(get(this.settingsStore));
			this.initialiseTasksStore();
			this.scheduleScopeRefresh();
		}, Math.max(1_000, nextMidnight.getTime() - now.getTime()));
	}

	clear(): void {
		// TODO
	}

	async onOpen() {
		this.contentEl.addClass("task-list-kanban-view");
		this.component = mount(Main, {
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
				boardListSettingsStore: this.boardListSettingsStore,
				currentPathStore: this.currentPathStore,
				dashboardOpenStore: this.dashboardOpenStore,
				openBoard: (path: string) => void this.openBoard(path),
				onSetBoardHidden: this.onSetBoardHidden,
				onReorderBoards: this.onReorderBoards,
				boardCountsStore: this.boardCountsStore,
				onRequestBoardCounts: this.onRequestBoardCounts,
				lastOpenedStore: this.lastOpenedStore,
				boardRailSettingsStore: this.boardRailSettingsStore,
				onSetRailWidth: this.onSetRailWidth,
				onCreateBoard: () => this.onCreateBoardFromDashboard?.(this) ?? false,
				onDeleteBoard: (path: string) =>
					this.onDeleteBoardFromDashboard?.(path) ?? false,
				requestSave: () => this.requestSave(),
			},
		}) as MainComponent;
	}

	async onClose() {
		if (this.scopeRefreshTimer !== undefined) {
			window.clearTimeout(this.scopeRefreshTimer);
		}
		this.contentEl.removeClass("task-list-kanban-view");
		if (this.component) {
			void unmount(this.component);
		}
		this.destroySettingsStore();
		this.settingsStore.destroy();
	}
}
