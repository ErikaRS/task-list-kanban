<script lang="ts">
	import { createEventDispatcher, onDestroy, onMount, tick } from "svelte";

	export let items: string[] = [];
	export let value: string[] = [];
	export let maxSelected: number = 1;
	export let placeholder: string = "";
	export let ariaLabel: string = "Tag selector";

	const dispatch = createEventDispatcher<{ change: string[] }>();
	const listboxId = `compact-tag-select-${Math.random().toString(36).slice(2)}`;

	let filterText = "";
	let insertIndex = 0;
	let isOpen = false;
	let inputEl: HTMLInputElement | undefined;
	let rootEl: HTMLDivElement | undefined;
	let dragIndex: number | null = null;
	let dragOverIndex: number | null = null;

	$: normalizedItems = [...new Set(items.map((item) => item.trim()).filter(Boolean))]
		.sort((a, b) => a.localeCompare(b));
	$: selectedValues = normalizeValues(value);
	$: selectedLowercase = new Set(selectedValues.map((item) => item.toLowerCase()));
	$: trimmedFilter = filterText.trim();
	$: matchingItems = normalizedItems
		.filter((item) => !selectedLowercase.has(item.toLowerCase()))
		.filter((item) => item.toLowerCase().includes(trimmedFilter.toLowerCase()));
	$: hasCustomOption = trimmedFilter.length > 0 && !selectedLowercase.has(trimmedFilter.toLowerCase())
		&& !normalizedItems.some((item) => item.toLowerCase() === trimmedFilter.toLowerCase());
	$: options = hasCustomOption ? [trimmedFilter, ...matchingItems] : matchingItems;
	$: visiblePlaceholder = selectedValues.length === 0 ? placeholder : "";
	$: inputWidthCh = Math.max(
		(filterText || visiblePlaceholder).length + 1,
		selectedValues.length === 0 ? 8 : 1,
	);
	$: if (insertIndex > selectedValues.length) {
		insertIndex = selectedValues.length;
	}

	onMount(() => {
		document.addEventListener("pointerdown", handleDocumentPointerDown);
	});

	onDestroy(() => {
		document.removeEventListener("pointerdown", handleDocumentPointerDown);
	});

	function handleDocumentPointerDown(event: PointerEvent) {
		if (rootEl && !rootEl.contains(event.target as Node)) {
			isOpen = false;
		}
	}

	function normalizeValues(values: string[]): string[] {
		const seen = new Set<string>();
		const normalized: string[] = [];

		for (const rawValue of values) {
			const entry = rawValue.trim();
			const key = entry.toLowerCase();
			if (!entry || seen.has(key)) continue;
			seen.add(key);
			normalized.push(entry);
		}

		return maxSelected > 0 ? normalized.slice(-maxSelected) : normalized;
	}

	function commit(nextValue: string[], nextInsertIndex = insertIndex) {
		const normalized = normalizeValues(nextValue);
		value = normalized;
		insertIndex = Math.min(Math.max(nextInsertIndex, 0), normalized.length);
		dispatch("change", normalized);
	}

	async function focusAt(index: number) {
		insertIndex = Math.min(Math.max(index, 0), selectedValues.length);
		isOpen = true;
		await tick();
		inputEl?.focus();
	}

	function addTag(rawTag: string) {
		const tag = rawTag.trim();
		if (!tag) return;

		const existingIndex = selectedValues.findIndex((item) => item.toLowerCase() === tag.toLowerCase());
		const insertionIndex = existingIndex >= 0 && existingIndex < insertIndex
			? insertIndex - 1
			: insertIndex;
		const withoutExisting = selectedValues.filter((item) => item.toLowerCase() !== tag.toLowerCase());
		const nextValue = [
			...withoutExisting.slice(0, insertionIndex),
			tag,
			...withoutExisting.slice(insertionIndex),
		];
		const nextInsertIndex = maxSelected === 1 ? 1 : insertionIndex + 1;
		filterText = "";
		isOpen = true;
		commit(nextValue, nextInsertIndex);
		insertIndex = nextInsertIndex;
		void tick().then(() => inputEl?.focus());
	}

	function removeTag(index: number) {
		const nextValue = selectedValues.filter((_, currentIndex) => currentIndex !== index);
		commit(nextValue, index);
		void focusAt(index);
	}

	function handleInputFocus() {
		isOpen = true;
	}

	function handleInputKeydown(event: KeyboardEvent) {
		if (event.key === "Enter" || event.key === ",") {
			event.preventDefault();
			addTag(trimmedFilter || options[0] || "");
		} else if (event.key === "Backspace" && filterText === "" && insertIndex > 0) {
			event.preventDefault();
			removeTag(insertIndex - 1);
		} else if (event.key === "ArrowLeft" && filterText === "" && insertIndex > 0) {
			event.preventDefault();
			void focusAt(insertIndex - 1);
		} else if (event.key === "ArrowRight" && filterText === "" && insertIndex < selectedValues.length) {
			event.preventDefault();
			void focusAt(insertIndex + 1);
		} else if (event.key === "Escape") {
			isOpen = false;
		}
	}

	function handleShellKeydown(event: KeyboardEvent) {
		if (event.target === inputEl) return;
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			void focusAt(insertIndex);
		}
	}

	function getInsertIndexFromPoint(clientX: number, clientY: number): number {
		const chips = rootEl ? Array.from(rootEl.querySelectorAll<HTMLElement>(".tag-chip")) : [];
		for (let index = 0; index < chips.length; index += 1) {
			const rect = chips[index]!.getBoundingClientRect();
			if (clientY < rect.top) return index;
			if (clientY <= rect.bottom) {
				return clientX < rect.left + rect.width / 2 ? index : index + 1;
			}
		}
		return selectedValues.length;
	}

	function handleShellClick(event: MouseEvent) {
		if (event.target === inputEl) return;
		void focusAt(getInsertIndexFromPoint(event.clientX, event.clientY));
	}

	function reorderTag(fromIndex: number, toIndex: number) {
		if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= selectedValues.length) return;
		const nextValue = [...selectedValues];
		const [moved] = nextValue.splice(fromIndex, 1);
		if (!moved) return;
		const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
		nextValue.splice(adjustedIndex, 0, moved);
		commit(nextValue, adjustedIndex + 1);
	}

	function handleDragStart(event: DragEvent, index: number) {
		dragIndex = index;
		event.dataTransfer?.setData("text/plain", selectedValues[index] ?? "");
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = "move";
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		dragOverIndex = getInsertIndexFromPoint(event.clientX, event.clientY);
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "move";
		}
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		if (dragIndex !== null) {
			reorderTag(dragIndex, dragOverIndex ?? getInsertIndexFromPoint(event.clientX, event.clientY));
		}
		dragIndex = null;
		dragOverIndex = null;
	}

	function handleDragEnd() {
		dragIndex = null;
		dragOverIndex = null;
	}
