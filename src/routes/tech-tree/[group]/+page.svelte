<script lang="ts">
	import TechTree from '$lib/components/TechTree.svelte';
	import FactionMarks from '$lib/components/FactionMarks.svelte';
	import ItemIcon from '$lib/components/ItemIcon.svelte';
	import { itemName, rankSlug } from '$lib/items';
	import { availableAt, FACTIONS, FACTION_HOMES, NORTH_BLOCK } from '$lib/factions';
	import { CARD_H, CARD_W, ICON } from '$lib/tech-geometry';
	import { lang as displayLang } from '$lib/lang.svelte';
	import { page } from '$app/state';

	let { data } = $props();

	const lang = $derived(displayLang());
	const title = $derived(data.group.replace(/_/g, ' '));

	/* An item page links here as #<id>. The hash is the item, not the tree, so
	   it survives a tree being renumbered by a patch — which the index would
	   not. */
	const focus = $derived(page.url.hash.slice(1) || null);

	/** Filter state: a settlement key, or null for "show everything level". */
	let only = $state<string | null>(null);

	const label = (key: string) => data.labels[key]?.[lang] ?? data.labels[key]?.en ?? key;

	/** The faction bases this group actually trades in, in the table's order,
	 *  plus the northern block — a place you can trade, so it filters, even
	 *  though it is not a faction and never badges an item. */
	const factions = $derived(FACTION_HOMES.filter((k) => k in data.labels));
	const filters = $derived(
		NORTH_BLOCK in data.labels ? [...factions, NORTH_BLOCK] : factions
	);

	const named = $derived(
		data.trees.map((t, i) => ({
			...t,
			index: i,
			// the leftmost node of the tree names the line
			lead: data.items[t.layout.nodes.find((n) => n.column === 0)?.id ?? '']
		}))
	);

	const holdsFocus = (t: (typeof named)[number]) =>
		Boolean(focus) && t.layout.nodes.some((n) => n.id === focus);
</script>

<svelte:head>
	<title>{title} tech tree — Stalzone</title>
	<meta
		name="description"
		content="Every {title} upgrade path in STALZONE: {data.counts.items} items across {data.counts
			.trees} branches, built from the game's own barter data."
	/>
</svelte:head>

<!--
	Everything sits in one `max-content` column so the page, not each tree, owns
	the horizontal scrollbar. That also gives the pinned rows below something to
	stick against: `position: sticky` is bounded by the containing block, and a
	viewport-wide one would leave them nowhere to travel.
