<script lang="ts">
	import { readable, type Readable } from "svelte/store";
	import {
		movePathRelativeTo,
		resolveBoardList,
		type BoardIndexEntry,
	} from "../boards/board_index";
	import type { BoardListSettings } from "../settings/global_settings";
	import type { DropPosition } from "../settings/column_reorder";
	import Icon from "../components/icon.svelte";
	import {
		clampRailWidth,
		railChipLabel,
		railDisplayMode,
		railDropPosition,
		railDropPositionHorizontal,
		type RailDock,
	} from "./board_rail_state";

	export let boardIndexStore: Readable<BoardIndexEntry[]>;
	export let boardListSettingsStore: Readable<BoardListSettings | undefined> =
		readable(undefined);
	export let currentPath: string | null;
	export let dashboardOpen: boolean;
	export let onToggleDashboard: () => void;
	export let onSelect: (path: string) => void;
	export let onReorderBoards: ((orderedPaths: string[]) => void) | undefined = undefined;
	/** Dock side (plugin setting). Top lays the tabs out as a horizontal strip. */
	export let dock: RailDock = "left";
	/** Persisted width; a live drag is component-local until release. Left dock only. */
	export let width: number;
	export let onSetWidth: ((width: number) => void) | undefined = undefined;
	/** Bound by the parent so panel-close focus return can target this button. */
	export let dashboardButtonEl: HTMLButtonElement | undefined = undefined;

	// The same resolver as the panel grid: the rail and the dashboard are two
	// views of one list, so order and curation can never drift apart.
	$: tabs = resolveBoardList($boardIndexStore, $boardListSettingsStore).shown;

	// --- Resize (right-edge drag handle) ---
	let dragWidth: number | null = null;
	let resizeStartX = 0;
	let resizeStartWidth = 0;
	$: displayWidth = dragWidth ?? width;
	// The top-docked strip has no width to be narrow in, so it always shows
	// labels; chips are a response to the left rail's compressed width.
	$: mode = dock === "top" ? "label" : railDisplayMode(displayWidth);

	function handleResizeStart(event: PointerEvent) {
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		resizeStartX = event.clientX;
		resizeStartWidth = displayWidth;
		dragWidth = displayWidth;
	}

	function handleResizeMove(event: PointerEvent) {
		if (dragWidth === null) {
			return;
		}
		dragWidth = clampRailWidth(resizeStartWidth + event.clientX - resizeStartX);
	}

	function handleResizeEnd() {
		if (dragWidth === null) {
			return;
		}
		const next = dragWidth;
		dragWidth = null;
		if (next !== width) {
			onSetWidth?.(next);
		}
	}

	function handleTabClick(tab: BoardIndexEntry) {
		// The current board's tab is inert: there is nothing to switch to.
		if (tab.path === currentPath) {
			return;
		}
		onSelect(tab.path);
	}

	// --- Tab drag-reorder ---
	// Mirrors the panel's card reorder: same plugin-owned callback, and the
	// drop materializes the full shown order as the explicit `boardPaths` —
	// the shared write that keeps rail and panel in lockstep (and sheds stale
	// paths, since the shown list only contains discovered boards).
	let draggedPath: string | null = null;
	let dropTarget: { path: string; position: DropPosition } | null = null;

	function handleTabDragStart(tab: BoardIndexEntry, event: DragEvent) {
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = "move";
			event.dataTransfer.setData("text/plain", tab.path);
		}
		draggedPath = tab.path;
	}

	// Midpoint rule along whichever axis the tabs run.
	function tabDropPosition(event: DragEvent): DropPosition {
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		return dock === "top"
			? railDropPositionHorizontal(event.clientX, rect)
			: railDropPosition(event.clientY, rect);
	}

	function handleTabDragOver(path: string, event: DragEvent) {
		if (!onReorderBoards || !draggedPath || draggedPath === path) {
			return;
		}
		dropTarget = { path, position: tabDropPosition(event) };
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "move";
		}
	}

	function handleTabDrop(path: string, event: DragEvent) {
		event.preventDefault();
		const position = tabDropPosition(event);
		const dragged = draggedPath;
		clearDragState();
		if (!onReorderBoards || !dragged || dragged === path) {
			return;
		}
		const shownPaths = tabs.map((tab) => tab.path);
		const nextOrder = movePathRelativeTo(shownPaths, dragged, path, position);
		if (nextOrder !== shownPaths) {
			onReorderBoards(nextOrder);
		}
	}

	function clearDragState() {
		draggedPath = null;
		dropTarget = null;
	}
