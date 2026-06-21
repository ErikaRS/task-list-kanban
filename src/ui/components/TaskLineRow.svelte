<script lang="ts">
	export let depth = 0;
	export let hasActions = false;
	export let variant: "source" | "card" = "source";
</script>

<div
	class="task-line-row"
	class:has-actions={hasActions}
	class:card-variant={variant === "card"}
	style:--task-line-depth={depth}
>
	<div class="task-line-marker">
		<slot name="marker" />
	</div>
	<div class="task-line-content">
		<slot />
	</div>
	{#if hasActions}
		<div class="task-line-actions">
			<slot name="actions" />
		</div>
	{/if}
</div>

<style lang="scss">
	.task-line-row {
		--task-line-base-padding-left: calc(var(--size-4-2) + 8px);
		--task-line-indent-step: 1.65rem;
		--task-line-marker-size: 20px;
		--task-line-row-height: 1.3em;
		--task-line-column-gap: var(--size-2-2);
		--task-line-block-padding: 0 var(--size-4-2) var(--size-2-1)
			calc(
				var(--task-line-base-padding-left) +
					(var(--task-line-depth) * var(--task-line-indent-step))
			);

		display: grid;
		grid-template-columns: var(--task-line-marker-size) minmax(0, 1fr);
		column-gap: var(--task-line-column-gap);
		align-items: start;
		padding: var(--task-line-block-padding);

		&.has-actions {
			grid-template-columns: var(--task-line-marker-size) minmax(0, 1fr) auto;
		}

		&.card-variant {
			--task-line-column-gap: var(--size-2-3);
			--task-line-row-height: var(--task-content-line-height, 1.5rem);
			--task-line-block-padding: var(--size-4-2) var(--size-4-2)
				var(--size-4-2)
				calc(
					var(--task-line-base-padding-left) +
						(var(--task-line-depth) * var(--task-line-indent-step))
				);
		}
	}

	.task-line-marker,
	.task-line-actions {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 0;
		height: var(--task-line-row-height);
	}

	.task-line-content {
		display: block;
		min-width: 0;
		min-height: var(--task-line-row-height);
	}

	.task-line-actions {
		justify-content: flex-end;
	}
</style>
