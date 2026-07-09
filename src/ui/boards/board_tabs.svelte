<script lang="ts">
	import type { BoardIndexEntry } from "./board_index";

	export let entries: BoardIndexEntry[];
	export let currentPath: string | null;
	export let onSelect: (path: string) => void;

	function handleSelect(entry: BoardIndexEntry) {
		if (entry.path !== currentPath) {
			onSelect(entry.path);
		}
	}
</script>

<div class="board-tabs" role="tablist" aria-label="Kanban boards">
	{#each entries as entry (entry.path)}
		<button
			type="button"
			role="tab"
			class="board-tab"
			class:active={entry.path === currentPath}
			aria-selected={entry.path === currentPath}
			title={entry.path}
			on:click={() => handleSelect(entry)}
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
	}
</style>
