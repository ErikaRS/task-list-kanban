<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { Menu, type App, type EventRef } from "obsidian";
	import { readable, type Readable } from "svelte/store";
	import {
		movePathRelativeTo,
		resolveBoardList,
		type BoardIndexEntry,
	} from "../boards/board_index";
	import { RenameBoardModal } from "../boards/rename_board_modal";
	import type { BoardListSettings } from "../settings/global_settings";
	import type { DropPosition } from "../settings/column_reorder";
	import Icon from "../components/icon.svelte";
	import DashboardCard from "./dashboard_card.svelte";
	import { buildBoardCards, type BoardCard, type BoardStatLookup } from "./dashboard_cards";
	import type { BoardTaskCounts } from "./board_stats";
	import {
		panelSlide,
		panelTransitionDuration,
		scrimFade,
	} from "./dashboard_panel_state";

	export let app: App;
	export let boardIndexStore: Readable<BoardIndexEntry[]>;
	export let boardListSettingsStore: Readable<BoardListSettings | undefined> =
		readable(undefined);
	export let currentPath: string | null;
	export let getBoardStat: BoardStatLookup;
	export let onSelect: (path: string) => void;
	export let onSetBoardHidden: ((path: string, hidden: boolean) => void) | undefined =
		undefined;
	export let onReorderBoards: ((orderedPaths: string[]) => void) | undefined = undefined;
	export let boardCountsStore: Readable<ReadonlyMap<string, BoardTaskCounts>> =
		readable(new Map());
	export let onRequestBoardCounts: ((paths: string[]) => void) | undefined = undefined;
	export let onClose: () => void;

	const duration = panelTransitionDuration(
		window.matchMedia("(prefers-reduced-motion: reduce)").matches,
	);

	let panelEl: HTMLElement | undefined;
	let modifyEventRef: EventRef | undefined;
	let refreshTimer: number | undefined;
	// Bumped (debounced) on vault modify events so last-modified times stay
	// fresh while the panel is open. Create/delete/rename flow through the
	// board index store instead; the listener lives and dies with the panel,
	// so nothing ticks while it is closed.
	let refreshTick = 0;

	// Hidden boards stay reachable under this zippy (hidden ≠ inaccessible).
	// Collapsed by default; transient like the panel itself.
	let otherBoardsExpanded = false;

	let now = Date.now();
	let shownCards: BoardCard[] = [];
	let hiddenCards: BoardCard[] = [];
	$: {
		void refreshTick;
		now = Date.now();
		const resolved = resolveBoardList($boardIndexStore, $boardListSettingsStore);
		shownCards = buildBoardCards(resolved.shown, getBoardStat);
		hiddenCards = buildBoardCards(resolved.hidden, getBoardStat);
	}

	// Counts are lazy: only visible cards get requested — hidden boards wait
	// for the zippy — and the refresh tick re-requests them all (unchanged
	// boards cache-hit without reads, edited ones recompute).
	$: requestVisibleCounts(shownCards, hiddenCards, otherBoardsExpanded);
	function requestVisibleCounts(
		shown: BoardCard[],
		hidden: BoardCard[],
		hiddenExpanded: boolean,
	) {
		const paths = [
			...shown.map((card) => card.path),
			...(hiddenExpanded ? hidden.map((card) => card.path) : []),
		];
		if (paths.length > 0) {
			onRequestBoardCounts?.(paths);
		}
	}

	onMount(() => {
		panelEl?.focus();
		modifyEventRef = app.vault.on("modify", scheduleRefresh);
	});

	onDestroy(() => {
		if (modifyEventRef) {
			app.vault.offref(modifyEventRef);
		}
		if (refreshTimer !== undefined) {
			window.clearTimeout(refreshTimer);
		}
	});

	function scheduleRefresh() {
		if (refreshTimer !== undefined) {
			window.clearTimeout(refreshTimer);
		}
		refreshTimer = window.setTimeout(() => {
			refreshTimer = undefined;
			refreshTick += 1;
		}, 500);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === "Escape") {
			// Keep the window-level handlers (view editor, filter editor)
			// from also reacting to the panel's Esc.
			event.stopPropagation();
			onClose();
		}
	}

	// --- Shown-grid drag reorder ---
	// Dropping materializes the full shown order as the explicit
	// `boardPaths` — which also sheds stale paths, since the shown list only
	// ever contains discovered boards.
	let draggedPath: string | null = null;
	let dropTarget: { path: string; position: DropPosition } | null = null;

	function handleCardDragOver(path: string, position: DropPosition): boolean {
		if (!onReorderBoards || !draggedPath || draggedPath === path) {
			return false;
		}
		dropTarget = { path, position };
		return true;
	}

	function handleCardDrop(path: string, position: DropPosition) {
		const dragged = draggedPath;
		draggedPath = null;
		dropTarget = null;
		if (!onReorderBoards || !dragged || dragged === path) {
			return;
		}
		const shownPaths = shownCards.map((card) => card.path);
		const nextOrder = movePathRelativeTo(shownPaths, dragged, path, position);
		if (nextOrder !== shownPaths) {
			onReorderBoards(nextOrder);
		}
	}

	function clearDragState() {
		draggedPath = null;
		dropTarget = null;
	}

	// Card context menu: rename (SPEC 0032's modal) plus hide/show writing
	// the curated list — curation without a settings round-trip.
	function handleCardContextMenu(card: BoardCard, event: MouseEvent, hidden: boolean) {
		const entry: BoardIndexEntry = {
			path: card.path,
			name: card.name,
			folder: card.folder,
		};
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle("Rename board")
				.setIcon("pencil")
				.onClick(() => new RenameBoardModal(app, entry).open()),
		);
		if (onSetBoardHidden) {
			menu.addItem((item) =>
				item
					.setTitle(hidden ? "Show board" : "Hide board")
					.setIcon(hidden ? "eye" : "eye-off")
					.onClick(() => onSetBoardHidden?.(card.path, !hidden)),
			);
		}
		menu.showAtMouseEvent(event);
	}
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="dashboard-overlay" on:keydown={handleKeydown}>
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<div
		class="dashboard-scrim"
		aria-hidden="true"
		transition:scrimFade={{ duration }}
		on:click={onClose}
	></div>
	<div
		class="dashboard-panel"
		role="dialog"
		aria-label="Board dashboard"
		tabindex="-1"
		bind:this={panelEl}
		transition:panelSlide={{ duration }}
	>
		<div class="dashboard-header">
			<h2 class="dashboard-title">Kanban boards</h2>
			<button
				type="button"
				class="dashboard-close"
				aria-label="Close dashboard"
				on:click={onClose}
			>
				<Icon name="x" size={18} />
			</button>
		</div>
		{#if shownCards.length === 0 && hiddenCards.length === 0}
			<p class="dashboard-empty">
				No kanban boards found in this vault. Create one from a folder's
				context menu with "New kanban".
			</p>
		{:else}
			<div class="dashboard-grid">
				{#each shownCards as card (card.path)}
					<DashboardCard
						{card}
						current={card.path === currentPath}
						{now}
						counts={$boardCountsStore.get(card.path) ?? null}
						{onSelect}
						onContextMenu={(menuCard, event) =>
							handleCardContextMenu(menuCard, event, false)}
						reorderable={onReorderBoards !== undefined}
						dragging={draggedPath === card.path}
						dropPosition={dropTarget?.path === card.path
							? dropTarget.position
							: null}
						onDragStart={() => (draggedPath = card.path)}
						onDragEnd={clearDragState}
						onDragOver={(position) => handleCardDragOver(card.path, position)}
						onDragLeave={() => {
							if (dropTarget?.path === card.path) {
								dropTarget = null;
							}
						}}
						onDrop={(position) => handleCardDrop(card.path, position)}
					/>
				{/each}
			</div>
			{#if hiddenCards.length > 0}
				<button
					type="button"
					class="other-boards-toggle"
					aria-expanded={otherBoardsExpanded}
					on:click={() => (otherBoardsExpanded = !otherBoardsExpanded)}
				>
					<Icon
						name={otherBoardsExpanded ? "chevron-down" : "chevron-right"}
						size={16}
					/>
					<span>Other boards ({hiddenCards.length})</span>
				</button>
				{#if otherBoardsExpanded}
					<div class="dashboard-grid">
						{#each hiddenCards as card (card.path)}
							<DashboardCard
								{card}
								current={card.path === currentPath}
								{now}
								counts={$boardCountsStore.get(card.path) ?? null}
								{onSelect}
								onContextMenu={(menuCard, event) =>
									handleCardContextMenu(menuCard, event, true)}
							/>
						{/each}
					</div>
				{/if}
			{/if}
		{/if}
	</div>
</div>

<style lang="scss">
	// Anchored to the board area below the chrome row, so the toolbar (and
	// the dashboard button, the accidental-click undo) stays interactive.
	// Bleeds through board-content's padding so the slide starts at the
	// view's edge and the scrim meets the toolbar without a gap.
	.dashboard-overlay {
		position: absolute;
		top: calc(-1 * var(--size-4-2));
		bottom: 0;
		left: calc(-1 * var(--size-4-4));
		right: calc(-1 * var(--size-4-4));
		z-index: 200;
	}

	.dashboard-scrim {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.25);
	}

	.dashboard-panel {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		width: min(75%, 960px);
		box-sizing: border-box;
		padding: var(--size-4-4);
		overflow-y: auto;
		background: var(--background-primary);
		border-top: 1px solid var(--background-modifier-border);
		border-right: 1px solid var(--background-modifier-border);
		box-shadow: var(--shadow-l, 4px 0 24px rgba(0, 0, 0, 0.2));
		outline: none;
	}

	.dashboard-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--size-4-2);
		margin: 0 0 var(--size-4-4) 0;
	}

	.dashboard-title {
		margin: 0;
	}

	.dashboard-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		width: 28px;
		height: 28px;
		margin: 0;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: var(--radius-s);
		box-shadow: none;
		color: var(--text-muted);
		cursor: pointer;

		&:hover {
			background: var(--background-modifier-hover);
			color: var(--text-normal);
		}
	}

	.dashboard-empty {
		color: var(--text-muted);
	}

	.dashboard-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: var(--size-4-3);
	}

	.other-boards-toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--size-2-2);
		margin: var(--size-4-4) 0 var(--size-4-3) 0;
		padding: 0;
		background: transparent;
		border: none;
		box-shadow: none;
		color: var(--text-muted);
		font-size: var(--font-ui-small);
		font-weight: 600;
		cursor: pointer;

		&:hover {
			color: var(--text-normal);
		}
	}
</style>
