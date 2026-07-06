import { App, Modal, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { ColumnOrderMode, type SortDirection } from "../../parsing/properties/comparators";
import {
	FlowDirection,
	defaultSettings,
	resolveSettings,
	type SavedView,
	type SavedViewProperties,
	type SettingValues,
} from "./settings_store";
import {
	BOARD_DEFAULT_SETTING_KEYS,
	type GlobalDefaultViewProperties,
	pickBoardDefaultSettings,
	type GlobalSettings,
	type GlobalSettingsStore,
} from "./global_settings";
import { SettingsModal } from "./settings";
import {
	savedViewHasProperties,
	savedViewPropertyLabels,
} from "../views/saved_views";
import type { GroupSource } from "../tasks/task_grouping";

export class GlobalSettingsTab extends PluginSettingTab {
	private destroyBoardDefaultsEditor: (() => void) | null = null;

	constructor(
		app: App,
		plugin: Plugin,
		private readonly globalSettingsStore: GlobalSettingsStore,
		private readonly onChange: () => Promise<void>,
	) {
		super(app, plugin);
	}

	display(): void {
		this.destroyBoardDefaultsEditor?.();
		this.destroyBoardDefaultsEditor = null;
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("task-list-kanban-global-settings");
		containerEl.createEl("h2", { text: "Task List Kanban" });
		containerEl.createEl("p", {
			text: "Defaults here apply to boards that have not saved a local override for the same setting.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("Board defaults")
			.setDesc("Clear plugin-level board defaults and fall back to the built-in defaults.")
			.addButton((button) => {
				button
					.setButtonText("Reset all")
					.onClick(() => {
						new ConfirmGlobalDefaultsResetModal(this.app, async () => {
							await this.mutate((settings) => ({
								...settings,
								boardDefaults: {},
							}));
							this.display();
						}).open();
					});
			});

		this.renderBoardDefaultsEditor(containerEl);
		this.renderDefaultView(containerEl);
		this.renderGlobalSavedViews(containerEl);
	}

	hide(): void {
		this.destroyBoardDefaultsEditor?.();
		this.destroyBoardDefaultsEditor = null;
		this.containerEl.empty();
	}

	private renderBoardDefaultsEditor(containerEl: HTMLElement) {
		const editorHost = containerEl.createDiv({ cls: "global-board-defaults-editor" });
		const originalGlobalSettings = this.globalSettingsStore.get();
		let currentDefaults = originalGlobalSettings.boardDefaults;
		let currentResolvedSettings = resolveSettings(currentDefaults);
		const editor = new SettingsModal(
			this.app,
			currentResolvedSettings,
			async (newSettings) => {
				const nextDefaults = mergeChangedBoardDefaults(
					currentDefaults,
					currentResolvedSettings,
					newSettings,
				);
				currentDefaults = nextDefaults;
				currentResolvedSettings = resolveSettings(nextDefaults);
				await this.mutate((settings) => ({
					...settings,
					boardDefaults: nextDefaults,
				}));
			},
			null,
			{
				title: "Default board settings",
				mode: "globalDefaults",
				layout: "embedded",
			},
		);
		this.destroyBoardDefaultsEditor = editor.mountInline(editorHost);
	}

	private renderDefaultView(containerEl: HTMLElement) {
		new Setting(containerEl).setName("Default view").setHeading();
		containerEl.createEl("p", {
			text: "Layout defaults apply only where a board has not saved its own layout setting.",
			cls: "setting-item-description",
		});
		const defaultView = this.globalSettingsStore.get().defaultView ?? {};

		new Setting(containerEl)
			.setName("Default flow")
			.addDropdown((dropdown) => {
				dropdown
					.addOption(FlowDirection.LeftToRight, "Left to right")
					.addOption(FlowDirection.RightToLeft, "Right to left")
					.addOption(FlowDirection.TopToBottom, "Top to bottom")
					.addOption(FlowDirection.BottomToTop, "Bottom to top")
					.setValue(defaultView.flowDirection ?? FlowDirection.LeftToRight)
					.onChange((value) => {
						void this.updateDefaultView((view) => {
							view.flowDirection = value as FlowDirection;
						});
					});
			});

		const columnWidth = defaultView.columnWidth ?? defaultSettings.columnWidth ?? 300;
		let columnWidthLabel: HTMLElement | null = null;
		new Setting(containerEl)
			.setName("Default card width")
			.setDesc("Card width for boards that have not saved their own width.")
			.addSlider((slider) => {
				slider
					.setLimits(200, 600, 10)
					.setValue(columnWidth)
					.setDynamicTooltip()
					.onChange((value) => {
						columnWidthLabel?.setText(`${value}px`);
						void this.updateDefaultView((view) => {
							view.columnWidth = value;
						});
					});
			})
			.then((setting) => {
				columnWidthLabel = setting.controlEl.createSpan({
					text: `${columnWidth}px`,
					cls: "setting-item-description",
				});
			});
	}

	private async updateDefaultView(updater: (view: GlobalDefaultViewProperties) => void) {
		await this.mutate((settings) => {
			const view: GlobalDefaultViewProperties = { ...(settings.defaultView ?? {}) };
			updater(view);
			return {
				...settings,
				defaultView: Object.keys(view).length > 0 ? view : undefined,
			};
		});
	}

	private renderGlobalSavedViews(containerEl: HTMLElement) {
		new Setting(containerEl).setName("Global saved views").setHeading();
		containerEl.createEl("p", {
			text: "Global saved views are available from every board. Edit or delete them here.",
			cls: "setting-item-description",
		});

		let draftName = "";
		let draftQuery = "";
		let draftSortMode = "";
		let draftSortDirection: SortDirection = "asc";
		let draftGroupKind = "";
		let draftGroupDirection: SortDirection = "asc";
		let draftTagPrefix = "";
		let draftFlowDirection = "";
		let draftColumnWidthEnabled = false;
		let draftColumnWidth = defaultSettings.columnWidth ?? 300;

		new Setting(containerEl)
			.setName("Name")
			.addText((text) => {
				text
					.setPlaceholder("Overdue only")
					.onChange((value) => {
						draftName = value;
					});
			});

		new Setting(containerEl)
			.setName("Filter query")
			.setDesc("Optional search query to apply with this view.")
			.addText((text) => {
				text
					.setPlaceholder("due:<$TODAY")
					.onChange((value) => {
						draftQuery = value;
					});
			});

		new Setting(containerEl)
			.setName("Sort")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("", "Leave unchanged")
					.addOption(ColumnOrderMode.FileOrder, "File order")
					.addOption(ColumnOrderMode.TaskName, "Task name")
					.addOption(ColumnOrderMode.Manual, "Manual")
					.onChange((value) => {
						draftSortMode = value;
					});
			})
			.addDropdown((dropdown) => {
				dropdown
					.addOption("asc", "Ascending")
					.addOption("desc", "Descending")
					.onChange((value) => {
						draftSortDirection = value as SortDirection;
					});
			});

		new Setting(containerEl)
			.setName("Group")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("", "Leave unchanged")
					.addOption("none", "None")
					.addOption("file", "File")
					.addOption("tag-prefix", "Tag prefix")
					.onChange((value) => {
						draftGroupKind = value;
					});
			})
			.addText((text) => {
				text
					.setPlaceholder("Tag prefix")
					.onChange((value) => {
						draftTagPrefix = value;
					});
			})
			.addDropdown((dropdown) => {
				dropdown
					.addOption("asc", "Ascending")
					.addOption("desc", "Descending")
					.onChange((value) => {
						draftGroupDirection = value as SortDirection;
					});
			});

		new Setting(containerEl)
			.setName("Flow")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("", "Leave unchanged")
					.addOption(FlowDirection.LeftToRight, "Left to right")
					.addOption(FlowDirection.RightToLeft, "Right to left")
					.addOption(FlowDirection.TopToBottom, "Top to bottom")
					.addOption(FlowDirection.BottomToTop, "Bottom to top")
					.onChange((value) => {
						draftFlowDirection = value;
					});
			});

		let columnWidthLabel: HTMLElement | null = null;
		new Setting(containerEl)
			.setName("Card width")
			.addToggle((toggle) => {
				toggle.onChange((value) => {
					draftColumnWidthEnabled = value;
				});
			})
			.addSlider((slider) => {
				slider
					.setLimits(200, 600, 10)
					.setValue(draftColumnWidth)
					.setDynamicTooltip()
					.onChange((value) => {
						draftColumnWidth = value;
						columnWidthLabel?.setText(`${value}px`);
					});
			})
			.then((setting) => {
				columnWidthLabel = setting.controlEl.createSpan({
					text: `${draftColumnWidth}px`,
					cls: "setting-item-description",
				});
			});

		new Setting(containerEl)
			.setName("Save global view")
			.addButton((button) => {
				button
					.setButtonText("Save")
					.setCta()
					.onClick(async () => {
						const properties = buildSavedViewProperties({
							query: draftQuery,
							sortMode: draftSortMode,
							sortDirection: draftSortDirection,
							groupKind: draftGroupKind,
							groupDirection: draftGroupDirection,
							tagPrefix: draftTagPrefix,
							flowDirection: draftFlowDirection,
							columnWidth: draftColumnWidthEnabled ? draftColumnWidth : undefined,
						});
						if (!savedViewHasProperties(properties)) {
							new Notice("Choose at least one saved-view property.");
							return;
						}
						const name = draftName.trim() || defaultSavedViewName(properties);
						await this.mutate((settings) => ({
							...settings,
							globalViews: [
								...(settings.globalViews ?? []),
								{
									id: crypto.randomUUID(),
									name,
									...properties,
								},
							],
						}));
						this.display();
					});
			});

		const globalViews = this.globalSettingsStore.get().globalViews ?? [];
		if (globalViews.length === 0) {
			containerEl.createEl("p", {
				text: "No global saved views yet.",
				cls: "setting-item-description",
			});
			return;
		}

		for (const view of globalViews) {
			new Setting(containerEl)
				.setName(view.name)
				.setDesc(savedViewPropertyLabels(view).join(" · ") || "No properties")
				.addButton((button) => {
					button
						.setButtonText("Delete")
						.setWarning()
						.onClick(() => {
							new ConfirmGlobalSavedViewDeleteModal(this.app, view, async () => {
								await this.mutate((settings) => ({
									...settings,
									globalViews: (settings.globalViews ?? []).filter(
										(candidate) => candidate.id !== view.id,
									),
								}));
								this.display();
							}).open();
						});
				});
		}
	}

	private async mutate(updater: (settings: GlobalSettings) => GlobalSettings) {
		this.globalSettingsStore.update(updater);
		await this.onChange();
	}
}

