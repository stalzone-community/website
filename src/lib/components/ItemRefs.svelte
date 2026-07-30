<script lang="ts">
	/**
	 * A list of item references — the ingredients of a recipe, the trade-in a
	 * trader demands, the things a material goes into.
	 *
	 * The one piece the crafting and trading tabs genuinely share. Each renders
	 * its own kind of card around it, because a bench recipe and a trader's offer
	 * are different objects, but the row inside is the same row: a picture, a
	 * quantity, a name, and a link to the item.
	 *
	 * Three layouts, because three things ask for this list and they have very
	 * different room. `wrap` fills as many ~13rem columns as it is given, for a
	 * plain roll of items. `pairs` is exactly two, for a table cell, where an
	 * auto-fill would give one column at 13.9rem and three at 40rem and make the
	 * row heights jump as the window moved. Neither means one per line, which is
	 * the default and what a recipe's ingredients want.
	 */
	import type { ItemAmount, Lang, Localized } from '$lib/types';

	interface Props {
		rows: ItemAmount[];
		/** item id → name, icon and canonical slug, resolved by the loader */
		names: Record<string, { name: Localized; icon: string | null; slug: string }>;
		lang?: Lang;
		/** as many ~13rem columns as fit */
		wrap?: boolean;
		/** exactly two columns, 50% each */
		pairs?: boolean;
	}

	let { rows, names, lang = 'en', wrap = false, pairs = false }: Props = $props();

	const nameOf = (id: string) => names[id]?.name?.[lang] ?? names[id]?.name?.en ?? id;
	const iconOf = (id: string) => names[id]?.icon ?? null;
	/* Fall back to the bare id rather than dropping the link: /entities resolves
	   an id too, at the cost of one redirect, which beats a dead reference. */
	const slugOf = (id: string) => names[id]?.slug ?? id;

	/* Straight to the same question about the thing you clicked, not to its
	   overview. Reading a recipe means asking "and how do I get THAT" — landing
	   on a stats page each time breaks the thread, and the tab you were already
	   on is the one that answers it.

	   Safe for every item that can appear in one of these lists: being here at
	   all means some recipe consumes it, some recipe makes it, or a trader deals
	   in it, and any one of those is what /craft guards on. Checked across the
	   catalogue — all 981 of them resolve. */
	const href = (id: string) => `/entities/${slugOf(id)}/craft`;
</script>

<ul class="items" class:wrap class:pairs>
	{#each rows as x (x.item)}
		<li>
			<a href={href(x.item)}>
				{#if iconOf(x.item)}
					<img class="icon" src={iconOf(x.item)} alt="" width="24" height="24" loading="lazy" />
				{/if}
				<span class="qty">{x.amount}×</span>
				<span class="label">{nameOf(x.item)}</span>
			</a>
		</li>
	{/each}
</ul>

<style>
	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 2px;
	}

	.items.wrap {
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		padding: var(--space-2);
	}

	/* Two, always — 50% each. A table cell has no width of its own to measure
	   against, so auto-fill here reflows on every resize and drags the row
	   heights of the whole table with it. */
	.items.pairs {
		grid-template-columns: 1fr 1fr;
		gap: 2px var(--space-2);
	}

	/* one column is the honest answer on a phone, where 50% is about 9rem and
	   every name ellipses to three words */
	@media (max-width: 34rem) {
		.items.pairs {
			grid-template-columns: 1fr;
		}
	}

	.items a {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-1);
		font-size: var(--text-sm);
		text-decoration: none;
	}

	.items a:hover {
		background: var(--surface-raised);
	}

	.items img {
		width: 24px;
		height: 24px;
		object-fit: contain;
	}

	.qty {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-faint);
		min-width: 2.5em;
		text-align: right;
	}

	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
