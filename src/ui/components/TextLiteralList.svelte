<script lang="ts">
	import { validateTextLiteral } from "../../parsing/text_literals/text_literals";

	export let value: string[] = [];
	export let onChange: (literals: string[]) => void;

	let draft = "";
	let error: string | null = null;

	function add() {
		error = validateTextLiteral(draft, value);
		if (error) return;
		onChange([...value, draft.trim()]);
		draft = "";
	}

	function move(index: number, direction: -1 | 1) {
		const next = [...value];
		const target = index + direction;
		if (target < 0 || target >= next.length) return;
		[next[index], next[target]] = [next[target]!, next[index]!];
		onChange(next);
	}
</script>

<div class="text-literal-list">
	{#each value as literal, index (literal)}
		<div class="text-literal-row">
			<span class="text-literal-value">{literal}</span>
			<button class="text-literal-action" type="button" disabled={index === 0} aria-label={`Move ${literal} up`} on:click={() => move(index, -1)}>↑</button>
			<button class="text-literal-action" type="button" disabled={index === value.length - 1} aria-label={`Move ${literal} down`} on:click={() => move(index, 1)}>↓</button>
			<button class="text-literal-action" type="button" aria-label={`Remove ${literal}`} on:click={() => onChange(value.filter((_, i) => i !== index))}>×</button>
		</div>
	{/each}
	<div class="text-literal-row">
		<input
			class="text-literal-input"
			type="text"
			aria-label="Text swimlane literal"
			placeholder="@office or [[Project A]]"
			bind:value={draft}
			on:input={() => error = null}
			on:keydown={(event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					add();
				}
			}}
		/>
		<button class="text-literal-action" type="button" on:click={add}>Add</button>
	</div>
	<p class="text-literal-hint">Matches whole tokens with exact case, e.g. @office or [[Project A]].</p>
	{#if error}
		<p class="text-literal-error" role="alert">{error}</p>
	{/if}
</div>
