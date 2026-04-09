import { Notice, TextFileView, WorkspaceLeaf } from "obsidian";
import matter from "front-matter";

import Main from "./main.svelte";
import { SettingsModal } from "./settings/settings";
import {
	createSettingsStore,
	parseSettingsString,
	toSettingsString,
	ScopeOption,
	type SettingValues,
} from "./settings/settings_store";
import { get, writable, type Readable, type Writable } from "svelte/store";
import { createTasksStore } from "./tasks/store";
import type { Task } from "./tasks/task";
import type { TaskActions } from "./tasks/actions";
import type { ManualOrderStore } from "./tasks/manual_order";
import {
	createColumnStores,
	type ColumnDefinition,
	type ColumnTagTable,
	type ColumnColourTable,
	type ColumnPlacementTagTable,
	type ColumnMatchTagTable,
} from "./columns/columns";
import { applyChangedColumnTagUpdates } from "./settings/column_rename_migration";

export const KANBAN_VIEW_NAME = "kanban-view";

export class KanbanView extends TextFileView {
	private readonly settingsStore: Writable<SettingValues>;
	private readonly destroySettingsStore: () => void;

	private readonly manualOrderStore: Writable<ManualOrderStore>;

	private readonly columnDefinitionsStore: Readable<ColumnDefinition[]>;
	private readonly columnTagTableStore: Readable<ColumnTagTable>;
	private readonly columnColourTableStore: Readable<ColumnColourTable>;
	private readonly columnPlacementTagTableStore: Readable<ColumnPlacementTagTable>;
	private readonly columnMatchTagTableStore: Readable<ColumnMatchTagTable>;

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
		this.manualOrderStore = writable<ManualOrderStore>({});

		this.destroySettingsStore = this.settingsStore.subscribe((settings) => {
			this.boardFolderPath = this.file?.parent?.path ?? null;

			switch (settings.scope) {
				case ScopeOption.Everywhere:
					this.filenameFilter = null;
					break;
				case ScopeOption.Folder: {
					this.filenameFilter = this.boardFolderPath ? [this.boardFolderPath] : null;
					break;
				}
				case ScopeOption.SelectedFolders: {
					const selected = settings.scopeFolders ?? [];
					this.filenameFilter = this.boardFolderPath
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

		const { columnDefinitions, columnTagTable, columnColourTable, columnPlacementTagTable, columnMatchTagTable } = createColumnStores(
			this.settingsStore
		);
		this.columnDefinitionsStore = columnDefinitions;
		this.columnTagTableStore = columnTagTable;
		this.columnColourTableStore = columnColourTable;
		this.columnPlacementTagTableStore = columnPlacementTagTable;
		this.columnMatchTagTableStore = columnMatchTagTable;

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
		const parsed = matter<{ kanban_plugin: string; kanban_order: string }>(this.data + "\n");
		parsed.attributes["kanban_plugin"] = toSettingsString(
			get(this.settingsStore)
		);
		parsed.attributes["kanban_order"] = JSON.stringify(get(this.manualOrderStore));

		return `---
${Object.entries(parsed.attributes)
	.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
	.join("\n")}
---
${parsed.body}
`;
	}

	setViewData(data: string, clear?: boolean): void {
		this.data = data;
		this.settingsStore.set(this.getInitialSettings(data));
		this.manualOrderStore.set(this.getInitialManualOrder(data));
		this.initialiseTasksStore();
	}

	private getInitialSettings(data: string): SettingValues {
		const parsed = matter<{ kanban_plugin?: string }>(data + "\n");
		return parseSettingsString(parsed.attributes.kanban_plugin ?? "");
	}

	private getInitialManualOrder(data: string): ManualOrderStore {
		const parsed = matter<{ kanban_order?: string }>(data + "\n");
		try {
			if (parsed.attributes.kanban_order) {
				return JSON.parse(parsed.attributes.kanban_order);
			}
		} catch {
			// Silently ignore invalid JSON
		}
		return {};
	}

	clear(): void {
		// TODO
	}

	async onOpen() {
		this.component = new Main({
			target: this.contentEl,
			props: {
				app: this.app,
				tasksStore: this.tasksStore,
				taskActions: this.taskActions,
				columnTagTableStore: this.columnTagTableStore,
				columnColourTableStore: this.columnColourTableStore,
				columnMatchTagTableStore: this.columnMatchTagTableStore,
				openSettings: () => this.openSettingsModal(),
				settingsStore: this.settingsStore,
				manualOrderStore: this.manualOrderStore,
				requestSave: () => this.requestSave(),
			},
		});
	}

	async onClose() {
		this.component?.$destroy();
		this.destroySettingsStore();
	}
}
