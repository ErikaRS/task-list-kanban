<script lang="ts">
	import { formatMobileTaskCount } from "./mobile_layout";
	import type { AxisBucket } from "./board_matrix";
	import GroupLabel from "./GroupLabel.svelte";

	export let bucket: AxisBucket;
	export let count: number;
	export let headingLevel: 2 | 3 = 2;
	export let className = "";
</script>

<svelte:element
	this={`h${headingLevel}`}
	class={`mobile-section-heading ${className}`}
>
	<GroupLabel {bucket} /> <span class="mobile-section-count">{formatMobileTaskCount(count)}</span>
</svelte:element>
