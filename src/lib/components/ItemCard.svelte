<script lang="ts">
	import { itemName, rankSlug } from '$lib/items';
	import type { Lang, ListItem } from '$lib/types';

	interface Props {
		/** the projected row, not a full Item — list pages never ship those */
		item: ListItem;
		lang?: Lang;
	}

	let { item, lang = 'en' }: Props = $props();
</script>

<a class="card" href="/item/{item.id}" style="--rank: var(--rank-{rankSlug(item.rank)})">
	{#if item.icon}
		<img class="icon" src={item.icon} alt="" width="48" height="48" loading="lazy" />
	{:else}
		<span class="icon placeholder" aria-hidden="true"></span>
	{/if}
	<span class="name">{itemName(item, lang)}</span>
	<span class="cat">{item.kind.replace(/_/g, ' ')}</span>
</a>

<style>
	.card {
		display: grid;
		grid-template-columns: 48px 1fr;
		grid-template-rows: auto auto;
		column-gap: var(--space-3);
		align-items: center;
		padding: var(--space-2) var(--space-3);
		border: var(--border-width) solid var(--border);
		border-left: 3px solid var(--rank);
		border-radius: var(--radius-2);
		background: var(--surface);
		text-decoration: none;
	}

	.card:hover {
		background: var(--surface-raised);
		border-color: var(--border-strong);
		border-left-color: var(--rank);
	}

	.icon {
		grid-row: 1 / 3;
		width: 48px;
		height: 48px;
		object-fit: contain;
	}

	.placeholder {
		border: 1px dashed var(--border);
		border-radius: var(--radius-1);
	}

	.name {
		font-size: var(--text-sm);
		line-height: 1.3;
	}

	.cat {
		font-size: var(--text-xs);
		color: var(--text-faint);
	}
</style>
