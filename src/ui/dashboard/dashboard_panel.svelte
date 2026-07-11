<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import type { App, EventRef } from "obsidian";
	import type { Readable } from "svelte/store";
	import type { BoardIndexEntry } from "../boards/board_index";
	import Icon from "../components/icon.svelte";
	import {
		buildBoardCards,
		formatLastModified,
		type BoardStatLookup,
	} from "./dashboard_cards";
	import {
		panelSlide,
		panelTransitionDuration,
		scrimFade,
	} from "./dashboard_panel_state";

	export let app: App;
	export let boardIndexStore: Readable<BoardIndexEntry[]>;
	export let currentPath: string | null;
	export let getBoardStat: BoardStatLookup;
	export let onSelect: (path: string) => void;
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

	let now = Date.now();
	let cards: ReturnType<typeof buildBoardCards> = [];
	$: {
		void refreshTick;
		now = Date.now();
		cards = buildBoardCards($boardIndexStore, getBoardStat);
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
		{#if cards.length === 0}
			<p class="dashboard-empty">
				No kanban boards found in this vault. Create one from a folder's
				context menu with "New kanban".
			</p>
		{:else}
			<div class="dashboard-grid">
				{#each cards as card (card.path)}
					<button
						type="button"
						class="board-card"
						class:current={card.path === currentPath}
						title={card.path}
						aria-current={card.path === currentPath ? "true" : undefined}
						on:click={() => onSelect(card.path)}
					>
						<span class="board-card-name">{card.name}</span>
						{#if card.folder}
							<span class="board-card-folder">{card.folder}</span>
						{/if}
						{#if card.lastModified !== undefined}
							<span class="board-card-modified">
								Updated {formatLastModified(card.lastModified, now)}
							</span>
						{/if}
					</button>
				{/each}
			</div>
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

	.board-card-modified {
		color: var(--text-faint);
		font-size: var(--font-ui-smaller);
	}
</style>
