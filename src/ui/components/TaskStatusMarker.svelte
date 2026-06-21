<script lang="ts">
	import Icon from "./icon.svelte";
	import { shouldRenderStatusAsText } from "./task_status_display";

	export let status: string;
	export let isDone = false;
	export let isChecked: boolean | undefined = undefined;
	export let size = 16;

	$: isCustom = status !== " ";
	$: markerSize = `${size}px`;
	$: resolvedIsChecked = isChecked ?? isDone;
</script>

{#if isCustom}
	<span
		class="task-status-marker markdown-rendered markdown-preview-view task-list-item is-checked"
		class:is-done={isDone}
		class:is-fallback-checked={resolvedIsChecked}
		data-task={status}
		style:--task-status-marker-size={markerSize}
	>
		{#if shouldRenderStatusAsText(status)}
			<span class="status-text-marker">{status}</span>
		{:else}
			<span
				class="task-list-item-checkbox source-status-checkbox"
				data-task={status}
				aria-hidden="true"
			></span>
		{/if}
	</span>
{:else}
	<Icon
		name={isDone ? "lucide-check-square" : "lucide-square"}
		size={size}
		opacity={isDone ? 1 : 0.5}
	/>
{/if}

<style lang="scss">
	.task-status-marker {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--task-status-marker-size);
		height: var(--task-status-marker-size);
		min-width: var(--task-status-marker-size);
		min-height: var(--task-status-marker-size);
		overflow: visible;
		margin: 0 !important;
		padding: 0 !important;
		text-indent: 0 !important;
		line-height: 1 !important;
		list-style: none !important;
		vertical-align: middle;

		.source-status-checkbox,
		.status-text-marker {
			display: inline-flex !important;
			align-items: center !important;
			justify-content: center !important;
			box-sizing: border-box;
			width: var(--task-status-marker-size) !important;
			height: var(--task-status-marker-size) !important;
			min-width: var(--task-status-marker-size) !important;
			min-height: var(--task-status-marker-size) !important;
			margin: 0 !important;
			padding: 0 !important;
			pointer-events: none;
			text-indent: 0 !important;
			line-height: 1 !important;
			vertical-align: middle !important;
		}

		.status-text-marker {
			font-size: calc(var(--task-status-marker-size) - 3px);
		}

		.source-status-checkbox {
			position: relative !important;
			border: 2px solid var(--checkbox-border-color, var(--background-modifier-border-hover));
			border-radius: var(--checkbox-radius, 4px);
			background: var(--checkbox-marker-color, transparent);
		}

		&.is-fallback-checked .source-status-checkbox {
			border-color: var(--checkbox-color, var(--interactive-accent));
			background: var(--checkbox-color, var(--interactive-accent));
		}

		&.is-fallback-checked .source-status-checkbox::after {
			content: "";
			display: block;
			width: calc(var(--task-status-marker-size) * 0.28);
			height: calc(var(--task-status-marker-size) * 0.5);
			border: solid var(--checkbox-check-color, var(--text-on-accent));
			border-width: 0 2px 2px 0;
			transform: translateY(-1px) rotate(45deg);
		}
	}
</style>
