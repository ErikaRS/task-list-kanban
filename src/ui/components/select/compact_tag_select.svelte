<script lang="ts">
	import Select from "svelte-select";
	import { createEventDispatcher } from "svelte";
	import type { SelectOption } from "./selection";

	export let items: string[] = [];
	export let value: string[] = [];
	export let maxSelected: number = 1;
	export let placeholder: string = "";
	export let ariaLabel: string = "Tag selector";

	const dispatch = createEventDispatcher<{ change: string[] }>();

	let filterText = "";
	let selectedItems: SelectOption[] = [];

	$: normalizedItems = [...new Set(items)].map((item) => ({ label: item, value: item }));
	$: hasCustomOption = filterText.trim().length > 0 && !items.some((item) => item === filterText.trim());
	$: options = hasCustomOption
		? [{ label: filterText.trim(), value: filterText.trim() }, ...normalizedItems]
		: normalizedItems;
	$: selectedItemsFromValue = value.map((item) => ({ label: item, value: item }));
	$: {
		const currentValues = selectedItems.map((item) => item.value).join(",");
		const nextValues = selectedItemsFromValue.map((item) => item.value).join(",");
		if (currentValues !== nextValues) {
			selectedItems = selectedItemsFromValue;
		}
	}

	function normalizeSelected(selected: unknown): string[] {
		if (!Array.isArray(selected)) {
			return [];
		}

		const parsed = selected.flatMap((entry) => {
			if (typeof entry === "object" && entry !== null && "value" in entry && typeof (entry as { value: unknown }).value === "string") {
				return [(entry as { value: string }).value.trim()];
			}
			return [];
		}).filter((entry) => entry.length > 0);

		const unique = [...new Set(parsed)];
		if (maxSelected > 0 && unique.length > maxSelected) {
			return unique.slice(unique.length - maxSelected);
		}
		return unique;
	}

	function handleInput(event: CustomEvent<unknown>) {
		value = normalizeSelected(event.detail);
		dispatch("change", value);
	}
</script>

<div class="compact-tag-select">
	<Select
		multiple={true}
		closeListOnChange={false}
		listAutoWidth={true}
		clearable={false}
		showChevron={false}
		placeholder={placeholder}
		items={options}
		value={selectedItems}
		bind:filterText
		inputAttributes={{ "aria-label": ariaLabel }}
		on:input={handleInput}
		--background="var(--background-modifier-form-field, var(--background-primary))"
		--border="var(--border-width) solid var(--background-modifier-border)"
		--border-focused="var(--border-width) solid var(--background-modifier-border-focus)"
		--border-hover="var(--border-width) solid var(--background-modifier-border-hover)"
		--border-radius="var(--input-radius)"
		--item-hover-bg="var(--background-modifier-hover)"
		--list-background="var(--background-modifier-form-field, var(--background-primary))"
		--list-border="var(--border-width) solid var(--background-modifier-border)"
		--multi-item-bg="var(--compact-tag-chip-bg)"
		--multi-item-clear-icon-color="var(--compact-tag-chip-color)"
		--multi-item-color="var(--compact-tag-chip-color)"
		--multi-item-height="auto"
		--multi-item-outline="var(--border-width) solid var(--compact-tag-chip-border)"
		--multi-item-padding="2px 8px"
		--multi-select-input-padding="2px 8px"
		--multi-select-input-margin="0 6px 0 0"
		--input-color="var(--text-normal)"
		--placeholder-color="var(--text-muted)"
	/>
</div>

<style lang="scss">
	.compact-tag-select {
		--compact-tag-select-reserve: 64px;
		--compact-tag-chip-bg: color-mix(
			in srgb,
			var(--interactive-accent) 10%,
			var(--background-modifier-form-field, var(--background-primary))
		);
		--compact-tag-chip-border: color-mix(
			in srgb,
			var(--interactive-accent) 24%,
			var(--background-modifier-border)
		);
		--compact-tag-chip-color: var(--text-normal);

		width: auto;
		display: inline-flex;
		max-width: 100%;
	}

	:global(.compact-tag-select .svelte-select button > svg),
	:global(.compact-tag-select .svelte-select .multi-item-clear > svg) {
		cursor: pointer;
	}

	:global(.compact-tag-select .svelte-select .multi-item) {
		border: var(--border-width) solid var(--compact-tag-chip-border) !important;
		color: var(--compact-tag-chip-color);
		outline: none !important;
		box-shadow: none !important;
		font-size: calc(var(--font-ui-smaller) - 1px);
		line-height: 1;
		min-height: 20px;
		display: inline-flex;
		align-items: center;
		margin: 0 !important;
		border-radius: var(--pill-radius, 8px);
		background-clip: padding-box;
	}

	:global(.compact-tag-select .svelte-select .value-container.multiple) {
		display: flex !important;
		flex-direction: row !important;
		padding: 0 !important;
		min-height: 20px;
		align-items: center;
		gap: 4px;
		flex-wrap: nowrap;
		overflow: visible !important;
	}

	:global(.compact-tag-select .svelte-select .multi-item-text) {
		padding-right: 0 !important;
		display: inline-flex;
		align-items: center;
		line-height: 1;
	}

	:global(.compact-tag-select .svelte-select .multi-item-clear) {
		transform: scale(0.9);
		display: inline-flex;
		align-items: center;
	}

	:global(.compact-tag-select .svelte-select .svelte-select-list) {
		z-index: 5;
		min-width: max-content;
		width: max-content;
		max-width: min(320px, calc(100vw - 32px));
	}

	:global(.compact-tag-select .svelte-select .clear-select) {
		display: none !important;
	}

	:global(.compact-tag-select .svelte-select.focused) {
		transition: box-shadow 150ms ease;
		box-shadow: none !important;
	}

	:global(.compact-tag-select .svelte-select input:focus-visible) {
		outline: none;
	}
	
	:global(.compact-tag-select .svelte-select .item) {
		font-weight: var(--font-normal);
		white-space: nowrap;
	}

	:global(.compact-tag-select .svelte-select) {
		font-size: var(--font-ui-smaller);
		width: auto;
		min-width: 0;
		max-width: 100%;
		background: var(--background-modifier-form-field, var(--background-primary));
		border-radius: var(--input-radius);
	}

	:global(.compact-tag-select .svelte-select .value-container) {
		min-height: 20px;
		overflow: visible !important;
	}

	:global(.compact-tag-select .svelte-select input) {
		padding-top: 0 !important;
		padding-bottom: 0 !important;
		padding-left: 0 !important;
		padding-right: 0 !important;
		margin: 0 !important;
		line-height: 1.1;
		min-width: var(--compact-tag-select-reserve) !important;
		width: var(--compact-tag-select-reserve) !important;
		border: 0 !important;
		background: transparent !important;
		box-shadow: none !important;
		appearance: none !important;
	}

	:global(.compact-tag-select .svelte-select .selectContainer) {
		display: flex;
		align-items: center;
		padding: 2px 6px !important;
		min-height: 24px;
		min-width: calc(var(--compact-tag-select-reserve) + 12px);
		width: auto;
		max-width: 100%;
		box-sizing: border-box;
		flex-wrap: nowrap;
		overflow: visible !important;
		background: var(--background-modifier-form-field, var(--background-primary));
		border-radius: var(--input-radius);
	}

	:global(.compact-tag-select .svelte-select.focused .selectContainer) {
		padding: 2px 6px !important;
	}

</style>
