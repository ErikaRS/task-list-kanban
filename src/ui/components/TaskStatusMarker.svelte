<script lang="ts">
	import Icon from "./icon.svelte";
	import { shouldRenderStatusAsText } from "./task_status_display";

	export let status: string;
	export let isDone = false;
	export let isChecked: boolean | undefined = undefined;
	export let size = 16;

	$: isCustom = status !== " ";
	$: markerSize = `${size}px`;
	$: resolvedIsChecked = isChecked ?? (isCustom || isDone);
</script>

{#if isCustom}
	<span
		class="task-status-marker markdown-rendered markdown-preview-view markdown-source-view mod-cm6"
		style:--task-status-marker-size={markerSize}
	>
		<span
			class="task-list-item HyperMD-task-line"
			class:is-checked={resolvedIsChecked}
			data-task={status}
		>
			{#if shouldRenderStatusAsText(status)}
				<span class="status-text-marker">{status}</span>
			{:else}
				<input
					type="checkbox"
					class="task-list-item-checkbox source-status-checkbox"
					data-task={status}
					checked={resolvedIsChecked}
					tabindex="-1"
					aria-hidden="true"
					style="pointer-events: none;"
				/>
			{/if}
		</span>
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
		display: inline-flex !important;
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

		.task-list-item.HyperMD-task-line {
			display: contents !important;
		}

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
			top: 0 !important;
			left: 0 !important;
			transform: none !important;
			margin: 0 !important;
			padding: 0 !important;
			appearance: none !important;
			-webkit-appearance: none !important;
			box-sizing: border-box !important;
		}
	}
</style>
