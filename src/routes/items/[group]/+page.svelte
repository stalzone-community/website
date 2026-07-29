<script lang="ts">
	import ItemCard from '$lib/components/ItemCard.svelte';
	import { matchesFilter, rankSlug } from '$lib/items';
	import type { Rank } from '$lib/types';

	let { data } = $props();

	let q = $state('');
	let rank = $state<Rank | ''>('');
	let category = $state('');

	// Filtering runs client-side over the group's items, which the page already
	// holds — the alternative is a query-string round trip that cannot prerender.
	let shown = $derived(
		data.items.filter((i) =>
			matchesFilter(i, { q, rank: rank || undefined, category: category || undefined }, 'en')
		)
	);
</script>

<svelte:head>
	<title>{data.group} — STALZONE database</title>
</svelte:head>

<header class="head">
	<h1>{data.group.replace(/_/g, ' ')}</h1>
	<p class="count">
		{shown.length.toLocaleString('en')}{#if shown.length !== data.items.length}
			<span class="of"> of {data.items.length.toLocaleString('en')}</span>
		{/if}
	</p>
</header>

<div class="filters">
	<label>
		<span class="visually-hidden">Search</span>
		<input type="search" bind:value={q} placeholder="Search {data.group}…" />
	</label>

	{#if data.facets.categories.length > 1}
		<label>
			<span class="visually-hidden">Category</span>
			<select bind:value={category}>
				<option value="">All types</option>
				{#each data.facets.categories as c (c.value)}
					<option value={c.value}>{c.value.split('/').at(-1)?.replace(/_/g, ' ')} ({c.count})</option>
				{/each}
			</select>
		</label>
	{/if}

	{#if data.facets.ranks.length > 1}
		<label>
			<span class="visually-hidden">Rank</span>
			<select bind:value={rank}>
				<option value="">All ranks</option>
				{#each data.facets.ranks as r (r.value)}
					<option value={r.value}>{rankSlug(r.value)} ({r.count})</option>
				{/each}
			</select>
		</label>
	{/if}
</div>

{#if shown.length}
	<ul class="grid">
		{#each shown as item (item.id)}
			<li><ItemCard {item} /></li>
		{/each}
	</ul>
{:else}
	<p class="empty">Nothing matches those filters.</p>
{/if}

<style>
	.head {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	h1 {
		text-transform: capitalize;
	}

	.count {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--text-dim);
	}

	.of {
		color: var(--text-faint);
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-bottom: var(--space-5);
	}

	input,
	select {
		padding: var(--space-2) var(--space-3);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		background: var(--surface);
		font-size: var(--text-sm);
	}

	input {
		min-width: 16rem;
		flex: 1;
	}

	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
		gap: var(--space-2);
	}

	.empty {
		color: var(--text-dim);
	}
</style>
