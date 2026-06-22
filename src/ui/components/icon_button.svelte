<script lang="ts">
	import { setIcon } from "obsidian";

	export let icon: string;

	let element: HTMLSpanElement;
	$: {
		if (element) {
			setIcon(element, icon);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			element?.click();
		}
	}
</script>

<button 
	class="clickable-icon"
	bind:this={element} 
	on:click 
	on:keydown={handleKeydown}
	tabindex="0"
	{...$$restProps}
></button>

<style lang="scss">
	button {
		width: 24px !important;
		height: 24px !important;
		display: flex !important;
		justify-content: center !important;
		align-items: center !important;
		border-radius: var(--radius-s) !important;
		transition: background linear 100ms !important;
		cursor: pointer !important;
		background: transparent !important;
		background-color: transparent !important;
		border: none !important;
		box-shadow: none !important;
		padding: 0 !important;
		margin: 0 !important;

		&:hover {
			background-color: var(--background-modifier-hover) !important;
		}

		&:focus-visible {
			outline: 2px solid var(--background-modifier-border-focus) !important;
			outline-offset: 2px !important;
		}
	}
</style>