</script>

<nav
	class="board-rail"
	class:top-dock={dock === "top"}
	style={dock === "left" ? `width: ${displayWidth}px` : undefined}
	aria-label="Kanban boards"
>
	<button
		type="button"
		class="rail-dashboard-toggle"
		class:active={dashboardOpen}
		aria-expanded={dashboardOpen}
		aria-label={dashboardOpen ? "Hide board dashboard" : "Show board dashboard"}
		bind:this={dashboardButtonEl}
		on:click={onToggleDashboard}
	>
		<Icon name="layout-dashboard" size={16} />
		{#if mode === "label"}
			<span class="rail-dashboard-label">Kanban dashboard</span>
		{/if}
	</button>
	<div class="rail-separator" aria-hidden="true"></div>
	<div class="rail-tabs">
		{#each tabs as tab (tab.path)}
			<button
				type="button"
				class="rail-tab"
				class:current={tab.path === currentPath}
				class:is-dragging={draggedPath === tab.path}
				class:drop-before={dropTarget?.path === tab.path &&
					dropTarget.position === "before"}
				class:drop-after={dropTarget?.path === tab.path &&
					dropTarget.position === "after"}
				title={tab.path}
				aria-current={tab.path === currentPath ? "true" : undefined}
				draggable={onReorderBoards !== undefined}
				on:click={() => handleTabClick(tab)}
				on:dragstart={(event) => handleTabDragStart(tab, event)}
				on:dragend={clearDragState}
				on:dragover={(event) => handleTabDragOver(tab.path, event)}
				on:dragleave={() => {
					if (dropTarget?.path === tab.path) {
						dropTarget = null;
					}
				}}
				on:drop={(event) => handleTabDrop(tab.path, event)}
			>
				{#if mode === "chip"}
					<span class="rail-tab-chip">{railChipLabel(tab.name)}</span>
				{:else}
					<span class="rail-tab-label">{tab.name}</span>
				{/if}
			</button>
		{/each}
	</div>
	{#if dock === "left"}
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div
			class="rail-resize-handle"
			aria-hidden="true"
			on:pointerdown={handleResizeStart}
			on:pointermove={handleResizeMove}
			on:pointerup={handleResizeEnd}
			on:pointercancel={handleResizeEnd}
		></div>
	{/if}
</nav>

<style lang="scss">
	// Spans the view's full height (chrome row included), so it carries its
	// own padding: the top offset mirrors the board body's, and left/right
	// stay slim so the min width remains a comfortable button column. The
	// body's own left padding provides the rail→board gap.
	.board-rail {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 0 0 auto;
		box-sizing: border-box;
		min-height: 0;
		padding: var(--size-4-2) var(--size-2-3) var(--size-4-4) var(--size-2-3);
		border-right: 1px solid var(--background-modifier-border);
	}

	// Left-aligned in both modes — content must not shift sideways as the
	// rail resizes across the chip/label threshold, even if that costs a
	// little polish at the fully compressed width. Explicit justify-content
	// because Obsidian's button styling centers content otherwise.
	.rail-dashboard-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: flex-start;
		gap: var(--size-2-3);
		flex: 0 0 auto;
		width: 100%;
		height: 36px;
		min-height: 0;
		box-sizing: border-box;
		margin: 0;
		padding: 0 var(--size-2-3);
		border: var(--input-border-width, 1px) solid var(--background-modifier-border);
		border-radius: var(--radius-m);
		background: var(--background-primary);
		box-shadow: var(--shadow-s);
		color: var(--text-normal);
		cursor: pointer;

		&:hover {
			background: var(--background-modifier-hover);
		}

		&.active {
			background: var(--background-primary);
			border-color: color-mix(in srgb, var(--interactive-accent) 24%, transparent);
			box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 18%, transparent);
		}
	}

	.rail-dashboard-label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--font-ui-small);
		font-weight: 600;
	}

	.rail-separator {
		flex: 0 0 auto;
		height: 1px;
		margin: var(--size-4-2) 0;
		background: var(--background-modifier-border);
	}

	.rail-tabs {
		display: flex;
		flex-direction: column;
		gap: var(--size-2-2);
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
	}

	// justify-content is explicit in both modes: Obsidian's button styling
	// centers content otherwise, which read as centered labels.
	.rail-tab {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		flex: 0 0 auto;
		width: 100%;
		min-height: 32px;
		box-sizing: border-box;
		margin: 0;
		padding: 0 var(--size-2-3);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-m);
		box-shadow: none;
		color: var(--text-muted);
		font-size: var(--font-ui-small);
		text-align: left;
		cursor: pointer;

		&:hover {
			background: var(--background-modifier-hover);
			color: var(--text-normal);
		}

		// The active-tab affordance, matching the dashboard card highlight.
		&.current {
			background: var(--background-secondary);
			border-color: color-mix(in srgb, var(--interactive-accent) 48%, transparent);
			color: var(--text-normal);
			cursor: default;
		}

		&.is-dragging {
			opacity: 0.5;
		}

		// Accent bar on the landing edge — the vertical counterpart of the
		// dashboard card's left/right cue. Declared after .current so the
		// transient drop cue wins over the highlight.
		&.drop-before {
			box-shadow: 0 -3px 0 0 var(--interactive-accent);
		}

		&.drop-after {
			box-shadow: 0 3px 0 0 var(--interactive-accent);
		}
	}

	.rail-tab-chip {
		font-weight: 600;
	}

	.rail-tab-label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	// Top dock (SPEC 0034 phase 2): the same entries as a horizontal strip
	// across the top of the view — dashboard button anchored top-left, tabs
	// in a row after it. Always label mode, no resize; a crowded strip
	// scrolls horizontally rather than wrapping.
	.board-rail.top-dock {
		flex-direction: row;
		align-items: center;
		width: auto;
		padding: var(--size-2-3) var(--size-4-4);
		border-right: none;
		border-bottom: 1px solid var(--background-modifier-border);

		.rail-dashboard-toggle {
			width: auto;
		}

		.rail-separator {
			width: 1px;
			height: 20px;
			margin: 0 var(--size-4-2);
		}

		.rail-tabs {
			flex-direction: row;
			align-items: center;
			min-width: 0;
			overflow-x: auto;
			overflow-y: hidden;
		}

		.rail-tab {
			width: auto;
			max-width: 180px;
		}

		// The landing-edge cue rotates with the tabs: left/right instead of
		// above/below.
		.rail-tab.drop-before {
			box-shadow: -3px 0 0 0 var(--interactive-accent);
		}

		.rail-tab.drop-after {
			box-shadow: 3px 0 0 0 var(--interactive-accent);
		}
	}

	// Straddles the rail's right border; wider than the border so it is
	// actually grabbable. touch-action: none keeps pointer capture working
	// on touch devices.
	.rail-resize-handle {
		position: absolute;
		top: 0;
		bottom: 0;
		right: -4px;
		width: 8px;
		z-index: 10;
		cursor: col-resize;
		touch-action: none;
	}
</style>