function buildSavedViewProperties(input: {
	query: string;
	sortMode: string;
	sortDirection: SortDirection;
	groupKind: string;
	groupDirection: SortDirection;
	tagPrefix: string;
	flowDirection: string;
	columnWidth?: number;
}): SavedViewProperties {
	const properties: SavedViewProperties = {};
	const query = input.query.trim();
	if (query !== "") {
		properties.query = query;
	}
	if (input.sortMode !== "") {
		properties.sort = {
			mode: input.sortMode as ColumnOrderMode,
			property: null,
			direction: input.sortDirection,
		};
	}
	const groupSource = groupSourceFromDraft(input.groupKind, input.tagPrefix);
	if (groupSource) {
		properties.group = {
			source: groupSource,
			direction: input.groupDirection,
		};
	}
	if (isFlowDirection(input.flowDirection)) {
		properties.flowDirection = input.flowDirection;
	}
	if (input.columnWidth !== undefined) {
		properties.columnWidth = input.columnWidth;
	}
	return properties;
}

function groupSourceFromDraft(kind: string, tagPrefix: string): GroupSource | undefined {
	if (kind === "none") {
		return { kind: "none" };
	}
	if (kind === "file") {
		return { kind: "file" };
	}
	if (kind === "tag-prefix") {
		return { kind: "tag-prefix", prefix: tagPrefix.trim() };
	}
	return undefined;
}

