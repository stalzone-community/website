<script lang="ts">
	/*
	 * What is on sale right now: `GET /{region}/auction/{item}/lots`.
	 *
	 * The chart above it says what the item has been worth. This says what it
	 * costs, which is the question most people arrive with — so the cheapest
	 * per-item buyout is the headline, and the spread against the recent median
	 * sale sits beside it to say whether that price is a bargain or a markup.
	 * Neither endpoint can answer that alone; it is the reason both are fetched.
	 *
	 * PER ITEM IS THE PRICE THAT MATTERS
	 *
	 * The API prices a lot, not an item, so a cheap-looking lot can be a stack of
	 * twelve. Every headline here is per item and the table carries the lot total
	 * beside it, so a stack cannot read as a bargain.
	 *
	 * Rows arrive sorted by cheapest buyout from the API and are not re-sorted
	 * here — the API sorts across every lot, so sorting our slice of twenty would
	 * only shuffle an already-truncated list.
	 */
	import { askSpread, bonusLabel, type Market } from '$lib/auction';
	import { StatTile } from 'sveltekit-commons';

	interface Props {
		market: Market;
		/** most recent median sale, for the spread */
		recentMedian?: number | null;
		region?: string;
	}

	let { market, recentMedian = null, region }: Props = $props();

	const MINUTE = 60_000;
	const HOUR = 60 * MINUTE;
	const DAY = 24 * HOUR;

	const fmt = (n: number) => n.toLocaleString('en-US').replace(/,/g, ' ');

	const spread = $derived(askSpread(market.cheapest, recentMedian));

	/** Time-to-expiry, coarse: nobody needs seconds on a twelve-hour listing. */
	function left(ms: number): string {
		if (ms <= 0) return 'ended';
		if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))} min`;
		if (ms < DAY) return `${Math.round(ms / HOUR)} h`;
		return `${Math.round(ms / DAY)} d`;
	}

	/* The table is capped, so the count has to say whether it is the whole story.
	   "20 of 340 lots" is honest; "20 lots" would not be. */
	const shown = $derived(
		market.total > market.rows.length
			? `${market.rows.length} of ${fmt(market.total)} lots`
			: `${market.rows.length} lot${market.rows.length === 1 ? '' : 's'}`
	);
</script>

<div class="tiles">
	{#if market.cheapest !== null}
		<StatTile value="{fmt(market.cheapest)} ₽" label="cheapest, per item" />
	{/if}
	{#if market.median !== null}
		<StatTile value="{fmt(market.median)} ₽" label="median ask, per item" />
	{/if}
	<StatTile value={fmt(market.total)} label="lots listed" />
	<StatTile value={fmt(market.items)} label="items on offer" />
	{#if spread !== null}
		<!-- Cheap to buy is good news, so under the recent median is the positive
		     colour. The sign is the market's, the tint is the reader's. -->
		<StatTile
			value="{spread > 0 ? '+' : ''}{spread.toFixed(1)}%"
			label="vs recent sales"
			tint={spread > 0 ? 'var(--warn)' : 'var(--ok)'}
		/>
	{/if}
</div>

<table>
	<caption>
		{shown}{#if region}, {region} region{/if}. Cheapest buyout first.
		{#if market.bidOnly}
			{market.bidOnly === market.rows.length ? 'All' : market.bidOnly} bid-only, with no buyout.
		{/if}
	</caption>
	<thead>
		<tr>
			<th scope="col" class="num">Qty</th>
			<th scope="col" class="num">Buyout, each</th>
			<th scope="col" class="num">Buyout, lot</th>
			<th scope="col" class="num">Bid</th>
			{#if market.hasAttrs}<th scope="col">Item</th>{/if}
			<th scope="col" class="num">Ends in</th>
		</tr>
	</thead>
	<tbody>
		{#each market.rows as row, i (i)}
			<tr>
				<td class="num">{row.amount}</td>
				<td class="num strong">{row.buyoutEach === null ? '—' : fmt(row.buyoutEach)}</td>
				<td class="num dim">{row.buyout === null ? '—' : fmt(row.buyout)}</td>
				<!-- An unbid lot's "bid" is only the seller's opening price, which is
				     not the same claim as somebody having bid it. Say which. -->
				<!-- A buy-it-now listing has no bidding side, so there is no number to
				     show and an em dash is the honest cell, not a zero. -->
				<td class="num dim"
					>{row.bid === null ? '—' : fmt(row.bid)}{#if row.unbid}<span
							class="mark"
							title="opening price — no bids yet">*</span
						>{/if}</td
				>
				{#if market.hasAttrs}
					<!-- Why this column exists: rarity moves an artefact's price by orders
					     of magnitude — the same artefact runs 349k at the bottom rung and
					     310M four rungs up — so a price beside a bare item name is
					     comparing unlike things. Blank on an ordinary one: the rows worth
					     spotting should stand out, not be buried under the commonest word
					     in the table repeated twenty times. -->
					<td class="attrs">
						{#if row.attrs}
							{#if row.attrs.rarity && row.attrs.rarity !== 'ordinary'}
								<span class="tag qlt" title="artefact rarity">{row.attrs.rarity}</span>
							{/if}
							{#if row.attrs.upgradeBonus !== null && row.attrs.upgradeBonus > 0}
								<span class="tag" title="upgrade bonus"
									>+{(row.attrs.upgradeBonus * 100).toFixed(2)}%</span
								>
							{/if}
							{#each row.attrs.bonuses as b (b)}
								<span class="tag bonus">{bonusLabel(b)}</span>
							{/each}
						{/if}
					</td>
				{/if}
				<td class="num dim">{left(row.endsIn)}</td>
			</tr>
		{/each}
	</tbody>
</table>

{#if market.source === 'demo'}
	<p class="note">
		<strong class="warn">Demo API</strong> — these lots are EXBO's fixture: the same ten
		listings, at the same prices, for every item. Real listings need the production API access
		we have applied for.
	</p>
{/if}

<style>
	.tiles {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	caption {
		caption-side: bottom;
		margin-top: var(--space-2);
		font-size: var(--text-xs);
		color: var(--text-faint);
		text-align: left;
	}

	th {
		font-weight: 600;
		font-size: var(--text-xs);
		color: var(--text-dim);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		border-bottom: var(--border-width) solid var(--border);
		padding: var(--space-1) var(--space-2);
	}

	td {
		padding: var(--space-1) var(--space-2);
		border-bottom: var(--border-width) solid var(--border);
	}

	tbody tr:last-child td {
		border-bottom: none;
	}

	/* Prices are read down the column and compared, so they are mono and right
	   aligned — the digits have to line up by place value or the comparison is
	   work. */
	.num {
		font-family: var(--font-mono);
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	th.num {
		font-family: inherit;
	}

	.strong {
		color: var(--text);
	}

	.dim {
		color: var(--text-dim);
	}

	.attrs {
		/* the column is descriptive, not numeric — it wraps rather than forcing the
		   price columns narrower on a phone */
		white-space: normal;
	}

	.tag {
		display: inline-block;
		padding: 0 var(--space-1);
		margin: 0 var(--space-1) 2px 0;
		font-size: var(--text-xs);
		color: var(--text-dim);
		white-space: nowrap;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm, 3px);
	}

	/* rarity is a name from the game, shown as the game writes it */
	.tag.qlt {
		text-transform: capitalize;
	}

	.tag.qlt,
	.tag.bonus {
		/* a roll is the thing worth spotting in a column of prices */
		color: var(--text);
		border-color: var(--accent, var(--border));
	}

	.mark {
		color: var(--text-faint);
		margin-left: 0.15em;
		cursor: help;
	}

	.note {
		margin: var(--space-2) 0 0;
		font-size: var(--text-xs);
		color: var(--text-faint);
	}

	.warn {
		color: var(--warn);
	}
</style>
