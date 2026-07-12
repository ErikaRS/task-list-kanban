import { MarkdownView, Notice, Plugin, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import { derived, get } from "svelte/store";
import { KANBAN_VIEW_NAME, KanbanView } from "./ui/text_view";
import {
	createGlobalSettingsStore,
	createInheritedSettingsStore,
	parseGlobalSettings,
	pickBoardDefaultSettings,
	removeBoardPathFromGlobalSettings,
	serializeGlobalSettings,
} from "./ui/settings/global_settings";
import { GlobalSettingsTab } from "./ui/settings/global_settings_tab";
import {
	createBoardIndex,
	rewriteBoardListPaths,
	rewriteLastOpenedPaths,
	type BoardIndex,
} from "./ui/boards/board_index";
import {
	createBoardStatsService,
	type BoardStatsService,
} from "./ui/dashboard/board_stats";
import { toSettingsPayload } from "./ui/kanban_frontmatter";
import {
	BoardFolderPickerModal,
	createBoardWithNotice,
	createKanbanBoardInFolder,
	getDefaultFolderForActiveFile,
	getDefaultFolderForCurrentBoard,
} from "./ui/boards/board_creation";
import { trashBoardFile } from "./ui/boards/board_deletion";

export default class Base extends Plugin {
	private readonly globalSettingsStore = createGlobalSettingsStore();
	private readonly inheritedSettingsStore = createInheritedSettingsStore(this.globalSettingsStore);
	private readonly globalViewsStore = derived(
		this.globalSettingsStore,
		(settings) => settings.globalViews ?? [],
	);
	private readonly boardListSettingsStore = derived(
		this.globalSettingsStore,
		(settings) => settings.boardList,
	);
	private readonly lastOpenedStore = derived(
		this.globalSettingsStore,
		(settings) => settings.lastOpenedByPath ?? {},
	);
	private readonly boardRailSettingsStore = derived(
		this.globalSettingsStore,
		(settings) => settings.boardRail,
	);
	private boardIndex: BoardIndex | undefined;
	private boardStats: BoardStatsService | undefined;

	async onload() {
		this.globalSettingsStore.set(parseGlobalSettings(await this.loadData()));
		const boardIndex = createBoardIndex(this.app, this.registerEvent.bind(this));
		this.boardIndex = boardIndex;
		// Plugin-level so the count cache survives panel close/reopen; only
		// panel requests trigger computes (SPEC 0033 Phase 3).
		const boardStats = createBoardStatsService({
			getMarkdownFiles: () => this.app.vault.getMarkdownFiles(),
			cachedRead: (file) => this.app.vault.cachedRead(file),
			getBoardSettingsPayload: (file) =>
				toSettingsPayload(
					this.app.metadataCache.getFileCache(file)?.frontmatter?.[
						"kanban_plugin"
					],
				),
			getGlobalSettings: () => this.globalSettingsStore.get(),
		});
		this.boardStats = boardStats;
		this.registerView(
			KANBAN_VIEW_NAME,
			(leaf) =>
				new KanbanView(
					leaf,
					this.inheritedSettingsStore,
					this.globalViewsStore,
					boardIndex.store,
					this.boardListSettingsStore,
					(path, hidden) => void this.setBoardHidden(path, hidden),
					(orderedPaths) => void this.reorderBoards(orderedPaths),
					boardStats.countsStore,
					(paths) => boardStats.requestCounts(paths),
					this.lastOpenedStore,
					(path) => void this.recordBoardOpened(path),
					this.boardRailSettingsStore,
					(width) => void this.setBoardRailWidth(width),
					(view) => this.createBoardFromDashboard(view),
					(path) => this.deleteBoardFromDashboard(path),
				),
		);
		this.addSettingTab(
			new GlobalSettingsTab(
				this.app,
				this,
				this.globalSettingsStore,
				() => this.saveGlobalSettings(),
			),
		);

		// Register hover-link source for internal link previews in task cards
		this.registerHoverLinkSource("kanban-view", {
			display: "Kanban",
			defaultMod: false,
		});

		// The dashboard is a slide-over inside the kanban view (SPEC 0033),
		// so the command only applies while one is focused.
		this.addCommand({
			id: "create-new-kanban-board",
			name: "Create new kanban board",
			callback: () => {
				void this.createBoardFromGlobalSurface();
			},
		});

		this.addRibbonIcon("square-kanban", "New Kanban board", () => {
			void this.createBoardFromGlobalSurface();
		});

		this.addCommand({
			id: "show-board-dashboard",
			name: "Show board dashboard",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(KanbanView);
				if (!view) {
					return false;
				}
				if (!checking) {
					view.toggleDashboard();
				}
				return true;
			},
		});

		this.addCommand({
			id: "use-current-board-settings-as-global-defaults",
			name: "Use current board settings as global defaults",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(KanbanView);
				if (!view) {
					return false;
				}
				if (!checking) {
					void this.useCurrentBoardSettingsAsGlobalDefaults(view);
				}
				return true;
			},
		});

		this.addCommand({
			id: "prune-board-settings-matching-defaults",
			name: "Prune board settings that match the defaults",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(KanbanView);
				if (!view) {
					return false;
				}
				if (!checking) {
					view.pruneSettingsMatchingDefaults();
				}
				return true;
			},
		});

		this.addCommand({
			id: "open-current-board-settings",
			name: "Open current board settings",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(KanbanView);
				if (!view) {
					return false;
				}
				if (!checking) {
					view.openCurrentBoardSettings();
				}
				return true;
			},
		});

		this.addCommand({
			id: "add-card-to-focused-column",
			name: "Add card to focused column",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(KanbanView);
				if (!view || !view.canAddCardToFocusedColumn()) {
					return false;
				}
				if (!checking) {
					view.addCardToFocusedColumn();
				}
				return true;
			},
		});

		this.addSelectedCardsCommand("mark-selected-cards-done", "Mark selected cards as done", (view) =>
			view.markSelectedCardsDone(),
		);
		this.addSelectedCardsCommand("archive-selected-cards", "Archive selected cards", (view) =>
			view.archiveSelectedCards(),
		);
		this.addSelectedCardsCommand("cancel-selected-cards", "Cancel selected cards", (view) =>
			view.cancelSelectedCards(),
		);
		this.addSelectedCardsCommand("duplicate-selected-cards", "Duplicate selected cards", (view) =>
			view.duplicateSelectedCards(),
		);
		this.addSelectedCardsCommand("delete-selected-cards", "Delete selected cards", (view) =>
			view.deleteSelectedCards(),
		);

		this.switchToKanbanAfterLoad();

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.switchToKanbanAfterLoad();
			})
		);

		// Curated board-list paths follow renames — from the dashboard's card
		// menu and the file explorer alike (SPEC 0032/0033).
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				void this.rewriteBoardListSettingsPaths(oldPath, file.path);
			})
		);

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFolder)) {
					return;
				}
				menu.addItem((item) => {
					item.setTitle("New kanban")
						.setIcon("square-kanban")
						.onClick(async () => {
							const newFile = await createBoardWithNotice(
								this.app.vault,
								file.path,
							);
							if (newFile) {
								await this.openCreatedBoard(newFile);
							}
						});
				});
			})
		);
	}

	onunload() {
		this.boardIndex?.destroy();
		this.boardStats?.destroy();
	}

	private addSelectedCardsCommand(
		id: string,
		name: string,
		run: (view: KanbanView) => void,
	) {
		this.addCommand({
			id,
			name,
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(KanbanView);
				if (!view || !view.hasVisibleSelectedCards()) {
					return false;
				}
				if (!checking) {
					run(view);
				}
				return true;
			},
		});
	}

	private async saveGlobalSettings() {
		await this.saveData(serializeGlobalSettings(this.globalSettingsStore.get()));
	}

	private async rewriteBoardListSettingsPaths(oldPath: string, newPath: string) {
		const current = this.globalSettingsStore.get();
		const rewrittenBoardList = rewriteBoardListPaths(
			current.boardList,
			oldPath,
			newPath,
		);
		const rewrittenLastOpened = rewriteLastOpenedPaths(
			current.lastOpenedByPath,
			oldPath,
			newPath,
		);
		if (!rewrittenBoardList && !rewrittenLastOpened) {
			return;
		}
		this.globalSettingsStore.update((settings) => ({
			...settings,
			...(rewrittenBoardList ? { boardList: rewrittenBoardList } : {}),
			...(rewrittenLastOpened ? { lastOpenedByPath: rewrittenLastOpened } : {}),
		}));
		await this.saveGlobalSettings();
	}

	// Stamped whenever a kanban view loads a board (SPEC 0033 Phase 3c) —
	// neither the filesystem nor Obsidian tracks access times, so the plugin
	// records its own. Entries for since-deleted files are shed on the same
	// write, keeping data.json from accreting ghosts.
	private async recordBoardOpened(path: string) {
		this.globalSettingsStore.update((settings) => {
			const lastOpenedByPath: Record<string, number> = {};
			for (const [boardPath, openedAt] of Object.entries(
				settings.lastOpenedByPath ?? {},
			)) {
				if (this.app.vault.getAbstractFileByPath(boardPath)) {
					lastOpenedByPath[boardPath] = openedAt;
				}
			}
			lastOpenedByPath[path] = Date.now();
			return { ...settings, lastOpenedByPath };
		});
		await this.saveGlobalSettings();
	}

	// Board rail resize (SPEC 0034): persisted on drag release, plugin-wide
	// like the rest of data.json. serializeGlobalSettings clamps the width
	// and sheds the key when everything is back at the defaults. Merged so
	// the width write never clobbers the dock setting.
	private async setBoardRailWidth(width: number) {
		this.globalSettingsStore.update((settings) => ({
			...settings,
			boardRail: { ...settings.boardRail, width },
		}));
		await this.saveGlobalSettings();
	}

	// Dashboard card drag reorder: the shown order, with the dragged card
	// moved, becomes the explicit board order. Unpinned state is left
	// untouched, and stale paths fall out (the shown list only contains
	// discovered boards).
	private async reorderBoards(orderedPaths: string[]) {
		this.globalSettingsStore.update((settings) => ({
			...settings,
			boardList: {
				...settings.boardList,
				boardPaths: orderedPaths,
			},
		}));
		await this.saveGlobalSettings();
	}

	// The dashboard card menu's "Hide board" / "Show board": hidden boards
	// move under the panel's "Other boards" zippy. Explicit order is left
	// untouched, so hiding and re-showing an ordered board restores its slot.
	private async setBoardHidden(path: string, hidden: boolean) {
		this.globalSettingsStore.update((settings) => {
			const unpinnedPaths = (settings.boardList?.unpinnedPaths ?? []).filter(
				(candidate) => candidate !== path,
			);
			if (hidden) {
				unpinnedPaths.push(path);
			}
			return {
				...settings,
				boardList: {
					...settings.boardList,
					...(unpinnedPaths.length > 0
						? { unpinnedPaths }
						: { unpinnedPaths: undefined }),
				},
			};
		});
		await this.saveGlobalSettings();
	}

	private async useCurrentBoardSettingsAsGlobalDefaults(view: KanbanView) {
		this.globalSettingsStore.update((settings) => ({
			...settings,
			boardDefaults: pickBoardDefaultSettings(view.getResolvedSettingsSnapshot()),
		}));
		await this.saveGlobalSettings();
		new Notice("Task List Kanban global board defaults updated.");
	}

	private async createBoardFromDashboard(view: KanbanView): Promise<boolean> {
		const defaultFolderPath = getDefaultFolderForCurrentBoard(view.file?.path ?? null);
		const newFile = await this.pickAndCreateBoard(defaultFolderPath);
		if (!newFile) {
			return false;
		}
		await view.openBoard(newFile.path);
		return true;
	}

	private async createBoardFromGlobalSurface(): Promise<void> {
		const defaultFolderPath = getDefaultFolderForActiveFile(
			this.app.workspace.getActiveFile()?.path ?? null,
		);
		const newFile = await this.pickAndCreateBoard(defaultFolderPath);
		if (newFile) {
			await this.openCreatedBoard(newFile);
		}
	}

	private pickAndCreateBoard(defaultFolderPath: string): Promise<TFile | null> {
		return new Promise((resolve) => {
			let resolved = false;
			let creationStarted = false;
			const resolveOnce = (file: TFile | null) => {
				if (!resolved) {
					resolved = true;
					resolve(file);
				}
			};
			const modal = new BoardFolderPickerModal(
				this.app,
				defaultFolderPath,
				(folder) => {
					creationStarted = true;
					void (async () => {
						try {
							const newFile = await createKanbanBoardInFolder(
								this.app.vault,
								folder.path,
							);
							resolveOnce(newFile);
						} catch (error) {
							console.error("Failed to create kanban board", error);
							new Notice("Failed to create kanban board.");
							resolveOnce(null);
						}
					})();
				},
			);
			const originalOnClose = modal.onClose.bind(modal);
			modal.onClose = () => {
				originalOnClose();
				if (!creationStarted) {
					resolveOnce(null);
				}
			};
			modal.open();
		});
	}

	private async openCreatedBoard(file: TFile): Promise<void> {
		const kanbanView = this.app.workspace.getActiveViewOfType(KanbanView);
		if (kanbanView) {
			await kanbanView.openBoard(file.path);
			return;
		}
		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (markdownView) {
			await markdownView.leaf.openFile(file);
			return;
		}
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	private async deleteBoardFromDashboard(path: string): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice("Board file not found.");
			return false;
		}

		const activeKanbanView = this.app.workspace.getActiveViewOfType(KanbanView);
		const fallbackBoardPath = this.boardIndex
			? get(this.boardIndex.store).find((board) => board.path !== path)?.path
			: undefined;
		const result = await trashBoardFile(this.app, path);
		if (!result.ok) {
			if (result.reason === "failed") {
				console.error("Failed to delete board", result.error);
			}
			new Notice("Failed to delete board.");
			return false;
		}
		this.globalSettingsStore.set(
			removeBoardPathFromGlobalSettings(this.globalSettingsStore.get(), path),
		);
		await this.saveGlobalSettings();
		if (activeKanbanView?.file?.path === path && fallbackBoardPath) {
			await activeKanbanView.openBoard(fallbackBoardPath);
		}
		return true;
	}

	private switchToKanbanAfterLoad() {
		this.app.workspace.onLayoutReady(() => {
			let leaf: WorkspaceLeaf;
			for (leaf of this.app.workspace.getLeavesOfType("markdown")) {
				if (
					leaf.view instanceof MarkdownView &&
					this.isKanbanFile(leaf.view.file)
				) {
					this.setKanbanView(leaf);
				}
			}
		});
	}

	private isKanbanFile(file: TFile | null): boolean {
		if (!file) {
			return false;
		}

		const fileCache = this.app.metadataCache.getFileCache(file);
		return (
			!!fileCache?.frontmatter && !!fileCache.frontmatter["kanban_plugin"]
		);
	}

	private async setKanbanView(leaf: WorkspaceLeaf) {
		await leaf.setViewState({
			type: KANBAN_VIEW_NAME,
			state: leaf.view.getState(),
		});
	}
}
