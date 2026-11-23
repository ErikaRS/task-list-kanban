<!--
	Read-only embedded board (SPEC 0057): renderer #2 of a board.

	Renderer #1 is the full board: main.svelte → board_matrix_desktop.svelte
	(DesktopMatrixGrid, DesktopAxisHeader, BoardCell) for Table, and
	board_list.svelte for List. A visible change to either must be mirrored
	here or deliberately omitted; see the embed parity matrix in
	README.architecture.md. Which cards go where comes from
	board_presentation.ts, and card display from TaskCardBody, so neither is
	re-derived here. This component never writes and has no task actions.
-->
<script lang="ts">
	import type { App } from "obsidian";
	import type { AxisBucket } from "../board/board_matrix";
	import { deriveDesktopMatrixProjection } from "../board/desktop_matrix_projection";
	import GroupLabel from "../board/GroupLabel.svelte";
	import TaskCardBody from "../components/TaskCardBody.svelte";
	import type { Task } from "../tasks/task";
	import { getBoardTaskCount } from "../board_counts";
	import { PropertyDisplayMode } from "../settings/settings_store";
	import { PropertySchemaOption } from "../../parsing/properties/property_schema";
	import type { Readable } from "svelte/store";
	import type { EmbedState } from "./embedded_board_controller";

	export let app: App;
	export let stateStore: Readable<EmbedState | { kind: "idle" }>;
	export let onOpenBoard: (e: MouseEvent | KeyboardEvent) => void = () => {};

	$: state = $stateStore;
	$: height = state.kind === "ready" ? state.height : 420;
	$: ready = state.kind === "ready" ? state : undefined;
	$: settings = ready?.settings;
	$: matrix = ready?.presentation.renderedMatrix;
	$: projection = ready && matrix
		? deriveDesktopMatrixProjection(matrix, ready.presentation.isVerticalFlow)
		: undefined;
	$: columnWidth = `${settings?.columnWidth ?? 300}px`;
	$: tracks = projection?.visualColumns
		.map((bucket) => (bucket.collapsed ? "var(--embed-folded-width)" : columnWidth))
		.join(" ") ?? "";
	$: tasksByPrimary = matrix
		? Object.fromEntries(matrix.primaryAxis.map((bucket) => [
			bucket.id, Object.values(matrix.cells[bucket.id] ?? {}).flatMap((cell) => cell.tasks),
		]))
		: {};
	$: tasksBySecondary = matrix
		? Object.fromEntries(matrix.secondaryAxis.map((bucket) => [
			bucket.id, matrix.primaryAxis.flatMap((primary) => matrix.cells[primary.id]?.[bucket.id]?.tasks ?? []),
		]))
		: {};

	// Same counts as the board's headers: a column counts every card in it,
	// a swimlane counts open tasks only (DesktopAxisHeader / ColumnHeader).
	function bucketCount(bucket: AxisBucket): number {
		return bucket.kind === "column"
			? (tasksByPrimary[bucket.id] as Task[] | undefined)?.length ?? 0
			: getBoardTaskCount((tasksBySecondary[bucket.id] as Task[] | undefined) ?? []);
	}
	function countLabel(bucket: AxisBucket): string {
		const count = bucketCount(bucket);
		return bucket.collapsed ? `${count}` : count === 1 ? "1 task" : `${count} tasks`;
	}

	function isLinkClick(e: Event): boolean {
		return e.target instanceof Element && e.target.closest("a") !== null;
	}
	function handleCardClick(e: MouseEvent) {
		if (isLinkClick(e)) return;
		onOpenBoard(e);
	}
	function handleCardKeydown(e: KeyboardEvent) {
		if (e.key === "Enter" && !isLinkClick(e)) {
			e.preventDefault();
			onOpenBoard(e);
		}
	}
	// Live Preview: keep the editor from moving its cursor into the block.
	function stopEditorFocus(e: Event) {
		e.stopPropagation();
	}
</script>

