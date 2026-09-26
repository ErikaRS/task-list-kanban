<script lang="ts">
	import { tick } from "svelte";
	import Icon from "./icon.svelte";
	import type { CardActionMode } from "../selection/card_action_mode";

	export let mode: CardActionMode = "done";
	export let disabled = false;
	export let onChange: (mode: CardActionMode) => void = () => {};
	export let onOpen: () => void = () => {};

	const choices: Array<{ mode: CardActionMode; label: string; icon: string; description: string }> = [
		{ mode: "done", label: "Done", icon: "lucide-square", description: "Cycle or complete task status" },
		{ mode: "advance", label: "Advance", icon: "lucide-arrow-right", description: "Move to the next column" },
		{ mode: "select", label: "Select", icon: "lucide-circle", description: "Select cards for bulk actions" },
	];

	let open = false;
	let root: HTMLDivElement;
	let trigger: HTMLButtonElement;
	$: current = choices.find((choice) => choice.mode === mode) ?? choices[0]!;
	$: if (disabled) open = false;
	function menuItems(): HTMLButtonElement[] {
		return Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
	}

	async function toggleMenu() {
		if (disabled) return;
		open = !open;
		if (open) {
			onOpen();
			await tick();
			menuItems()[choices.findIndex((choice) => choice.mode === mode)]?.focus();
		}
	}

	function selectMode(next: CardActionMode) {
		onChange(next);
		open = false;
		trigger.focus();
	}

	function handleWindowClick(event: MouseEvent) {
		if (open && !root.contains(event.target as Node)) open = false;
	}

	function handleMenuKeydown(event: KeyboardEvent) {
		if (event.key === "Escape") {
			event.preventDefault();
			open = false;
			trigger.focus();
			return;
		}
		if (event.key === "Tab") {
			open = false;
			return;
		}
		if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
		event.preventDefault();
		const items = menuItems();
		const focused = items.indexOf(document.activeElement as HTMLButtonElement);
		const next = event.key === "Home" ? 0
			: event.key === "End" ? items.length - 1
			: event.key === "ArrowDown" ? (focused + 1) % items.length
			: (focused + items.length - 1) % items.length;
		items[next]?.focus();
	}
</script>

<svelte:window on:click={handleWindowClick} />

<div class="card-action-mode-control" bind:this={root}>
	<button type="button" class="card-action-mode-trigger" bind:this={trigger}
		{disabled} aria-label={`Card action mode: ${current.label}`}
		title={`Card action mode: ${current.label} — ${current.description}`}
		aria-haspopup="menu" aria-expanded={open}
		on:click={toggleMenu}>
		<Icon name={current.icon} size={16} />
		<Icon name="lucide-chevron-down" size={12} />
	</button>
	{#if open}
		<div class="card-action-mode-menu" role="menu" tabindex="-1" aria-label="Card action mode" on:keydown={handleMenuKeydown}>
			{#each choices as choice (choice.mode)}
				<button type="button" class="card-action-mode-item"
					class:chosen={mode === choice.mode}
					role="menuitemradio" aria-checked={mode === choice.mode}
					on:click={() => selectMode(choice.mode)}>
					<Icon name={choice.icon} size={18} />
					<span class="mode-copy"><strong>{choice.label}</strong><small>{choice.description}</small></span>
					{#if mode === choice.mode}<Icon name="lucide-check" size={16} />{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style lang="scss">
	.card-action-mode-control { position: relative; display: flex; align-items: center; flex: 0 0 auto; }
	.card-action-mode-trigger {
		display: inline-flex; align-items: center; justify-content: center; gap: 4px;
		height: 26px; min-height: 26px; min-width: 34px; width: auto;
		box-sizing: border-box; margin: 0; padding: 1px 3px;
		border: 0; border-radius: var(--radius-s);
		background: var(--background-primary); color: var(--text-normal); box-shadow: none;
		cursor: pointer; white-space: nowrap;
	}
	.card-action-mode-trigger:hover { background: var(--background-modifier-hover); box-shadow: none; }
	.card-action-mode-trigger:focus-visible, .card-action-mode-item:focus-visible {
		outline: 2px solid var(--background-modifier-border-focus); outline-offset: 2px;
	}
	.card-action-mode-trigger:disabled { opacity: 0.5; cursor: default; }
	.card-action-mode-menu {
		position: absolute; top: calc(100% + 4px); left: 0; z-index: 150;
		display: flex; flex-direction: column; width: max-content; min-width: 230px;
		max-width: min(300px, calc(100vw - 24px)); box-sizing: border-box; padding: 4px;
		border: 1px solid var(--background-modifier-border); border-radius: var(--radius-m);
		background: var(--background-primary); box-shadow: var(--shadow-s);
	}
	.card-action-mode-item {
		display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px;
		box-sizing: border-box; margin: 0; padding: 6px 8px;
		border: 0; border-radius: var(--radius-s); background: transparent;
		color: var(--text-normal); text-align: left; cursor: pointer; box-shadow: none;
	}
	.card-action-mode-item:hover, .card-action-mode-item.chosen { background: var(--background-modifier-hover); box-shadow: none; }
	.mode-copy { display: flex; flex: 1; flex-direction: column; gap: 2px; }
	.mode-copy strong { font-size: var(--font-ui-small); font-weight: var(--font-medium); }
	.mode-copy small { color: var(--text-muted); font-size: var(--font-ui-smaller); }
</style>
