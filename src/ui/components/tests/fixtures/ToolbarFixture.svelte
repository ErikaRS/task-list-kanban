<script lang="ts">
	import BoardToolbarLayout from "../../BoardToolbarLayout.svelte";
	export let mobile = false;
</script>
<div class="board-toolbar">
	<BoardToolbarLayout {mobile}>
		<button slot="view">View</button>
		<button slot="search">Search</button>
		<input slot="filter" aria-label="Filter" />
		<button slot="files">Open files</button>
		<button slot="settings">Settings</button>
	</BoardToolbarLayout>
</div>