function isFlowDirection(value: string): value is FlowDirection {
	return (Object.values(FlowDirection) as string[]).includes(value);
}

function defaultSavedViewName(properties: SavedViewProperties): string {
	const labels = savedViewPropertyLabels(properties);
	return labels.length > 0 ? labels.join(" + ") : "View";
}

function mergeChangedBoardDefaults(
	originalDefaults: Partial<SettingValues>,
	originalResolvedSettings: SettingValues,
	newSettings: SettingValues,
): Partial<SettingValues> {
	const nextDefaults: Partial<SettingValues> = {};
	const originalDefaultsRecord = originalDefaults as Record<string, unknown>;
	const originalResolvedRecord = originalResolvedSettings as unknown as Record<string, unknown>;
	const newRecord = pickBoardDefaultSettings(newSettings) as Record<string, unknown>;
	const nextRecord = nextDefaults as Record<string, unknown>;

	for (const key of BOARD_DEFAULT_SETTING_KEYS) {
		const wasExplicit = Object.prototype.hasOwnProperty.call(originalDefaultsRecord, key);
		const changed = JSON.stringify(newRecord[key]) !== JSON.stringify(originalResolvedRecord[key]);
		if (wasExplicit || changed) {
			nextRecord[key] = JSON.parse(JSON.stringify(newRecord[key]));
		}
	}

	return nextDefaults;
}

