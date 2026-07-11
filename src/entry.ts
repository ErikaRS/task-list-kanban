import { MarkdownView, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { derived } from "svelte/store";
import { KANBAN_VIEW_NAME, KanbanView } from "./ui/text_view";
import {
	createGlobalSettingsStore,
	createInheritedSettingsStore,
	parseGlobalSettings,
	pickBoardDefaultSettings,
	serializeGlobalSettings,
} from "./ui/settings/global_settings";
import { GlobalSettingsTab } from "./ui/settings/global_settings_tab";
import {
	createBoardIndex,
	rewriteBoardListPaths,
	type BoardIndex,
} from "./ui/boards/board_index";
import {
	createBoardStatsService,
	type BoardStatsService,
} from "./ui/dashboard/board_stats";
import { toSettingsPayload } from "./ui/kanban_frontmatter";

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
				menu.addItem((item) => {
					item.setTitle("New kanban")
						.setIcon("square-kanban")
						.onClick(async () => {
							const newFile = await this.app.vault.create(
								file.path + "/Kanban-" + Date.now() + ".md",
								`---\nkanban_plugin: {}\n---\n`
							);
							this.app.workspace
								.getActiveViewOfType(MarkdownView)
								?.leaf.openFile(newFile);
						});
				});
			})
		);
	}

	onunload() {
		this.boardIndex?.destroy();
		this.boardStats?.destroy();
	}

	private async saveGlobalSettings() {
		await this.saveData(serializeGlobalSettings(this.globalSettingsStore.get()));
	}

	private async rewriteBoardListSettingsPaths(oldPath: string, newPath: string) {
		const rewritten = rewriteBoardListPaths(
			this.globalSettingsStore.get().boardList,
			oldPath,
			newPath,
		);
		if (!rewritten) {
			return;
		}
		this.globalSettingsStore.update((settings) => ({
			...settings,
			boardList: rewritten,
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
