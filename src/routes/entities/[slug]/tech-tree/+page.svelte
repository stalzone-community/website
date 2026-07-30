<script lang="ts">
	import TechTree from '$lib/components/TechTree.svelte';
	import { itemName } from '$lib/items';
	import { lang as displayLang } from '$lib/lang.svelte';

	let { data } = $props();

	const lang = $derived(displayLang());
	const name = $derived(itemName(data.entity, lang));
	const t = $derived(data.techTree);
</script>

<svelte:head>
	<title>{name} upgrade path — Stalzone</title>
	<meta
		name="description"
		content="Where {name} sits on its STALZONE tech tree: what it upgrades from, what it leads to, and which settlements hand it over."
	/>
</svelte:head>

<!-- No heading and no footer: the tab is already named Tech tree, and the graph
     is the page. The way on to the group's other trees is the sidebar. -->
<div class="graph">
	<TechTree
		layout={t.layout}
		conns={t.conns}
		width={t.width}
		height={t.height}
		items={t.items}
		settlements={t.settlements}
		labels={t.labels}
		focus={t.focus}
		{lang}
	/>
</div>

<style>
	/* Full bleed, exactly as the craft-tree tab: the graph is the page, so it
	   takes the window rather than sitting inset in the content column.

	   The three negative margins give back what the chrome around it charges —
	   the column's side padding, the gap under the tab bar, and the column's
	   bottom padding — so the box runs to the window edges on three sides and
	   stops under the tabs on the fourth. Only the top padding is left standing,
	   because the tab bar sits in it. */
	.graph {
		margin-inline: calc(-1 * var(--content-pad-x, 36px));
		margin-top: calc(-1 * var(--space-4));
		margin-bottom: calc(-1 * var(--content-pad-bottom, 72px));
		height: calc(
			100dvh - var(--chrome-h) - var(--content-pad-top, 26px) - var(--entity-chrome-h, 0px)
		);
		min-height: 24rem;
	}

	/* against the window edges a rounded bordered card reads as floating; bled
	   to them it is the page */
	.graph :global(.viewport) {
		border-inline: none;
		border-bottom: none;
		border-radius: 0;
	}
</style>
