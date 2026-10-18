<script lang="ts">
	import { onDestroy } from "svelte";
	import Icon from "../components/icon.svelte";
	import { type App, Component, MarkdownRenderer, Notice } from "obsidian";
	import type { ArchivePageReader, ArchiveCard } from "../tasks/archive_reader";
	import type { Task } from "../tasks/task";
	import { flattenSourceBlockNodes } from "../tasks/source_block";

	export let app: App;
	export let reader: ArchivePageReader;
	export let width = 300;
	export let headerSpacing = 0;
	export let title = "Archived";
	export let resetKey: string;
	export let boardPath: string | null = null;
	export let matches: (task: Task) => boolean;
	const state = reader.state;
	let collapsed = false;
	let previousPath = boardPath;
	$: if (boardPath !== previousPath) { previousPath = boardPath; collapsed = false; }
	let list: HTMLDivElement;
	$: configure(resetKey, collapsed, matches);
	function configure(_key: string, folded: boolean, predicate: (task: Task) => boolean) {
		if (folded) reader.close();
		else reader.open(predicate);
	}
	$: if ($state.loading && list) list.scrollTop = 0;
	onDestroy(() => reader.close());

	function markdown(node: HTMLElement, card: ArchiveCard) {
		const component = new Component();
		component.load();
		const indentation = card.raw.match(/^\s*/)?.[0].length ?? 0;
		const markdown = [card.raw, ...flattenSourceBlockNodes(card.task.sourceChildren).map(child => child.rawLine)]
			.map(line => line.slice(indentation)).join("\n");
		void MarkdownRenderer.render(app, markdown,
			node, card.file.path, component).then(() => {
			node.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(input => input.disabled = true);
		});
		return { destroy: () => component.unload() };
	}
	async function restore(card: ArchiveCard) {
		try { await reader.restore(card); }
		catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
	}
</script>

<aside class="archive-column" class:collapsed style:width={collapsed ? '28px' : `${width}px`} aria-label={title}>
	<div class="archive-summary-spacer" style:height={`${headerSpacing}px`} aria-hidden="true"></div>
	<header>
		<div class="archive-heading">
			<button class="archive-collapse" aria-expanded={!collapsed}
				aria-label={`${collapsed ? "Expand" : "Collapse"} ${title} column`}
				on:click={() => collapsed = !collapsed}>{collapsed ? "▶" : "▼"}</button>
			{#if !collapsed}<span>{title}</span>{/if}
		</div>
		{#if !collapsed}
			<div class="archive-controls">
				<button class="archive-icon-button clickable-icon" disabled={$state.loading || $state.page === 1}
					on:click={() => reader.previous()} aria-label="Previous archive page" title="Previous archive page"><Icon name="arrow-left" size={16} /></button>
				<span>Page {$state.page}</span>
				<button class="archive-icon-button clickable-icon" disabled={$state.loading || !$state.more}
					on:click={() => reader.next()} aria-label="Next archive page" title="Next archive page"><Icon name="arrow-right" size={16} /></button>
				<button class="archive-icon-button clickable-icon" on:click={() => reader.refresh()}
					aria-label="Refresh archive" title="Refresh archive"><Icon name="refresh-cw" size={16} /></button>
				{#if $state.loading}<button on:click={() => reader.cancel()}>Cancel</button>{/if}
			</div>
			<p>File order · 50 tasks per page</p>
			{#if $state.loading}<p role="status">Loading… {$state.message} {$state.progress}</p>
			{:else if $state.error}<p role="alert">{$state.error} <button on:click={() => reader.refresh()}>Retry</button></p>
			{:else if $state.message}<p role="status">{$state.message}</p>{/if}
			{#if $state.more}<p>More archived tasks may be available</p>{/if}
		{/if}
	</header>
	{#if !collapsed}
		<div class="archive-cards" bind:this={list}>
			{#each $state.cards as card (card.task.id)}
				<article class="archive-card">
					<div class="archive-markdown" use:markdown={card}></div>
					<footer>
						<button title={card.file.path} on:click={() => app.workspace.openLinkText(card.file.path, "", true)}>Open source file</button>
						<button disabled={!!reader.restoreDisabledReason} title={reader.restoreDisabledReason || reader.restoreHelp(card)}
							on:click={() => restore(card)}>Restore to Done</button>
					</footer>
				</article>
			{/each}
			{#if !$state.loading && !$state.error && !$state.cards.length}<p>No archived tasks match this board and filter.</p>{/if}
		</div>
	{/if}
</aside>

<style>
	.archive-column { flex: 0 0 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden;
		border: var(--border-width) solid var(--background-modifier-border); border-radius: var(--radius-m);
		background: var(--background-primary); }
	.archive-summary-spacer { flex: 0 0 auto; box-sizing: border-box; border-bottom: var(--border-width) solid var(--background-modifier-border); }
	header { flex: 0 0 auto; background: var(--background-secondary); border-top: 6px solid var(--background-modifier-border-hover);
		border-bottom: var(--border-width) solid var(--background-modifier-border); padding: 14px 8px 8px 0; }
	.archive-heading { display: flex; align-items: center; gap: 4px; min-height: 22px;
		font-size: var(--font-ui-small); font-weight: 650; line-height: 1.3; }
	.archive-collapse { flex: 0 0 28px; width: 28px; height: 24px; min-height: 0; margin: 0; padding: 0;
		display: flex; align-items: center; justify-content: center; background: transparent; border: none;
		box-shadow: none; cursor: pointer; color: var(--text-muted); font-size: 10px; line-height: 1; }
	.archive-collapse:hover { color: var(--text-normal); }
	header p, .archive-controls { margin-left: 12px; }
	.archive-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 12px; }
	.archive-icon-button { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 24px;
		width: 24px; height: 24px; min-height: 0; margin: 0; padding: 0; border: none;
		border-radius: var(--radius-s); background: transparent; box-shadow: none; color: var(--text-muted); }
	.archive-icon-button:hover:enabled { background: var(--background-modifier-hover); color: var(--text-normal); }
	.archive-icon-button:disabled { opacity: .4; }
	.archive-controls, p, footer { font-size: var(--font-ui-smaller); color: var(--text-muted); }
	p { margin: 6px 0; overflow-wrap: anywhere; }
	.archive-cards { flex: 1 1 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 8px 16px; }
	.archive-card { position: relative; margin-bottom: 8px; overflow: hidden; border: var(--border-width) solid var(--background-modifier-border);
		border-radius: var(--radius-s); background: var(--background-primary); box-shadow: 0 1px 2px rgba(0,0,0,.06); }
	.archive-card::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 8px; background: var(--background-modifier-border-hover); }
	.archive-markdown { padding: 8px 8px 8px 16px; line-height: 1.5rem; overflow-wrap: anywhere; }
	.archive-markdown :global(ul) { margin: 0; padding-left: 24px; }
	.archive-markdown :global(p) { margin: 0; }
	footer { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; padding: 6px 8px 6px 16px;
		border-top: var(--border-width) solid var(--background-modifier-border); }
	button { font-size: inherit; }
</style>
