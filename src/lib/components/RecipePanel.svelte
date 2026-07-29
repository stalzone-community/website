<script lang="ts">
	import type { BarterRecipe, HideoutRecipe, ItemAmount, Lang, Localized } from '$lib/types';

	interface Props {
		madeFrom: HideoutRecipe[];
		usedIn: HideoutRecipe[];
		buyFrom: BarterRecipe[];
		paysFor: BarterRecipe[];
		/** item id → name and icon, resolved by the loader */
		names: Record<string, { name: Localized; icon: string | null }>;
		perks: Record<string, { name: Localized; desc: Localized }>;
		lang?: Lang;
	}

	let { madeFrom, usedIn, buyFrom, paysFor, names, perks, lang = 'en' }: Props = $props();

	const label = (l: Localized | undefined, fallback = '') => l?.[lang] ?? l?.en ?? fallback;
	const nameOf = (id: string) => label(names[id]?.name, id);
	const iconOf = (id: string) => names[id]?.icon ?? null;

	/** "used in" can run to dozens of recipes for a common ingredient. */
	const CAP = 12;
	let usedInShown = $state(CAP);
	let paysForShown = $state(CAP);

	const pretty = (s: string) => s.replace(/_/g, ' ');

	function costLabel(b: BarterRecipe): string {
		if (!b.cost) return '';
		return `${b.cost.toLocaleString(lang === 'ko' ? 'ko-KR' : lang)} ${pretty(b.currency)}`;
	}
</script>

{#snippet ingredient(x: ItemAmount)}
	<li>
		<a href="/item/{x.item}">
			{#if iconOf(x.item)}
				<img class="icon" src={iconOf(x.item)} alt="" width="24" height="24" loading="lazy" />
			{/if}
			<span class="qty">{x.amount}×</span>
			<span class="label">{nameOf(x.item)}</span>
		</a>
	</li>
{/snippet}

{#if madeFrom.length}
	<h2>Crafted from</h2>
	{#each madeFrom as r, i (i)}
		<div class="recipe">
			<p class="where">
				{pretty(r.bench)}
				{#if r.energy}<span class="dim">· {r.energy.toLocaleString('en')} energy</span>{/if}
				{#each Object.entries(r.perks) as [id, lvl] (id)}
					<span class="perk" title={label(perks[id]?.desc)}>
						{label(perks[id]?.name, id)} {lvl}
					</span>
				{/each}
			</p>
			{#if r.result.length > 1 || r.result[0]?.amount > 1}
				<p class="yield">Yields {r.result.map((x) => `${x.amount}× ${nameOf(x.item)}`).join(', ')}</p>
			{/if}
			<ul class="items">
				{#each r.ingredients as x (x.item)}{@render ingredient(x)}{/each}
			</ul>
			{#if r.features.length}
				<p class="features">Requires {r.features.map(pretty).join(', ')}</p>
			{/if}
		</div>
	{/each}
{/if}

{#if buyFrom.length}
	<h2>Traded at</h2>
	{#each buyFrom as b, i (i)}
		<div class="recipe">
			<p class="where">
				{label(b.settlementName, b.settlement)}
				{#if b.level}<span class="dim">· level {b.level}</span>{/if}
				{#if costLabel(b)}<span class="dim">· {costLabel(b)}</span>{/if}
			</p>
			{#if b.requiredItems.length}
				<ul class="items">
					{#each b.requiredItems as x (x.item)}{@render ingredient(x)}{/each}
				</ul>
			{/if}
		</div>
	{/each}
{/if}

{#if usedIn.length}
	<h2>Used to craft <span class="count">{usedIn.length}</span></h2>
	<ul class="items wrap">
		{#each usedIn.slice(0, usedInShown) as r, i (i)}
			{#each r.result as x (x.item)}{@render ingredient(x)}{/each}
		{/each}
	</ul>
	{#if usedIn.length > usedInShown}
		<button onclick={() => (usedInShown = usedIn.length)}>
			Show {usedIn.length - usedInShown} more
		</button>
	{/if}
{/if}

{#if paysFor.length}
	<h2>Accepted as payment for <span class="count">{paysFor.length}</span></h2>
	<ul class="items wrap">
		{#each paysFor.slice(0, paysForShown) as b, i (i)}
			{@render ingredient({ item: b.item, amount: b.requiredItems.find((r) => r.item)?.amount ?? 1 })}
		{/each}
	</ul>
	{#if paysFor.length > paysForShown}
		<button onclick={() => (paysForShown = paysFor.length)}>
			Show {paysFor.length - paysForShown} more
		</button>
	{/if}
{/if}

<style>
	h2 {
		font-size: var(--text-base);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-dim);
		margin-bottom: var(--space-3);
	}

	h2:not(:first-child) {
		margin-top: var(--space-6);
	}

	.count {
		font-family: var(--font-mono);
		color: var(--text-faint);
		letter-spacing: 0;
	}

	.recipe {
		padding: var(--space-3);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		background: var(--surface);
	}

	.recipe + .recipe {
		margin-top: var(--space-2);
	}

	.where {
		font-size: var(--text-sm);
		text-transform: capitalize;
		margin-bottom: var(--space-2);
	}

	.dim {
		color: var(--text-faint);
		text-transform: none;
	}

	.perk {
		margin-left: var(--space-2);
		padding: 0 var(--space-2);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-1);
		font-size: var(--text-xs);
		color: var(--accent);
		cursor: help;
	}

	.yield {
		font-size: var(--text-xs);
		color: var(--text-dim);
		margin-bottom: var(--space-2);
	}

	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 2px;
	}

	.items.wrap {
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
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

	.features {
		margin-top: var(--space-2);
		font-size: var(--text-xs);
		color: var(--text-faint);
		text-transform: capitalize;
	}

	button {
		margin-top: var(--space-2);
		padding: var(--space-1) var(--space-3);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		background: var(--surface);
		font-size: var(--text-sm);
		color: var(--text-dim);
		cursor: pointer;
	}

	button:hover {
		border-color: var(--accent-dim);
		color: var(--text);
	}
</style>
