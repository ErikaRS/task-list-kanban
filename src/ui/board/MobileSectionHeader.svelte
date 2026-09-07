<script lang="ts">
	import { formatMobileTaskCount } from "./mobile_layout";

	export let label: string;
	export let count: number;
	export let headingLevel: 2 | 3 = 2;
	export let className = "";
</script>

<svelte:element
	this={`h${headingLevel}`}
	class={`mobile-section-heading ${className}`}
>
	{label} <span class="mobile-section-count">{formatMobileTaskCount(count)}</span>
</svelte:element>
