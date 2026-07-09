<script lang="ts">
	import { movePathRelativeTo, type BoardIndexEntry } from "./board_index";

	export let entries: BoardIndexEntry[];
	export let currentPath: string | null;
	export let onSelect: (path: string) => void;
	export let onContextMenu: (entry: BoardIndexEntry, event: MouseEvent) => void;
	export let onReorder: ((orderedPaths: string[]) => void) | undefined = undefined;

	type DropPosition = "before" | "after";

	let draggedPath: string | null = null;
	let dropTarget: { path: string; position: DropPosition } | null = null;

	function handleSelect(entry: BoardIndexEntry) {
		if (entry.path !== currentPath) {
			onSelect(entry.path);
		}
	}

	function handleDragStart(entry: BoardIndexEntry, event: DragEvent) {
		if (!onReorder) {
			return;
		}
		draggedPath = entry.path;
		dropTarget = null;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = "move";
			event.dataTransfer.setData("text/plain", entry.path);
		}
	}

	function handleDragOver(entry: BoardIndexEntry, event: DragEvent) {
		if (!onReorder || !draggedPath || draggedPath === entry.path) {
			return;
		}
		event.preventDefault();
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const position: DropPosition =
			event.clientX > rect.left + rect.width / 2 ? "after" : "before";
		dropTarget = { path: entry.path, position };
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "move";
		}
	}

	function handleDragLeave(entry: BoardIndexEntry) {
		if (dropTarget?.path === entry.path) {
			dropTarget = null;
		}
	}

	function handleDrop(entry: BoardIndexEntry, event: DragEvent) {
		if (!onReorder || !draggedPath) {
			return;
		}
		event.preventDefault();
		const position = dropTarget?.path === entry.path ? dropTarget.position : "before";
		const orderedPaths = movePathRelativeTo(
			entries.map((candidate) => candidate.path),
			draggedPath,
			entry.path,
			position,
		);
		clearDragState();
		onReorder(orderedPaths);
	}

	function clearDragState() {
		draggedPath = null;
		dropTarget = null;
	}
</script>

<div class="board-tabs" role="tablist" aria-label="Kanban boards">
	{#each entries as entry (entry.path)}
		<button
			type="button"
			role="tab"
			class="board-tab"
			class:active={entry.path === currentPath}
			class:is-dragging={entry.path === draggedPath}
			class:is-drop-before={dropTarget?.path === entry.path && dropTarget.position === "before"}
			class:is-drop-after={dropTarget?.path === entry.path && dropTarget.position === "after"}
			aria-selected={entry.path === currentPath}
			title={entry.path}
			draggable={onReorder !== undefined}
			on:click={() => handleSelect(entry)}
			on:contextmenu|preventDefault={(event) => onContextMenu(entry, event)}
			on:dragstart={(event) => handleDragStart(entry, event)}
			on:dragover={(event) => handleDragOver(entry, event)}
			on:dragleave={() => handleDragLeave(entry)}
			on:drop={(event) => handleDrop(entry, event)}
			on:dragend={clearDragState}
		>
			{entry.name}
		</button>
	{/each}
</div>

<style lang="scss">
	.board-tabs {
		display: flex;
		align-items: flex-end;
		gap: var(--size-2-1);
		width: 100%;
		max-width: min(1120px, calc(100% - var(--size-4-8)));
		margin: 0 auto var(--size-4-1) auto;
		overflow-x: auto;
		scrollbar-width: thin;
		border-bottom: 1px solid var(--background-modifier-border);
	}

	.board-tab {
		position: relative;
		flex: 0 0 auto;
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin: 0;
		padding: var(--size-2-2) var(--size-4-2);
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		border-radius: var(--radius-s) var(--radius-s) 0 0;
		box-shadow: none;
		color: var(--text-muted);
		font-size: var(--font-ui-small);
		line-height: 1.2;
		cursor: pointer;

		&:hover {
			background: var(--background-modifier-hover);
			color: var(--text-normal);
		}

		&.active {
			border-bottom-color: var(--interactive-accent);
			color: var(--text-normal);
			font-weight: 600;
		}

		&.is-dragging {
			opacity: 0.5;
		}

		// Drop indicator: an accent bar on the edge the tab would land on.
		&.is-drop-before {
			box-shadow: inset 2px 0 0 var(--interactive-accent);
		}

		&.is-drop-after {
			box-shadow: inset -2px 0 0 var(--interactive-accent);
		}
	}
</style>
