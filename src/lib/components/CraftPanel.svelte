<script lang="ts">
	/**
	 * How you get this item, and what it is for.
	 *
	 * Benches and traders in one panel: they are the two answers to one question,
	 * and a player is choosing between them rather than reading both. Only 21
	 * items in the catalogue offer both, so splitting them meant checking two
	 * tabs to find out that one of them was empty.
	 *
	 * Read top to bottom it goes: make it, what making it really costs, or buy it
	 * instead — then the two reverse directions, what this is *for*, which are a
	 * different question and sit below the ones that answer the first.
	 */
	import { Card, SectionHeading } from 'sveltekit-commons';
	import { perkIcon, perkTint } from '$lib/craft-icons';
	import type { BarterRecipe, HideoutRecipe, ItemAmount, Lang, Localized } from '$lib/types';
	import ItemRefGrid from './ItemRefGrid.svelte';
	import ItemRefs from './ItemRefs.svelte';

	interface Props {
		madeFrom: HideoutRecipe[];
		usedIn: HideoutRecipe[];
		buyFrom: BarterRecipe[];
		paysFor: BarterRecipe[];
		/** the chain walked to the bottom; null when there is nothing under the
		 *  one recipe already shown */
		chain?: {
			materials: ItemAmount[];
			steps: number;
			tiers: number;
			slug: string;
		} | null;
		/** item id → name, icon and canonical slug, resolved by the loader */
		names: Record<string, { name: Localized; icon: string | null; slug: string }>;
		perks: Record<string, { name: Localized; desc: Localized }>;
		/** parts this gear is assembled from — no bench, no recipe, see
		 *  $lib/server/assembly */
		assembledFrom?: string[];
		/** gear this part is assembled into, the same link from the other end */
		assembles?: string[];
		/** one of those parts binds on pickup, so the result can never be listed */
		boundOnAssembly?: boolean;
		lang?: Lang;
	}

	let {
		madeFrom,
		usedIn,
		buyFrom,
		paysFor,
		names,
		perks,
		chain = null,
		assembledFrom = [],
		assembles = [],
		boundOnAssembly = false,
		lang = 'en'
	}: Props = $props();

	/* ItemRefGrid speaks ItemAmount. Assembly has no amounts — you need the one
	   part, not six of them — so the shape is adapted rather than the grid taught
	   a second one. */
	const asRows = (ids: string[]) => ids.map((item) => ({ item, amount: 1 }));

	const label = (l: Localized | undefined, fallback = '') => l?.[lang] ?? l?.en ?? fallback;
	const nameOf = (id: string) => label(names[id]?.name, id);
	const pretty = (s: string) => s.replace(/_/g, ' ');

	/* 1 574 of the 1 846 priced offers are in `money` and 100 are in `sleeves`.
	   Under a column already headed Cost, "335,000 money" says the same thing
	   twice — so the default currency is left unsaid and the other one is named,
	   which is the only case where the word carries information. */
	function costLabel(b: BarterRecipe): string {
		if (!b.cost) return '';
		const n = b.cost.toLocaleString(lang === 'ko' ? 'ko-KR' : lang);
		return b.currency === 'money' ? n : `${n} ${pretty(b.currency)}`;
	}

	/* Every result of every recipe this goes into, as one roll — the grid has no
	   recipe structure to show, so the recipes flatten into the things they
	   make. */
	const usedInResults = $derived(usedIn.flatMap((r) => r.result));

	/* The items this one buys. The amount is what that offer demands of *this*
	   item, not of the thing being bought: the grid shows what your stack is
	   worth, so the price is what belongs on the row. */
	const paysForItems = $derived<ItemAmount[]>(
		paysFor.map((b) => ({
			item: b.item,
			amount: b.requiredItems.find((r) => r.item)?.amount ?? 1
		}))
	);
</script>

