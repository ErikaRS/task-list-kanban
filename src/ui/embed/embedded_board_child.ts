// Obsidian host for `task-list-kanban` code blocks (SPEC 0057): the
// embedded board, renderer #2 next to the full board (text_view.ts →
// main.svelte). This file only wires Obsidian to the controller: lazy
// mounting, vault and metadata events, and opening the board. See the embed
// parity matrix in README.architecture.md before changing what embeds show.
import { Keymap, MarkdownRenderChild, TFile, type App, type Plugin } from "obsidian";
import { mount, unmount } from "svelte";
import { writable, type Readable } from "svelte/store";
import type { BoardSnapshotCache } from "../boards/board_snapshot";
import type { GlobalSettings } from "../settings/global_settings";
import EmbeddedBoard from "./embedded_board.svelte";
import {
	createEmbeddedBoardController,
	type EmbedHost,
	type EmbedState,
	type EmbedTimers,
	type EmbeddedBoardController,
} from "./embedded_board_controller";

export const EMBED_CODE_BLOCK_LANGUAGE = "task-list-kanban";
// Load a little before the embed scrolls into view.
const LAZY_MOUNT_ROOT_MARGIN = "600px 0px";

export function createEmbedHost(
	app: App,
	snapshots: BoardSnapshotCache,
	getGlobalSettings: () => GlobalSettings,
): EmbedHost {
	return {
		snapshots,
		resolveBoardFile(reference, sourcePath) {
			const linked = app.metadataCache.getFirstLinkpathDest(reference, sourcePath);
			const file = linked ?? app.vault.getAbstractFileByPath(reference)
				?? app.vault.getAbstractFileByPath(`${reference}.md`);
			return file instanceof TFile ? file : null;
		},
		isBoardFile(path) {
			const file = app.vault.getAbstractFileByPath(path);
			return file instanceof TFile
				&& !!app.metadataCache.getFileCache(file)?.frontmatter?.["kanban_plugin"];
		},
		getGlobalViews: () => getGlobalSettings().globalViews ?? [],
		now: () => new Date(),
	};
}

export interface EmbeddedBoardDeps {
	host: EmbedHost;
	globalSettingsStore: Readable<GlobalSettings>;
	/** Opens the board in a leaf chosen from the click's modifiers. */
	openBoard(path: string, newLeaf: ReturnType<typeof Keymap.isModEvent>): void;
}

export class EmbeddedBoardChild extends MarkdownRenderChild {
	private component: ReturnType<typeof mount> | undefined;
	private controller: EmbeddedBoardController | undefined;
	private observer: IntersectionObserver | undefined;

	constructor(
		containerEl: HTMLElement,
		private readonly app: App,
		private readonly source: string,
		private readonly sourcePath: string,
		private readonly deps: EmbeddedBoardDeps,
	) {
		super(containerEl);
	}

	onload() {
		this.containerEl.addClass("task-list-kanban-embed");
		const timers: EmbedTimers = {
			setTimeout: (callback, delay) => window.setTimeout(callback, delay),
			clearTimeout: (id) => window.clearTimeout(id),
		};
		const stateStore = writable<EmbedState | { kind: "idle" }>({ kind: "idle" });
		this.component = mount(EmbeddedBoard, {
			target: this.containerEl,
			props: {
				app: this.app,
				stateStore,
				onOpenBoard: (e: MouseEvent | KeyboardEvent) => this.openBoard(e),
			},
		});
		const controller = createEmbeddedBoardController({
			source: this.source,
			sourcePath: this.sourcePath,
			host: this.deps.host,
			timers,
			onState: (state: EmbedState) => stateStore.set(state),
		});
		this.controller = controller;

		this.registerEvent(this.app.metadataCache.on("changed", (file) => controller.notifyFileChanged(file.path)));
		const onFileSetChange = (file: unknown) => {
			if (file instanceof TFile && file.extension === "md") controller.notifyFilesChanged();
		};
		this.registerEvent(this.app.vault.on("create", onFileSetChange));
		this.registerEvent(this.app.vault.on("delete", onFileSetChange));
		this.registerEvent(this.app.vault.on("rename", onFileSetChange));
		let initial = true;
		const unsubscribe = this.deps.globalSettingsStore.subscribe(() => {
			if (initial) return;
			controller.notifySettingsChanged();
		});
		initial = false;
		this.register(unsubscribe);

		// Off-screen embeds parse nothing until scrolled near.
		if (typeof IntersectionObserver === "undefined") {
			controller.start();
			return;
		}
		this.observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				this.observer?.disconnect();
				this.observer = undefined;
				controller.start();
			}
		}, { rootMargin: LAZY_MOUNT_ROOT_MARGIN });
		this.observer.observe(this.containerEl);
	}

	onunload() {
		this.observer?.disconnect();
		this.controller?.stop();
		if (this.component) {
			void unmount(this.component);
			this.component = undefined;
		}
	}

	private openBoard(e: MouseEvent | KeyboardEvent) {
		const path = this.controller?.boardPath;
		if (!path) return;
		this.deps.openBoard(path, Keymap.isModEvent(e));
	}
}

export function registerEmbeddedBoards(plugin: Plugin, deps: EmbeddedBoardDeps) {
	plugin.registerMarkdownCodeBlockProcessor(EMBED_CODE_BLOCK_LANGUAGE, (source, el, ctx) => {
		ctx.addChild(new EmbeddedBoardChild(el, plugin.app, source, ctx.sourcePath, deps));
	});
}