<div
	class="tlk-embed"
	contenteditable="false"
	role="presentation"
	on:mousedown={stopEditorFocus}
	on:click={stopEditorFocus}
>
	{#if state.kind === "error"}
		<div class="tlk-embed-message is-error" role="alert">
			<div class="tlk-embed-message-title">{state.title}</div>
			{#each state.messages as message}
				<div class="tlk-embed-message-detail">{message}</div>
			{/each}
		</div>
	{:else if ready && projection}
		<div class="tlk-embed-header">
			<button type="button" class="tlk-embed-board-name" title="Open board" on:click={(e) => onOpenBoard(e)}>
				{ready.boardName}
			</button>
			<span class="tlk-embed-count">{ready.presentation.countLabel}</span>
			{#if ready.overrideLabel}
				<span class="tlk-embed-chip" title="Applies to this embed only">{ready.overrideLabel}</span>
			{/if}
		</div>
		{#each ready.warnings as warning}
			<div class="tlk-embed-warning">{warning}</div>
		{/each}
		<div class="tlk-embed-scroll" style:max-height="{height}px">
			<div class="tlk-embed-grid" style:grid-template-columns={tracks}>
				{#if projection.showColumnHeaders}
					{#each projection.visualColumns as bucket (bucket.id)}
						<div
							class="tlk-embed-column-header"
							class:collapsed={bucket.collapsed}
							style:--embed-category-color={bucket.kind === "column" ? bucket.meta?.color : undefined}
							title={bucket.label}
						>
							{#if bucket.kind === "column"}
								<div class="tlk-embed-accent" aria-hidden="true"></div>
							{/if}
							<span class="tlk-embed-axis-label">
								{#if bucket.kind === "group"}
									<GroupLabel {bucket} />
								{:else}
									{bucket.label}
								{/if}
							</span>
							<span class="tlk-embed-axis-count">{countLabel(bucket)}</span>
						</div>
					{/each}
				{/if}
				{#each projection.visualRows as row (row.id)}
					{#if projection.showRowHeaders}
						<div
							class="tlk-embed-row-header"
							class:collapsed={row.collapsed}
							style:--embed-category-color={row.kind === "column" ? row.meta?.color : undefined}
						>
							<span class="tlk-embed-axis-label">
								{#if row.kind === "group"}
									<GroupLabel bucket={row} />
								{:else}
									{row.label}
								{/if}
							</span>
							<span class="tlk-embed-axis-count">
								{row.kind === "column" ? countLabel(row) : countLabel({ ...row, collapsed: false })}
							</span>
						</div>
					{/if}
					{#if !row.collapsed}
						{#each projection.visualColumns as column (column.id)}
							{@const { cell, primaryBucket } = projection.getCell(column, row)}
							<div class="tlk-embed-cell" class:collapsed={column.collapsed}>
								{#if !column.collapsed}
									{#each cell.tasks as task (task.id)}
										<div
											class="tlk-embed-card"
											role="link"
											tabindex="0"
											on:click={handleCardClick}
											on:keydown={handleCardKeydown}
										>
											<TaskCardBody
												{app}
												{task}
												interactive={false}
												showFilepath={settings?.showFilepath ?? true}
												propertyDisplay={settings?.propertyDisplay ?? PropertyDisplayMode.None}
												propertySchemaOption={settings?.propertySchema ?? PropertySchemaOption.None}
												consolidateTags={settings?.consolidateTags ?? false}
												excludedTags={settings?.excludedTags ?? []}
												treatNestedTasksAsSubtasks={settings?.treatNestedTasksAsSubtasks ?? false}
												accentColor={primaryBucket.meta?.color}
											/>
										</div>
									{/each}
								{/if}
							</div>
						{/each}
					{/if}
				{/each}
			</div>
		</div>
	{:else}
		<div class="tlk-embed-message">Loading board…</div>
	{/if}
</div>

<style>
	.tlk-embed {
		--embed-folded-width: 28px;
		border: var(--border-width) solid var(--background-modifier-border);
		border-radius: var(--radius-m);
		background: var(--background-primary);
		overflow: hidden;
		font-size: var(--font-text-size);
	}
	.tlk-embed-header {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--size-2-3) var(--size-4-2);
		padding: var(--size-2-3) var(--size-4-3);
		border-bottom: var(--border-width) solid var(--background-modifier-border);
		background: var(--background-secondary);
	}
	.tlk-embed-board-name {
		all: unset;
		cursor: pointer;
		font-weight: var(--font-semibold);
		color: var(--text-normal);
	}
	.tlk-embed-board-name:hover {
		color: var(--text-accent);
	}
	.tlk-embed-board-name:focus-visible {
		outline: 2px solid var(--background-modifier-border-focus);
		outline-offset: 2px;
		border-radius: var(--radius-s);
	}
	.tlk-embed-count {
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}
	.tlk-embed-chip {
		padding: 0 var(--size-4-2);
		border: var(--border-width) solid var(--background-modifier-border);
		border-radius: var(--radius-l);
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}
	.tlk-embed-warning {
		padding: var(--size-2-2) var(--size-4-3);
		color: var(--text-warning);
		font-size: var(--font-ui-smaller);
		border-bottom: var(--border-width) solid var(--background-modifier-border);
	}
	.tlk-embed-message {
		padding: var(--size-4-3);
		color: var(--text-muted);
	}
	.tlk-embed-message.is-error {
		color: var(--text-normal);
		border-left: 3px solid var(--text-error);
	}
	.tlk-embed-message-title {
		font-weight: var(--font-semibold);
	}
	.tlk-embed-message-detail {
		color: var(--text-muted);
		font-size: var(--font-ui-small);
	}
	.tlk-embed-scroll {
		overflow: auto;
	}
	.tlk-embed-grid {
		display: grid;
		width: max-content;
		min-width: 100%;
	}
	.tlk-embed-column-header {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		align-items: baseline;
		gap: var(--size-4-2);
		min-width: 0;
		padding: 10px 12px 6px;
		background: var(--background-secondary);
		border-right: var(--border-width) solid var(--background-modifier-border);
		border-bottom: var(--border-width) solid var(--background-modifier-border);
		font-size: var(--font-ui-small);
	}
	.tlk-embed-column-header.collapsed {
		flex-direction: column;
		align-items: center;
		padding: 10px 0 6px;
	}
	.tlk-embed-column-header.collapsed .tlk-embed-axis-label {
		writing-mode: vertical-rl;
	}
	.tlk-embed-accent {
		position: absolute;
		inset: 0 0 auto;
		height: 6px;
		background: var(--embed-category-color, var(--background-modifier-border-hover));
	}
	.tlk-embed-axis-label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 650;
	}
	.tlk-embed-axis-count {
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
		white-space: nowrap;
	}
	.tlk-embed-row-header {
		grid-column: 1 / -1;
		display: flex;
		align-items: baseline;
		gap: var(--size-4-2);
		padding: 4px 12px;
		background: var(--background-secondary);
		border-bottom: var(--border-width) solid var(--background-modifier-border);
		border-left: 4px solid var(--embed-category-color, transparent);
		font-size: max(11px, calc(var(--font-ui-small) - 3px));
		letter-spacing: 0.065em;
		text-transform: uppercase;
	}
	.tlk-embed-cell {
		display: flex;
		flex-direction: column;
		gap: var(--size-4-2);
		min-width: 0;
		padding: 8px 16px;
		border-right: var(--border-width) solid var(--background-modifier-border);
		border-bottom: var(--border-width) solid var(--background-modifier-border);
	}
	.tlk-embed-cell.collapsed {
		padding: 0;
		background: var(--background-secondary);
	}
	.tlk-embed-card {
		border-radius: var(--radius-s);
	}
	.tlk-embed-card:focus-visible {
		outline: 2px solid var(--background-modifier-border-focus);
		outline-offset: 2px;
	}
</style>
