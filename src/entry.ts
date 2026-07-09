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
	rewriteBoardPath,
	type BoardIndex,
} from "./ui/boards/board_index";

export default class Base extends Plugin {
	private readonly globalSettingsStore = createGlobalSettingsStore();
	private readonly inheritedSettingsStore = createInheritedSettingsStore(this.globalSettingsStore);
	private readonly globalViewsStore = derived(
		this.globalSettingsStore,
		(settings) => settings.globalViews ?? [],
	);
	private readonly tabsSettingsStore = derived(
		this.globalSettingsStore,
		(settings) => settings.tabs,
	);
	private boardIndex: BoardIndex | undefined;

	async onload() {
		this.globalSettingsStore.set(parseGlobalSettings(await this.loadData()));
		const boardIndex = createBoardIndex(this.app, this.registerEvent.bind(this));
		this.boardIndex = boardIndex;
		this.registerView(
			KANBAN_VIEW_NAME,
			(leaf) =>
				new KanbanView(
					leaf,
					this.inheritedSettingsStore,
					this.globalViewsStore,
					boardIndex.store,
					this.tabsSettingsStore,
					(orderedPaths) => void this.reorderTabs(orderedPaths),
				),
		);
		this.addSettingTab(
			new GlobalSettingsTab(
				this.app,
				this,
				this.globalSettingsStore,
				boardIndex.store,
				() => this.saveGlobalSettings(),
			),
		);

		// Register hover-link source for internal link previews in task cards
		this.registerHoverLinkSource("kanban-view", {
			display: "Kanban",
			defaultMod: false,
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

		this.switchToKanbanAfterLoad();

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.switchToKanbanAfterLoad();
			})
		);

		// Pinned tab paths follow renames — from the tab menu and the file
		// explorer alike (SPEC 0032).
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				void this.rewritePinnedTabPaths(oldPath, file.path);
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
	}

	private async saveGlobalSettings() {
		await this.saveData(serializeGlobalSettings(this.globalSettingsStore.get()));
	}

	private async rewritePinnedTabPaths(oldPath: string, newPath: string) {
		const tabs = this.globalSettingsStore.get().tabs;
		const boardPaths = tabs?.boardPaths ?? [];
		const unpinnedPaths = tabs?.unpinnedPaths ?? [];
		const rewrittenBoardPaths = boardPaths.map((path) =>
			rewriteBoardPath(path, oldPath, newPath),
		);
		const rewrittenUnpinnedPaths = unpinnedPaths.map((path) =>
			rewriteBoardPath(path, oldPath, newPath),
		);
		if (
			rewrittenBoardPaths.every((path, index) => path === boardPaths[index]) &&
			rewrittenUnpinnedPaths.every((path, index) => path === unpinnedPaths[index])
		) {
			return;
		}
		this.globalSettingsStore.update((settings) => ({
			...settings,
			tabs: {
				...settings.tabs!,
				...(rewrittenBoardPaths.length > 0 ? { boardPaths: rewrittenBoardPaths } : {}),
				...(rewrittenUnpinnedPaths.length > 0
					? { unpinnedPaths: rewrittenUnpinnedPaths }
					: {}),
			},
		}));
		await this.saveGlobalSettings();
	}

	// Tab-strip drag reorder: the shown order, with the dragged tab moved,
	// becomes the explicit tab order. Unpinned state is left untouched.
	private async reorderTabs(orderedPaths: string[]) {
		this.globalSettingsStore.update((settings) => ({
			...settings,
			tabs: {
				...(settings.tabs ?? { enabled: false }),
				boardPaths: orderedPaths,
			},
		}));
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
