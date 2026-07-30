<script lang="ts">
	/**
	 * Where one item sits on its tech tree: what it comes from, what it leads to.
	 *
	 * Deliberately not the whole tree. An entity page answers "what is this" —
	 * three columns of immediate neighbours does that, and the tree page is one
	 * click away for the shape of the whole line. Rendering 40 cards here would
	 * also mean 40 icons on a page that already ships a stat table and a chart.
	 *
	 * It overlaps TradePanel by design and not by accident — both read the barter
	 * table. That panel lists every offer with its trade-in and its settlement;
	 * this one strips all of it away to show progression alone.
	 */
	import { itemName, rankSlug } from '$lib/items';
	import FactionMarks from '$lib/components/FactionMarks.svelte';
	import type { Lang, Localized } from '$lib/types';
	import type { TechItem } from '$lib/server/tech-tree';

	interface Props {
		group: string;
		parents: TechItem[];
		children: TechItem[];
		sidegrades: TechItem[];
		/** the item this page is about, rendered as the fixed middle column */
		self: TechItem;
		/** node id → the settlements that hand it over */
		settlements: Record<string, string[]>;
		/** localised settlement names */
		labels: Record<string, Localized>;
		lang?: Lang;
	}

	let {
		group,
		parents,
		children,
		sidegrades,
		self,
		settlements,
		labels,
		lang = 'en'
	}: Props = $props();

</script>

{#snippet marks(id: string)}
	<FactionMarks settlements={settlements[id] ?? []} {labels} {lang} />
{/snippet}

{#snippet card(item: TechItem, current = false)}
	<li style="--rank: var(--rank-{rankSlug(item.rank)})">
		{#if current}
			<span class="row current">
				{#if item.icon}
					<img class="icon" src={item.icon} alt="" width="28" height="28" />
				{/if}
				<span class="label">{itemName(item, lang)}</span>
				{@render marks(item.id)}
			</span>
		{:else}
			<a class="row" href="/entities/{item.slug}">
				{#if item.icon}
					<img class="icon" src={item.icon} alt="" width="28" height="28" loading="lazy" />
				{/if}
				<span class="label">{itemName(item, lang)}</span>
				{@render marks(item.id)}
			</a>
		{/if}
	</li>
{/snippet}

<div class="path">
	<div class="col">
		<h3>Upgrades from</h3>
		{#if parents.length}
			<ul>{#each parents as p (p.id)}{@render card(p)}{/each}</ul>
		{:else}
			<p class="none">Start of the line</p>
		{/if}
	</div>

	<div class="col self">
		<h3>This item</h3>
		<ul>{@render card(self, true)}</ul>
		{#if sidegrades.length}
			<h3 class="side">Trades both ways with</h3>
			<ul>{#each sidegrades as s (s.id)}{@render card(s)}{/each}</ul>
		{/if}
	</div>

	<div class="col">
		<h3>Upgrades to</h3>
		{#if children.length}
			<ul>{#each children as c (c.id)}{@render card(c)}{/each}</ul>
		{:else}
			<p class="none">End of the line</p>
		{/if}
	</div>
</div>

<p class="more">
	<a href="/tech-tree/{group}#{self.id}">See the full {group.replace(/_/g, ' ')} tech tree →</a>
</p>

<style>
	.path {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-3);
		align-items: start;
	}

	@media (max-width: 720px) {
		.path {
			grid-template-columns: 1fr;
		}
	}

	h3 {
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-faint);
		margin-bottom: var(--space-2);
	}

	h3.side {
		margin-top: var(--space-3);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 2px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		border: var(--border-width) solid transparent;
		border-left: 2px solid var(--rank);
		border-radius: var(--radius-1);
		font-size: var(--text-sm);
		text-decoration: none;
	}

	a.row:hover {
		background: var(--surface-raised);
	}

	.current {
		background: var(--surface-raised);
		border-color: var(--border);
		border-left-color: var(--rank);
		color: var(--text-dim);
	}

	img {
		width: 28px;
		height: 28px;
		object-fit: contain;
	}

	.label {
		flex: 1;
		min-width: 0;
	}

	.none {
		font-size: var(--text-sm);
		color: var(--text-faint);
		padding: var(--space-1) var(--space-2);
	}

	.more {
		margin-top: var(--space-3);
		font-size: var(--text-sm);
	}
</style>
