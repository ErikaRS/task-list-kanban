<script lang="ts">
	/** DOM order also defines keyboard focus order. Desktop retains its original layout. */
	export let mobile = false;
</script>
<slot name="view" />
{#if mobile}
	<slot name="search" />
{:else}
	<slot name="filter" />
{/if}
<slot name="files" />
<slot name="settings" />
{#if mobile}
	<slot name="filter" />
{/if}
