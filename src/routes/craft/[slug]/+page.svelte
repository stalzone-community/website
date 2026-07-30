<script lang="ts">
	import CraftTree from '$lib/components/CraftTree.svelte';
	import ItemIcon from '$lib/components/ItemIcon.svelte';
	import { itemName } from '$lib/items';
	import { lang as displayLang } from '$lib/lang.svelte';

	let { data } = $props();

	const lang = $derived(displayLang());
	const root = $derived(data.items[data.root]);
	const name = $derived(root ? itemName(root, lang) : data.root);
	const steps = $derived(Object.keys(data.recipes).length);
</script>

<svelte:head>
	<title>Crafting {name} — Stalzone</title>
	<meta
		name="description"
		content="Every hideout step behind {name} in STALZONE — {steps} recipes down to {data.materials
			.length} gathered materials."
	/>
</svelte:head>

<div>
	<!-- the top bar carries the heading; see +layout.svelte's crumbFor -->
	<p class="count">
		{steps} recipes · {data.tiers} tiers · {data.materials.length} gathered materials
	</p>

	<p class="lede">
		Everything the hideout needs to make {name}, read left to right: the goal is on the left, the
		things you gather are on the far right, and every dashed box between them is one bench recipe.
		{#if data.skipped || data.cut}
			<span class="aside">
				{#if data.skipped}
					{data.skipped} recipe{data.skipped === 1 ? '' : 's'} left out: each needs something already
					further along the chain, so it is not a way of making this.
				{/if}
				{#if data.cut}
					{data.cut} link{data.cut === 1 ? '' : 's'} cut where two base materials convert into each
					other — a loop is not a step toward anything.
				{/if}
			</span>
		{/if}
	</p>

	{#if data.materials.length}
		<section>
			<h2>Gathered materials <span class="dim">{data.materials.length}</span></h2>
			<!-- the shopping list. Amounts are per recipe, not multiplied down the
			     whole chain: see the note on rollUp() in $lib/craft-tree. -->
			<ul class="mats">
				{#each data.materials as m (m.item)}
					{@const item = data.items[m.item]}
					{#if item}
						<li>
							<a href="/entities/{item.slug}">
								<ItemIcon src={item.icon} size={32} />
								<span class="label">{itemName(item, lang)}</span>
								<span class="amount">×{m.amount}</span>
							</a>
						</li>
					{/if}
				{/each}
			</ul>
		</section>
	{/if}

	<section class="graph">
		<h2>Craft graph</h2>
		<CraftTree
			nodes={data.nodes}
			conns={data.conns}
			width={data.width}
			height={data.height}
			items={data.items}
			recipes={data.recipes}
			root={data.root}
			{lang}
		/>
	</section>
</div>

<style>
	/* The graph pans and zooms inside its own box now, so the page no longer
	   scrolls sideways under it — which is what the `width: max-content` wrapper
	   and the sticky `.pin` headings existed to survive. Both are gone.

	   A tall box rather than the rest of the window: this page has a materials
	   list above the diagram that is worth scrolling to, so the graph takes a
	   generous share and leaves the page a page. */
	.graph :global(.viewport) {
		height: min(72vh, 46rem);
	}

	.count {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--text-dim);
	}

	.lede {
		max-width: 68ch;
		margin: var(--space-2) 0 var(--space-5);
		font-size: var(--text-sm);
		color: var(--text-dim);
	}

	.aside {
		display: block;
		margin-top: var(--space-1);
		color: var(--text-faint);
	}

	section {
		margin-bottom: var(--space-6);
	}

	h2 {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		font-size: var(--text-base);
		margin-bottom: var(--space-3);
	}

	.dim {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 400;
		color: var(--text-faint);
	}

	.mats {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
		gap: var(--space-2);
		width: min(100%, 1180px);
	}

	.mats a {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		background: var(--surface);
		text-decoration: none;
		color: var(--text);
		font-size: var(--text-sm);
	}

	.mats a:hover {
		background: var(--surface-raised);
		border-color: var(--border-strong);
	}

	.label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.amount {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-dim);
	}
</style>
