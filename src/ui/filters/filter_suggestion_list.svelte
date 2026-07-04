<script lang="ts">
	import type { FilterSuggestion } from "./filter_suggestions";

	export let suggestions: FilterSuggestion[];
	export let selectedIndex: number;
	export let onAccept: (suggestion: FilterSuggestion) => void;

	let listEl: HTMLUListElement | undefined;

	$: if (listEl && selectedIndex >= 0) {
		listEl.children[selectedIndex]?.scrollIntoView({ block: "nearest" });
	}
</script>

<!--
	Plain-text suggestion list anchored under its input (the host wraps the
	input in a position:relative container). mousedown is prevented so the
	input keeps focus and blur doesn't dismiss the list before click fires.
-->
<ul class="filter-suggestions" role="listbox" bind:this={listEl}>
	{#each suggestions as suggestion, index}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
		<li
			role="option"
			aria-selected={index === selectedIndex}
			class:selected={index === selectedIndex}
			on:mousedown|preventDefault
			on:click={() => onAccept(suggestion)}
		>
			<span class="suggestion-label">{suggestion.label}</span>
			{#if suggestion.detail}
				<span class="suggestion-detail">{suggestion.detail}</span>
			{/if}
		</li>
	{/each}
</ul>

<style lang="scss">
	.filter-suggestions {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 300;
		margin: var(--size-2-1) 0 0 0;
		padding: var(--size-2-1);
		list-style: none;
		background: var(--background-primary);
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow-s);
		max-height: 240px;
		overflow-y: auto;

		li {
			display: flex;
			align-items: baseline;
			gap: var(--size-2-3);
			padding: var(--size-2-2) var(--size-2-3);
			border-radius: var(--radius-s);
			cursor: pointer;

			&:hover,
			&.selected {
				background: var(--background-modifier-hover);
			}

			.suggestion-label {
				flex: 0 1 auto;
				min-width: 0;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
				font-size: var(--font-ui-small);
			}

			.suggestion-detail {
				flex: 0 0 auto;
				margin-left: auto;
				color: var(--text-muted);
				font-size: var(--font-ui-smaller);
			}
		}
	}
</style>