class ConfirmGlobalDefaultsResetModal extends Modal {
	constructor(
		app: App,
		private readonly onConfirm: () => void | Promise<void>,
	) {
		super(app);
	}

	onOpen() {
		this.contentEl.addClass("task-list-kanban-confirm-modal");
		this.contentEl.createEl("h2", { text: "Reset global board defaults?" });
		this.contentEl.createEl("p", {
			text: "Boards that inherit these plugin-level defaults will fall back to the built-in defaults. Board-local overrides will not be changed.",
		});

		const actions = this.contentEl.createDiv({ cls: "confirm-modal-actions" });
		actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => {
			this.close();
		});
		const confirmButton = actions.createEl("button", {
			text: "Reset defaults",
			cls: "mod-warning",
		});
		confirmButton.addEventListener("click", async () => {
			confirmButton.disabled = true;
			try {
				await this.onConfirm();
				this.close();
			} finally {
				confirmButton.disabled = false;
			}
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

class ConfirmGlobalSavedViewDeleteModal extends Modal {
	constructor(
		app: App,
		private readonly view: SavedView,
		private readonly onConfirm: () => void | Promise<void>,
	) {
		super(app);
	}

	onOpen() {
		this.contentEl.addClass("task-list-kanban-confirm-modal");
		this.contentEl.createEl("h2", { text: "Delete global saved view?" });
		this.contentEl.createEl("p", {
			text: `Delete "${this.view.name}" for every board. Board-local saved views will not be changed.`,
		});

		const actions = this.contentEl.createDiv({ cls: "confirm-modal-actions" });
		actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => {
			this.close();
		});
		const confirmButton = actions.createEl("button", {
			text: "Delete",
			cls: "mod-warning",
		});
		confirmButton.addEventListener("click", async () => {
			confirmButton.disabled = true;
			try {
				await this.onConfirm();
				this.close();
			} finally {
				confirmButton.disabled = false;
			}
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
