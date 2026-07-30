<script lang="ts">
	import ActiveLots from '$lib/components/ActiveLots.svelte';
	import PriceChart from '$lib/components/PriceChart.svelte';
	import { itemName } from '$lib/items';
	import { lang as displayLang } from '$lib/lang.svelte';
	import { Card, SectionHeading } from 'sveltekit-commons';

	let { data } = $props();

	const lang = $derived(displayLang());
	const name = $derived(itemName(data.entity, lang));
</script>

<svelte:head>
	<title>{name} auction prices — Stalzone</title>
	<meta
		name="description"
		content="Auction prices for {name} in STALZONE: what it costs on the market right now, and the median, low and high of recent sales."
	/>
</svelte:head>

<!-- On sale first, history second. The chart is the more interesting object, but
     "what does one cost" is the question people came with, and it is answered by
     the lots — so it goes above the fold and the history explains it. -->
<SectionHeading>On sale now</SectionHeading>
<Card class="block">
	{#if data.market}
		<ActiveLots market={data.market} recentMedian={data.recentMedian} region={data.region} />
	{:else}
		<p class="empty">No listings — {data.marketReason}.</p>
	{/if}
</Card>

<SectionHeading>Price history</SectionHeading>
<Card class="block">
	<PriceChart history={data.auction} reason={data.reason} region={data.region} />
</Card>

<style>
	.empty {
		margin: 0;
		color: var(--text-dim);
		font-size: var(--text-sm);
	}
</style>
