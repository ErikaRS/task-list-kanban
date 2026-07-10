import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { ConfirmModal } from "./confirm_modal";
import { ColumnOrderMode, type SortDirection } from "../../parsing/properties/comparators";
import {
	FlowDirection,
	defaultSettings,
	isFlowDirection,
	resolveSettings,
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
import { get, type Readable } from "svelte/store";
import { movePathRelativeTo, type BoardIndexEntry } from "../boards/board_index";
import type { DropPosition } from "./column_reorder";
import type { TabsSettings } from "./global_settings";
import { setIcon } from "obsidian";
import { SettingsModal } from "./settings";
import {
	defaultSavedViewName,
	savedViewHasProperties,
	savedViewPropertyLabels,
} from "../views/saved_views";
import type { GroupSource } from "../tasks/task_grouping";

export class GlobalSettingsTab extends PluginSettingTab {
	private destroyBoardDefaultsEditor: (() => void) | null = null;
	private destroyPinnedBoardsList: (() => void) | null = null;
	private draggedTabPath: string | null = null;
	private tabDropPreview: { path: string; position: DropPosition } | null = null;

	constructor(
		app: App,
		plugin: Plugin,
		private readonly globalSettingsStore: GlobalSettingsStore,
		private readonly boardIndexStore: Readable<BoardIndexEntry[]>,
		private readonly onChange: () => Promise<void>,
	) {
		super(app, plugin);
	}

	display(): void {
		this.destroyBoardDefaultsEditor?.();
		this.destroyBoardDefaultsEditor = null;
		this.destroyPinnedBoardsList?.();
		this.destroyPinnedBoardsList = null;
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("task-list-kanban-global-settings");
		containerEl.createEl("h2", { text: "Task List Kanban" });
		this.renderPluginSettings(containerEl);

		new Setting(containerEl).setName("Board defaults").setHeading();
		containerEl.createEl("p", {
			text: "Defaults here apply to boards that have not saved a local override for the same setting.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("Reset board defaults")
			.setDesc("Clear plugin-level board defaults and fall back to the built-in defaults.")
			.addButton((button) => {
				button
					.setButtonText("Reset all")
					.onClick(() => {
						new ConfirmModal(this.app, {
							title: "Reset global board defaults?",
							body: "Boards that inherit these plugin-level defaults will fall back to the built-in defaults. Board-local overrides will not be changed.",
							confirmText: "Reset defaults",
							onConfirm: async () => {
								await this.mutate((settings) => ({
									...settings,
									boardDefaults: {},
								}));
								this.display();
							},
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
		this.destroyPinnedBoardsList?.();
		this.destroyPinnedBoardsList = null;
		this.containerEl.empty();
	}

	private renderBoardDefaultsEditor(containerEl: HTMLElement) {
		const editorHost = containerEl.createDiv({ cls: "global-board-defaults-editor" });
		const originalGlobalSettings = this.globalSettingsStore.get();
		let currentDefaults = originalGlobalSettings.boardDefaults;
		let currentResolvedSettings = resolveSettings(currentDefaults);
		// The editor must get its own clone: the modal mutates its settings
		// object in place, so passing currentResolvedSettings directly would
		// alias the merge's "before" baseline to its "after" input and the
		// diff below would drop the first change made after opening the tab.
		const editor = new SettingsModal(
			this.app,
			structuredClone(currentResolvedSettings),
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
							// Left to right is the builtin default, so an
							// explicit LTR default is indistinguishable from
							// no default — store nothing.
							if (isFlowDirection(value) && value !== FlowDirection.LeftToRight) {
								view.flowDirection = value;
							} else {
								delete view.flowDirection;
							}
						});
					});
			});

		const builtinColumnWidth = defaultSettings.columnWidth ?? 300;
		const columnWidth = defaultView.columnWidth ?? builtinColumnWidth;
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
							// The builtin width is the default already —
							// storing it explicitly would be the same thing.
							if (value === builtinColumnWidth) {
								delete view.columnWidth;
							} else {
								view.columnWidth = value;
							}
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

	// Plugin-wide behavior settings — unlike everything below, these are not
	// defaults that boards inherit, so they sit above the defaults sections.
	private renderPluginSettings(containerEl: HTMLElement) {
		new Setting(containerEl)
			.setName("Show board tabs")
			.setDesc("Show a tab strip on every kanban board for switching between boards in the same pane.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.globalSettingsStore.get().tabs?.enabled ?? false)
					.onChange((value) => {
						void this.mutate((settings) => ({
							...settings,
							tabs: {
								...(settings.tabs ?? {}),
								enabled: value,
							},
						}));
					});
			});

		new Setting(containerEl)
			.setName("Board tabs")
			.setDesc(
				"Boards shown as tabs, in order. Drag to reorder, remove to hide a board from the strip, and add removed boards back. New boards are shown automatically.",
			);

		const listEl = containerEl.createDiv();
		// Discovery is async and boards can be created or renamed while the
		// settings tab is open, so the list re-renders with the index.
		this.destroyPinnedBoardsList?.();
		this.destroyPinnedBoardsList = this.boardIndexStore.subscribe(() => {
			this.renderPinnedBoardsList(listEl);
		});
	}

	private renderPinnedBoardsList(listEl: HTMLElement) {
		listEl.empty();
		const boards = get(this.boardIndexStore);
		const tabs = this.globalSettingsStore.get().tabs;
		const orderedPaths = tabs?.boardPaths ?? [];
		const orderedPathSet = new Set(orderedPaths);
		const unpinnedPaths = new Set(tabs?.unpinnedPaths ?? []);
		const boardsByPath = new Map(boards.map((board) => [board.path, board]));
		const rerender = () => this.renderPinnedBoardsList(listEl);

		if (boards.length === 0 && orderedPaths.length === 0) {
			listEl.createEl("p", {
				text: "No kanban boards found in this vault yet.",
				cls: "setting-item-description",
			});
			return;
		}

		// The rows mirror the tab strip: explicitly ordered boards first,
		// the rest alphabetically (the board index is already sorted). Stale
		// ordered paths stay visible so they can be cleaned up.
		const shownRows: { path: string; board: BoardIndexEntry | undefined }[] = [
			...orderedPaths
				.filter((path) => !unpinnedPaths.has(path))
				.map((path) => ({ path, board: boardsByPath.get(path) })),
			...boards
				.filter(
					(board) =>
						!orderedPathSet.has(board.path) && !unpinnedPaths.has(board.path),
				)
				.map((board) => ({ path: board.path, board: board as BoardIndexEntry | undefined })),
		];
		const shownPaths = shownRows.map((row) => row.path);

		const rowsEl = listEl.createDiv({ cls: "column-editor-list" });
		for (const { path, board } of shownRows) {
			this.renderPinnedBoardRow(rowsEl, path, board, shownPaths, rerender);
		}

		// Add back a board that was removed from the strip.
		const removedBoards = boards.filter((board) => unpinnedPaths.has(board.path));
		if (removedBoards.length > 0) {
			new Setting(listEl).setName("Add board").addDropdown((dropdown) => {
				dropdown.addOption("", "Choose a board…");
				for (const board of removedBoards) {
					dropdown.addOption(board.path, `${board.name} (${board.path})`);
				}
				dropdown.setValue("").onChange((path) => {
					if (path === "") {
						return;
					}
					void this.pinBoard(path).then(rerender);
				});
			});
		}
	}

	private renderPinnedBoardRow(
		rowsEl: HTMLElement,
		path: string,
		board: BoardIndexEntry | undefined,
		shownPaths: string[],
		rerender: () => void,
	) {
		const row = rowsEl.createDiv({ cls: "column-editor-row" });
		const dragHandle = row.createEl("button", {
			text: "⋮⋮",
			cls: "column-editor-handle clickable-icon",
		});
		dragHandle.setAttribute("aria-label", `Reorder ${board?.name ?? path} tab`);
		this.wireTabRowDragAndDrop(rowsEl, row, dragHandle, path, shownPaths, rerender);

		const content = row.createDiv({ cls: "column-editor-row-content" });
		content.createDiv({ text: board?.name ?? path });
		content.createDiv({
			text: board ? path : `${path} — board not found`,
			cls: "setting-item-description",
		});

		const removeButton = row.createEl("button", { cls: "clickable-icon" });
		setIcon(removeButton, "x");
		removeButton.setAttribute("aria-label", "Remove from tabs");
		removeButton.addEventListener("click", () => {
			void this.unpinBoard(path).then(rerender);
		});
	}

	private wireTabRowDragAndDrop(
		rowsEl: HTMLElement,
		row: HTMLDivElement,
		dragHandle: HTMLButtonElement,
		path: string,
		shownPaths: string[],
		rerender: () => void,
	) {
		dragHandle.draggable = true;
		dragHandle.addEventListener("dragstart", (event) => {
			this.draggedTabPath = path;
			this.tabDropPreview = null;
			row.addClass("is-dragging");
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = "move";
				event.dataTransfer.setData("text/plain", path);
			}
		});
		dragHandle.addEventListener("dragend", () => {
			this.clearTabDragState(rowsEl);
		});
		row.addEventListener("dragover", (event) => {
			if (!this.draggedTabPath || this.draggedTabPath === path) {
				return;
			}
			event.preventDefault();
			const rowRect = row.getBoundingClientRect();
			const position: DropPosition =
				event.clientY > rowRect.top + rowRect.height / 2 ? "after" : "before";
			this.tabDropPreview = { path, position };
			row.addClass("is-drop-target");
			row.classList.toggle("is-drop-before", position === "before");
			row.classList.toggle("is-drop-after", position === "after");
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = "move";
			}
		});
		row.addEventListener("dragleave", () => {
			if (this.tabDropPreview?.path === path) {
				this.tabDropPreview = null;
			}
			row.removeClass("is-drop-target");
			row.removeClass("is-drop-before");
			row.removeClass("is-drop-after");
		});
		row.addEventListener("drop", (event) => {
			event.preventDefault();
			const position =
				this.tabDropPreview?.path === path ? this.tabDropPreview.position : "before";
			const draggedPath =
				this.draggedTabPath ?? event.dataTransfer?.getData("text/plain") ?? "";
			this.clearTabDragState(rowsEl);
			// Dropping materializes the full shown order as the explicit one.
			const nextOrder = movePathRelativeTo(shownPaths, draggedPath, path, position);
			if (nextOrder !== shownPaths) {
				void this.setTabOrder(nextOrder).then(rerender);
			}
		});
	}

	private clearTabDragState(rowsEl: HTMLElement) {
		this.draggedTabPath = null;
		this.tabDropPreview = null;
		for (const candidate of Array.from(rowsEl.querySelectorAll(".column-editor-row"))) {
			candidate.removeClass("is-drop-target");
			candidate.removeClass("is-drop-before");
			candidate.removeClass("is-drop-after");
			candidate.removeClass("is-dragging");
		}
	}

	private async setTabOrder(boardPaths: string[]) {
		await this.mutate((settings) => ({
			...settings,
			tabs: buildTabsSettings(
				settings.tabs?.enabled ?? false,
				boardPaths,
				settings.tabs?.unpinnedPaths ?? [],
			),
		}));
	}

	private async pinBoard(path: string) {
		await this.mutate((settings) => ({
			...settings,
			tabs: buildTabsSettings(
				settings.tabs?.enabled ?? false,
				settings.tabs?.boardPaths ?? [],
				(settings.tabs?.unpinnedPaths ?? []).filter((candidate) => candidate !== path),
			),
		}));
	}

	private async unpinBoard(path: string) {
		const isKnownBoard = get(this.boardIndexStore).some((board) => board.path === path);
		await this.mutate((settings) => {
			const boardPaths = (settings.tabs?.boardPaths ?? []).filter(
				(candidate) => candidate !== path,
			);
			const currentUnpinned = settings.tabs?.unpinnedPaths ?? [];
			// A stale path just gets dropped from the order; only boards that
			// still exist need to be remembered as removed.
			const unpinnedPaths = isKnownBoard
				? [...currentUnpinned.filter((candidate) => candidate !== path), path]
				: currentUnpinned;
			return {
				...settings,
				tabs: buildTabsSettings(settings.tabs?.enabled ?? false, boardPaths, unpinnedPaths),
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
							new ConfirmModal(this.app, {
								title: "Delete global saved view?",
								body: `Delete "${view.name}" for every board. Board-local saved views will not be changed.`,
								confirmText: "Delete",
								onConfirm: async () => {
									await this.mutate((settings) => ({
										...settings,
										globalViews: (settings.globalViews ?? []).filter(
											(candidate) => candidate.id !== view.id,
										),
									}));
									this.display();
								},
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

function buildTabsSettings(
	enabled: boolean,
	boardPaths: string[],
	unpinnedPaths: string[],
): TabsSettings {
	return {
		enabled,
		...(boardPaths.length > 0 ? { boardPaths } : {}),
		...(unpinnedPaths.length > 0 ? { unpinnedPaths } : {}),
	};
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