-->
<div class="pan">
	<!-- No <h1> and no breadcrumb here: the top bar carries both, so the page has
	     exactly one heading and it never moves. See +layout.svelte's crumbFor. -->
	<p class="count pin">
		{data.counts.items} items · {data.counts.steps} upgrades · {data.counts.trees} branches
	</p>

	<p class="lede pin">
	Each step is a trader barter that takes the item on the left and hands back the one on the right.
	Dashed lines trade both ways — those two are alternatives at the same tier, not a step up.
	{#if factions.length}
		An emblem means the item is sold at some faction bases but not all; anything unmarked is sold
		at every base.
	{/if}
	</p>

	{#if filters.length}
	<!-- A filter, not a set of tabs: every tree stays on the page and the ones
	     you cannot trade for fade back, which is the only way to see that two
	     branches are a fork rather than two unrelated lines. -->
	<div class="legend pin" role="group" aria-label="Filter by base">
		<button type="button" class="chip" class:on={only === null} onclick={() => (only = null)}>
			All bases
		</button>
		{#each filters as key (key)}
			<button
				type="button"
				class="chip"
				class:on={only === key}
				style={FACTIONS[key]
					? `--faction: var(--faction-${FACTIONS[key].id}); --emblem: url(${FACTIONS[key].emblem})`
					: undefined}
				aria-pressed={only === key}
				onclick={() => (only = only === key ? null : key)}
			>
				{#if FACTIONS[key]}<span class="glyph"></span>{/if}
				{label(key)}
			</button>
		{/each}
	</div>
{/if}

	{#if data.outright.length}
	<!-- Not a tree, and forcing it into one would be a lie: nothing upgrades
	     into these and they upgrade into nothing. They are here because they
	     are the end of the game — the Master and Legend gear you buy outright,
	     including every suit sold at a single faction base. -->
	<section>
		<h2 class="pin">
			Sold outright
			<span class="dim">{data.counts.outright} items · no upgrade path</span>
		</h2>
		<p class="note pin">
			The top of the game, and none of it is on a tree: you pay materials and rubles rather than
			trading a previous piece in. Every suit sold at a single faction base is here.
		</p>
		<!-- Same card geometry as a tree node, from the same constants: these sit
		     directly above the trees and two card sizes would read as two
		     unrelated things. -->
		<ul
			class="outright pin"
			style="--card-w:{CARD_W}px; --card-h:{CARD_H}px; --icon-size:{ICON}px"
		>
			{#each data.outright as item (item.id)}
				<li
					class:dim={only && !availableAt(item.settlements, only)}
					style="--rank: var(--rank-{rankSlug(item.rank)})"
				>
					<a href="/entities/{item.slug}">
						<ItemIcon src={item.icon} size={ICON} flush />
						<span class="body">
							<span class="name">{itemName(item, lang)}</span>
							<!-- spelled out, not just the border colour: this section exists
							     because the Master gear was hard to find -->
							<span class="rank">{rankSlug(item.rank)}</span>
						</span>
						<span class="marks">
							<FactionMarks settlements={item.settlements} labels={data.labels} {lang} />
						</span>
					</a>
				</li>
			{/each}
		</ul>
	</section>
	{/if}

	{#each named as t (t.index)}
	<section class:lit={holdsFocus(t)}>
		<h2 class="pin">
			{#if t.lead}{itemName(t.lead, lang)} line{:else}Branch {t.index + 1}{/if}
			<span class="dim">{t.layout.nodes.length} items · {t.layout.columns} tiers</span>
		</h2>
		<TechTree
			layout={t.layout}
			conns={t.conns}
			width={t.width}
			height={t.height}
			items={data.items}
			settlements={data.settlements}
			labels={data.labels}
			{focus}
			{only}
			{lang}
		/>
	</section>
	{/each}

</div>

<style>
	.pan {
		width: max-content;
		min-width: 100%;
	}

	/* Stays against the left edge while the page pans right. Needs `fit-content`
	   as well as `left: 0` — stretched to the full `max-content` width it would
	   already start at the origin and have nothing to travel over. */
	.pin {
		position: sticky;
		left: 0;
		width: fit-content;
	}

	.count {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--text-dim);
	}

	.lede {
		max-width: 62ch;
		margin: var(--space-2) 0 var(--space-4);
		font-size: var(--text-sm);
		color: var(--text-dim);
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-bottom: var(--space-5);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-3);
		background: var(--surface);
		color: var(--text-dim);
		font-size: var(--text-xs);
		cursor: pointer;
	}

	.chip:hover {
		border-color: var(--border-strong);
		color: var(--text);
	}

	.chip.on {
		border-color: var(--faction, var(--text-dim));
		color: var(--text);
	}

	.glyph {
		display: inline-block;
		width: 16px;
		height: 16px;
		background: var(--faction);
		-webkit-mask: var(--emblem) center / contain no-repeat;
		mask: var(--emblem) center / contain no-repeat;
	}

	section {
		margin-bottom: var(--space-6);
		padding-top: var(--space-3);
		border-top: var(--border-width) solid var(--border);
	}

	/* the tree holding the item you came from */
	section.lit {
		border-top-color: var(--accent);
	}

	h2 {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: var(--space-3);
		font-size: var(--text-base);
		margin-bottom: var(--space-3);
	}

	.dim {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 400;
		color: var(--text-faint);
	}

	.note {
		font-size: var(--text-sm);
		color: var(--text-dim);
		margin-bottom: var(--space-3);
	}

	/* A grid, not a tree — these have no tier to lay out against. Same card
	   language as the tree so the page reads as one thing. */
	.outright {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(var(--card-w), 1fr));
		gap: var(--space-2);
		/* capped rather than filling the pan: the pan is as wide as the widest
		   tree, and a 2 000px grid of 190px cards is a wall, not a list */
		width: min(100%, 1180px);
	}

	.outright a {
		display: flex;
		align-items: center;
		height: var(--card-h);
		/* same rule as a tree card: no card padding, the icon cell reaches the
		   edges and the text carries the spacing */
		overflow: hidden;
		border: var(--border-width) solid var(--border);
		border-left: 3px solid var(--rank);
		border-radius: var(--radius-2);
		background: var(--surface);
		text-decoration: none;
		color: var(--text);
	}

	.outright a:hover {
		background: var(--surface-raised);
		border-color: var(--border-strong);
		border-left-color: var(--rank);
	}

	.outright li.dim {
		opacity: 0.28;
	}

	.outright .marks:not(:empty) {
		display: flex;
		gap: 2px;
		padding-right: var(--space-2);
	}

	.outright .body {
		flex: 1;
		min-width: 0;
		padding: 0 var(--space-2);
	}

	.outright .name {
		display: block;
		font-size: var(--text-xs);
		line-height: 1.2;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.outright .rank {
		display: block;
		font-family: var(--font-mono);
		font-size: 10px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--rank);
	}
</style>
