<script lang="ts">
	import CraftTree from '$lib/components/CraftTree.svelte';
	import { itemName } from '$lib/items';
	import { lang as displayLang } from '$lib/lang.svelte';

	let { data } = $props();

	const lang = $derived(displayLang());
	const name = $derived(itemName(data.entity, lang));
	const tree = $derived(data.craftTree);
	const steps = $derived(Object.keys(tree.recipes).length);
</script>

<svelte:head>
	<title>{name} craft tree — Stalzone</title>
	<meta
		name="description"
		content="Every hideout step behind {name} in STALZONE — {steps} recipes down to {tree.materials
			.length} gathered materials."
	/>
	<!-- The same diagram lives at /craft/[slug], which carries the materials list
	     and the notes this tab leaves out. That page is the address to index. -->
	<link rel="canonical" href="/craft/{tree.slug}" />
</svelte:head>

<!-- No heading and no preamble: the tab is already named Craft tree, and the
     graph reads without being told how. The counts and the way out to the full
     page are on /craft/[slug], which the canonical link above points at. -->
<div class="graph">
	<CraftTree
		nodes={tree.nodes}
		conns={tree.conns}
		width={tree.width}
		height={tree.height}
		items={tree.items}
		recipes={tree.recipes}
		root={tree.root}
		{lang}
	/>
</div>

<style>
	/* Full bleed: the graph is the page, so it takes the window rather than
	   sitting inset in the content column like a paragraph.

	   The three negative margins give back exactly what the chrome around it
	   charges — the column's side padding, the gap under the tab bar, and the
	   column's bottom padding — so the box runs to the window edges on three
	   sides and stops under the tabs on the fourth. Only the top padding is
	   left standing, because the tab bar sits in it and pulling the graph
	   through would put it over the tabs.

	   Height is then everything below that bar: the window, less the shell's
	   own bar, less the column's top padding, less the tab bar the sublayout
	   measures and publishes. The `--space-4` the nav spends on its own
	   margin-bottom is reclaimed by the negative margin-top, so it does not
	   appear here twice. */
	.graph {
		margin-inline: calc(-1 * var(--content-pad-x, 36px));
		margin-top: calc(-1 * var(--space-4));
		margin-bottom: calc(-1 * var(--content-pad-bottom, 72px));
		height: calc(
			100dvh - var(--chrome-h) - var(--content-pad-top, 26px) - var(--entity-chrome-h, 0px)
		);
		min-height: 24rem;
	}

	/* Against the window edges a rounded card with a border reads as a thing
	   floating on the page. Bled to the edges it is the page, so the sides and
	   the corners go and only the rule under the tab bar stays. */
	.graph :global(.viewport) {
		border-inline: none;
		border-bottom: none;
		border-radius: 0;
	}
</style>
