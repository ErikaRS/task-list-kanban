import { App, Modal, Plugin, PluginSettingTab, Setting } from "obsidian";
import {
	FlowDirection,
	defaultSettings,
	resolveSettings,
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

	private async mutate(updater: (settings: GlobalSettings) => GlobalSettings) {
		this.globalSettingsStore.update(updater);
		await this.onChange();
	}
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
