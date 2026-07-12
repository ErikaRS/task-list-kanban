<script lang="ts">
	import type { BoardCard } from "./dashboard_cards";
	import { formatLastModified } from "./dashboard_cards";
	import type { DropPosition } from "../settings/column_reorder";
	import type { BoardTaskCounts } from "./board_stats";
	import Icon from "../components/icon.svelte";

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

	// Per-card and transient, like the panel's own zippy.
	let columnsExpanded = false;
	$: attention = counts?.attention;
	$: hasAttention = attention !== undefined &&
		(attention.overdue > 0 || attention.dueToday > 0);

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

<!--
	The root is the pointer surface (whole-card click, drag, context menu);
	keyboard access rides on the inner main button, whose Enter-activated
	click bubbles here — one select handler, no double-fire. A single
	<button> can't hold the columns zippy: interactive elements don't nest.
-->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<!-- svelte-ignore a11y-click-events-have-key-events -->
<div
	class="board-card"
	class:current
	class:is-dragging={dragging}
	class:drop-before={dropPosition === "before"}
	class:drop-after={dropPosition === "after"}
	title={card.path}
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
	<button
		type="button"
		class="board-card-main"
		aria-current={current ? "true" : undefined}
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
		{#if hasAttention && attention}
			<span class="board-card-attention">
				{#if attention.overdue > 0}
					<span class="board-card-attention-badge overdue">
						{attention.overdue} overdue
					</span>
				{/if}
				{#if attention.dueToday > 0}
					<span class="board-card-attention-badge due-today">
						{attention.dueToday} due today
					</span>
				{/if}
			</span>
		{/if}
		{#if card.lastModified !== undefined}
			<span class="board-card-meta">
				Updated {formatLastModified(card.lastModified, now)}
			</span>
		{/if}
		{#if card.lastOpened !== undefined}
			<span class="board-card-meta">
				Opened {formatLastModified(card.lastOpened, now)}
			</span>
		{/if}
	</button>
	{#if counts && counts.columns.length > 0}
		<button
			type="button"
			class="board-card-columns-toggle"
			aria-expanded={columnsExpanded}
			on:click|stopPropagation={() => (columnsExpanded = !columnsExpanded)}
		>
			<Icon name={columnsExpanded ? "chevron-down" : "chevron-right"} size={14} />
			<span>Columns</span>
		</button>
		{#if columnsExpanded}
			<ul class="board-card-columns">
				{#each counts.columns as columnCount}
					<li>
						<span class="board-card-column-label">{columnCount.label}</span>
						<span class="board-card-column-count">{columnCount.count}</span>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<style lang="scss">
	.board-card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--size-2-2);
		margin: 0;
		padding: var(--size-4-3);
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

	// A button for keyboard reach only — the root supplies the card look.
	.board-card-main {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--size-2-2);
		width: 100%;
		height: auto;
		margin: 0;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 0;
		box-shadow: none;
		text-align: left;
		cursor: pointer;
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

	.board-card-attention {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-2-2);
	}

	.board-card-attention-badge {
		display: inline-flex;
		align-items: center;
		min-height: 18px;
		padding: 1px var(--size-2-2);
		border-radius: var(--radius-s);
		font-size: var(--font-ui-smaller);
		font-weight: 600;
		line-height: 1.3;

		&.overdue {
			color: var(--text-on-accent);
			background: var(--text-error);
		}

		&.due-today {
			color: var(--text-accent);
			background: color-mix(in srgb, var(--interactive-accent) 14%, transparent);
		}
	}

	// The Updated/Opened footer lines.
	.board-card-meta {
		color: var(--text-faint);
		font-size: var(--font-ui-smaller);
	}

	.board-card-columns-toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--size-2-2);
		margin: 0;
		padding: 0;
		height: auto;
		background: transparent;
		border: none;
		box-shadow: none;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
		font-weight: 600;
		cursor: pointer;

		&:hover {
			color: var(--text-normal);
		}
	}

	.board-card-columns {
		width: 100%;
		margin: 0;
		padding: 0;
		list-style: none;

		li {
			display: flex;
			justify-content: space-between;
			gap: var(--size-4-2);
			color: var(--text-muted);
			font-size: var(--font-ui-small);
		}
	}

	.board-card-column-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.board-card-column-count {
		color: var(--text-normal);
		font-variant-numeric: tabular-nums;
	}
</style>