{#if madeFrom.length}
	<SectionHeading>Crafted from</SectionHeading>
	{#each madeFrom as r, i (i)}
		<div class="card">
			<!-- The profession is the heading. Which of the three benches it happens
			     to be made at tells a player nothing they can act on — every
			     hideout has all three — where the profession and its level is
			     exactly the thing standing between them and the recipe. -->
			<p class="where">
				{#each Object.entries(r.perks) as [id, lvl] (id)}
					<span class="perk" style:color={perkTint(id)} title={label(perks[id]?.desc)}>
						{@html perkIcon(id)}
						{label(perks[id]?.name, id)}
						<b>{lvl}</b>
					</span>
				{/each}
				{#if r.energy}<span class="dim">{r.energy.toLocaleString('en')} energy</span>{/if}
			</p>
			{#if r.result.length > 1 || r.result[0]?.amount > 1}
				<p class="yield">Yields {r.result.map((x) => `${x.amount}× ${nameOf(x.item)}`).join(', ')}</p>
			{/if}
			<ItemRefs rows={r.ingredients} {names} {lang} />
			{#if r.features.length}
				<p class="features">Requires {r.features.map(pretty).join(', ')}</p>
			{/if}
		</div>
	{/each}
{/if}

<!-- The recipe above names parts that are themselves crafted. This is that
     chain followed down: the things you actually go out and gather. Only shown
     when there is more than one step, or it would repeat the ingredient list
     immediately above it. -->
{#if chain}
	<SectionHeading>
		Parts you gather <span class="count">{chain.materials.length}</span>
	</SectionHeading>
	<p class="lede">
		Everything above bottoms out here, through {chain.steps} recipes and {chain.tiers} tiers.
		Amounts are per recipe, not multiplied down the chain —
		<a href="/craft/{chain.slug}">see the whole crafting chain →</a>
	</p>
	<ItemRefGrid rows={chain.materials} {names} {lang} />
{/if}

<!-- A table, not a stack of cards. Every offer says the same four things about
     the same item, which is the definition of a row: read down the Cost column
     and the cheapest trader is obvious, where twelve cards made you hold four
     numbers in your head. `table.data` is commons/base.css — the same widget
     the UAR wiki tables use, so the header rule, the row hover and the numeric
     alignment come for free. -->
{#if buyFrom.length}
	<SectionHeading>Traded at <span class="count">{buyFrom.length}</span></SectionHeading>
	<Card pad={false}>
		<div class="scroller">
			<table class="data">
				<thead>
					<tr>
						<th>Settlement</th>
						<th class="num">Level</th>
						<th class="num">Cost</th>
						<th>In exchange for</th>
					</tr>
				</thead>
				<tbody>
					{#each buyFrom as b, i (i)}
						<tr>
							<td class="settlement">{label(b.settlementName, b.settlement)}</td>
							<td class="num">{b.level || '—'}</td>
							<td class="num">{costLabel(b) || '—'}</td>
							<td class="trade">
								{#if b.requiredItems.length}
									<!-- two per row: a trade-in is rarely more than four items, and
									     one per line made the tallest column set the row height for
									     every other cell in it -->
									<ItemRefs rows={b.requiredItems} {names} {lang} pairs />
								{:else}
									<span class="dim">Cash only</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</Card>
{/if}

{#if usedInResults.length}
	<SectionHeading>Used to craft <span class="count">{usedInResults.length}</span></SectionHeading>
	<ItemRefGrid rows={usedInResults} {names} {lang} />
{/if}

{#if paysForItems.length}
	<SectionHeading>
		Accepted as payment for <span class="count">{paysForItems.length}</span>
	</SectionHeading>
	<ItemRefGrid rows={paysForItems} {names} {lang} />
{/if}

<!-- Assembly sits last because it is the rarest case: 39 items of 2 311. It is
     also the only section here that upstream states nowhere — the link is
     recovered from the part names, so the lede says where it came from. -->
{#if assembledFrom.length}
	<SectionHeading>Assembled from <span class="count">{assembledFrom.length}</span></SectionHeading>
	<p class="lede">
		Gathered as numbered parts rather than made at a bench.
		{#if boundOnAssembly}
			You assemble it yourself, so the result is personal and cannot be sold on the auction.
		{/if}
	</p>
	<ItemRefGrid rows={asRows(assembledFrom)} {names} {lang} />
{/if}

{#if assembles.length}
	<SectionHeading>Used to assemble <span class="count">{assembles.length}</span></SectionHeading>
	<ItemRefGrid rows={asRows(assembles)} {names} {lang} />
{/if}

<style>
	.lede {
		margin-bottom: var(--space-3);
		font-size: var(--text-sm);
		color: var(--text-dim);
	}

	/* the bench recipe's card. A trader's offer is a table row instead — an
	   offer is four comparable facts, a recipe is a structure. */
	.card {
		padding: var(--space-3);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		background: var(--surface);
	}

	.card + .card {
		margin-top: var(--space-2);
	}

	.where {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
		font-size: var(--text-sm);
		margin-bottom: var(--space-2);
	}

	.dim {
		color: var(--text-faint);
		text-transform: none;
	}

	/* The profession the recipe is gated on. Inline-flex so the mark sits on the
	   text's centre line rather than its baseline — a stroke glyph has no
	   descender to sit on and hangs low without it. */
	.perk {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 1px var(--space-2);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-1);
		font-size: var(--text-xs);
		text-transform: none;
		cursor: help;
	}

	/* :global because the glyph arrives through {@html} and carries no scope
	   attribute. Sized in em so it tracks the badge's text rather than a fixed
	   pixel box — the same arrangement the search chips use. */
	.perk :global(svg) {
		width: 1.25em;
		height: 1.25em;
		flex: none;
	}

	/* the required level, which is the number you check against your character
	   — the only part of the badge worth reading twice */
	.perk b {
		font-family: var(--font-mono);
		font-weight: 600;
	}

	/* the table can outgrow a narrow content column; it scrolls in its own box
	   rather than pushing the page sideways and taking the infobox with it */
	.scroller {
		overflow-x: auto;
	}

	.scroller :global(table.data th),
	.scroller :global(table.data td) {
		vertical-align: middle;
	}

	.settlement {
		text-transform: capitalize;
		white-space: nowrap;
	}

	/* the trade-in is the widest thing here and the only elastic column */
	.trade {
		width: 100%;
		min-width: 14rem;
	}

	.yield {
		font-size: var(--text-xs);
		color: var(--text-dim);
		margin-bottom: var(--space-2);
	}

	.features {
		margin-top: var(--space-2);
		font-size: var(--text-xs);
		color: var(--text-faint);
		text-transform: capitalize;
	}
</style>
