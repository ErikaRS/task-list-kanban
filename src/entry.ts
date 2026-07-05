import { MarkdownView, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { KANBAN_VIEW_NAME, KanbanView } from "./ui/text_view";
import {
	createGlobalSettingsStore,
	createInheritedSettingsStore,
	parseGlobalSettings,
	pickBoardDefaultSettings,
	serializeGlobalSettings,
} from "./ui/settings/global_settings";
import { GlobalSettingsTab } from "./ui/settings/global_settings_tab";

export default class Base extends Plugin {
	private readonly globalSettingsStore = createGlobalSettingsStore();
	private readonly inheritedSettingsStore = createInheritedSettingsStore(this.globalSettingsStore);

	async onload() {
		this.globalSettingsStore.set(parseGlobalSettings(await this.loadData()));
		this.registerView(KANBAN_VIEW_NAME, (leaf) => new KanbanView(leaf, this.inheritedSettingsStore));
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

	onunload() {}

	private async saveGlobalSettings() {
		await this.saveData(serializeGlobalSettings(this.globalSettingsStore.get()));
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