</script>

<div class="compact-tag-select" bind:this={rootEl}>
	<div
		class="select-shell"
		class:focused={isOpen}
		role="combobox"
		aria-controls={listboxId}
		aria-expanded={isOpen ? "true" : "false"}
		aria-haspopup="listbox"
		tabindex="0"
		on:click={handleShellClick}
		on:keydown={handleShellKeydown}
		on:dragover={handleDragOver}
		on:drop={handleDrop}
	>
		{#if selectedValues.length === 0}
			<input
				bind:this={inputEl}
				bind:value={filterText}
				placeholder={visiblePlaceholder}
				aria-label={ariaLabel}
				style:width={`${inputWidthCh}ch`}
				on:focus={handleInputFocus}
				on:keydown={handleInputKeydown}
			/>
		{:else}
			{#each selectedValues as tag, index (tag.toLowerCase())}
				{#if insertIndex === index}
					<input
						bind:this={inputEl}
						bind:value={filterText}
						placeholder={visiblePlaceholder}
						aria-label={ariaLabel}
						style:width={`${inputWidthCh}ch`}
						on:focus={handleInputFocus}
						on:keydown={handleInputKeydown}
					/>
				{/if}
				<span
					class="tag-chip"
					class:dragging={dragIndex === index}
					role="listitem"
					draggable="true"
					on:dragstart={(event) => handleDragStart(event, index)}
					on:dragend={handleDragEnd}
				>
					<span class="tag-chip-text">{tag}</span>
					<button
						type="button"
						class="tag-chip-remove"
						aria-label={`Remove ${tag}`}
						on:click|stopPropagation={() => removeTag(index)}
					>
						×
					</button>
				</span>
			{/each}
			{#if insertIndex === selectedValues.length}
				<input
					bind:this={inputEl}
					bind:value={filterText}
					placeholder={visiblePlaceholder}
					aria-label={ariaLabel}
					style:width={`${inputWidthCh}ch`}
					on:focus={handleInputFocus}
					on:keydown={handleInputKeydown}
				/>
			{/if}
		{/if}
	</div>

	{#if isOpen && options.length > 0}
		<ul id={listboxId} class="option-list" role="listbox">
			{#each options as option (option.toLowerCase())}
				<li>
					<button
						type="button"
						role="option"
						aria-selected="false"
						on:mousedown|preventDefault
						on:click={() => addTag(option)}
					>
						{option}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
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

		position: relative;
		width: 100%;
		min-width: 0;
		max-width: 100%;
		font-size: var(--compact-tag-select-font-size, var(--font-ui-smaller));
	}

	.select-shell {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-wrap: wrap;
		width: 100%;
		min-height: var(--compact-tag-select-height, 24px);
		min-width: 0;
		max-width: 100%;
		box-sizing: border-box;
		padding: 2px 8px;
		border: var(--border-width) solid var(--background-modifier-border);
		border-radius: var(--input-radius);
		background: var(--background-modifier-form-field, var(--background-primary));
		color: var(--text-normal);

		&.focused {
			border-color: var(--background-modifier-border-focus);
		}
	}

	input {
		flex: 0 1 auto;
		min-width: 1ch;
		max-width: 100%;
		border: 0 !important;
		background: transparent !important;
		box-shadow: none !important;
		appearance: none !important;
		color: var(--text-normal);
		font-size: var(--compact-tag-select-font-size, var(--font-ui-smaller));
		line-height: calc(var(--compact-tag-select-height, 24px) - 6px);
		margin: 0;
		padding: 0;
		caret-color: var(--text-normal);

		&::placeholder {
			color: var(--text-faint);
		}

		&:focus-visible {
			outline: none;
		}
	}

	.tag-chip {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		min-height: 20px;
		border: var(--border-width) solid var(--compact-tag-chip-border);
		border-radius: var(--pill-radius, 8px);
		background: var(--compact-tag-chip-bg);
		color: var(--compact-tag-chip-color);
		cursor: grab;
		line-height: 1;
		font-size: calc(var(--font-ui-smaller) - 1px);
		padding: 2px 4px 2px 8px;

		&.dragging {
			opacity: 0.45;
			cursor: grabbing;
		}
	}

	.tag-chip-text {
		display: inline-flex;
		align-items: center;
		line-height: 1;
	}

	.tag-chip-remove {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--compact-tag-chip-color);
		cursor: pointer;
		box-shadow: none;
	}

	.option-list {
		position: absolute;
		top: calc(100% + 2px);
		left: 0;
		z-index: 1000;
		min-width: 100%;
		width: max-content;
		max-width: min(320px, calc(100vw - 32px));
		margin: 0;
		padding: 4px 0;
		list-style: none;
		border: var(--border-width) solid var(--background-modifier-border);
		border-radius: var(--radius-s);
		background: var(--background-modifier-form-field, var(--background-primary));
		box-shadow: var(--shadow-s);

		button {
			display: block;
			width: 100%;
			border: 0;
			border-radius: 0;
			background: transparent;
			box-shadow: none;
			color: var(--text-normal);
			cursor: pointer;
			font-size: var(--font-ui-smaller);
			font-weight: var(--font-normal);
			padding: var(--size-2-2) var(--size-4-3);
			text-align: left;
			white-space: nowrap;

			&:hover {
				background: var(--background-modifier-hover);
			}
		}
	}
</style>
