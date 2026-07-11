<script lang="ts">
	import type { BoardCard } from "./dashboard_cards";
	import { formatLastModified } from "./dashboard_cards";
	import type { DropPosition } from "../settings/column_reorder";
	import type { BoardTaskCounts } from "./board_stats";

	export let card: BoardCard;
	export let current: boolean;
	export let now: number;
	/** null = still computing (counts land progressively, one board at a time). */
	export let counts: BoardTaskCounts | null = null;
	export let onSelect: (path: string) => void;
	export let onContextMenu: (card: BoardCard, event: MouseEvent) => void;
	// Drag-reorder wiring (shown grid only; the "Other boards" zippy stays
	// alphabetical, so its cards render without these). The panel owns the
	// drag state; the card just reports gestures with a computed position.
	export let reorderable = false;
	export let dragging = false;
	export let dropPosition: DropPosition | null = null;
	export let onDragStart: (() => void) | undefined = undefined;
	export let onDragEnd: (() => void) | undefined = undefined;
	/** Returns whether this card accepts the hovering drag. */
	export let onDragOver: ((position: DropPosition) => boolean) | undefined = undefined;
	export let onDragLeave: (() => void) | undefined = undefined;
	export let onDrop: ((position: DropPosition) => void) | undefined = undefined;

	// The grid wraps, but order is one-dimensional: the pointer's side of
	// the card's horizontal midpoint decides before/after.
	function positionFromEvent(event: DragEvent): DropPosition {
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		return event.clientX > rect.left + rect.width / 2 ? "after" : "before";
	}

	function handleDragOver(event: DragEvent) {
		if (!onDragOver) {
			return;
		}
		if (onDragOver(positionFromEvent(event))) {
			event.preventDefault();
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = "move";
			}
		}
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		onDrop?.(positionFromEvent(event));
	}
</script>

<button
	type="button"
	class="board-card"
	class:current
	class:is-dragging={dragging}
	class:drop-before={dropPosition === "before"}
	class:drop-after={dropPosition === "after"}
	title={card.path}
	aria-current={current ? "true" : undefined}
	draggable={reorderable}
	on:click={() => onSelect(card.path)}
	on:contextmenu|preventDefault={(event) => onContextMenu(card, event)}
	on:dragstart={(event) => {
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = "move";
			event.dataTransfer.setData("text/plain", card.path);
		}
		onDragStart?.();
	}}
	on:dragend={() => onDragEnd?.()}
	on:dragover={handleDragOver}
	on:dragleave={() => onDragLeave?.()}
	on:drop={handleDrop}
>
	<span class="board-card-name">{card.name}</span>
	{#if card.folder}
		<span class="board-card-folder">{card.folder}</span>
	{/if}
	{#if counts}
		<span class="board-card-counts">
			{counts.open} open · {counts.done} done
		</span>
	{:else}
		<span class="board-card-counts pending">Counting…</span>
	{/if}
	{#if card.lastModified !== undefined}
		<span class="board-card-modified">
			Updated {formatLastModified(card.lastModified, now)}
		</span>
	{/if}
</button>

<style lang="scss">
	.board-card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--size-2-2);
		margin: 0;
		padding: var(--size-4-3);
		height: auto;
		background: var(--background-secondary);
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-m);
		box-shadow: none;
		text-align: left;
		cursor: pointer;

		&:hover {
			background: var(--background-modifier-hover);
			border-color: var(--background-modifier-border-hover);
		}

		// The active-tab affordance, relocated from the tab strip.
		&.current {
			border-color: color-mix(in srgb, var(--interactive-accent) 48%, transparent);
			box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 18%, transparent);
		}

		&.is-dragging {
			opacity: 0.5;
		}

		// Accent bar on the edge the drop would land on. Declared after
		// .current so the transient drop cue wins over the highlight ring.
		&.drop-before {
			box-shadow: -3px 0 0 0 var(--interactive-accent);
		}

		&.drop-after {
			box-shadow: 3px 0 0 0 var(--interactive-accent);
		}
	}

	.board-card-name {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-normal);
		font-weight: 600;
	}

	.board-card-folder {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-muted);
		font-size: var(--font-ui-small);
	}

	.board-card-counts {
		color: var(--text-muted);
		font-size: var(--font-ui-small);

		// The pre-count placeholder; same footprint as the counts line so
		// cards don't reflow when the number lands.
		&.pending {
			color: var(--text-faint);
		}
	}

	.board-card-modified {
		color: var(--text-faint);
		font-size: var(--font-ui-smaller);
	}
</style>
