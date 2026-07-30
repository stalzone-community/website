<script lang="ts">
	/**
	 * Overview: what the thing *is*. Its description, its numbers, and how hard
	 * it hits — everything intrinsic to the entity. Where it comes from, what it
	 * costs and what it pairs with are the other tabs.
	 *
	 * The description leads rather than sitting in the infobox, which is where it
	 * used to be. Two reasons: prose reads badly in a 290px column, and 1 198 of
	 * the 2 311 entities have no stats at all — for a crafting part or a herb the
	 * description *is* the overview, and without it the tab would be blank.
	 */
	import DamageChart from '$lib/components/DamageChart.svelte';
	import EffectBands from '$lib/components/EffectBands.svelte';
	import DeltaValue from '$lib/components/DeltaValue.svelte';
	import { damageAtLevel, formatStat, itemName, rangesAtLevel, statsAtLevel } from '$lib/items';
	import { INFOBOX_STATS, splitStats } from '$lib/entities';
	import { upgradeLevel } from '$lib/entity-level.svelte';
	import { isBenefit } from '$lib/calc/keys';
	import { statGroup, statGroupLabel, statIcon, statTint } from '$lib/stat-icons';
	import { lang as displayLang } from '$lib/lang.svelte';
	import { Card, SectionHeading } from 'sveltekit-commons';

	let { data } = $props();

	const lang = $derived(displayLang());
	const has = $derived(data.capabilities);
	const entity = $derived(data.entity);

	const level = upgradeLevel();

	const stats = $derived(statsAtLevel(entity, level.value));
	const damage = $derived(damageAtLevel(entity, level.value));
	const bands = $derived(rangesAtLevel(entity, level.value));
	const baseDamage = $derived(level.value > 0 ? entity.damage : null);

	/** Stats the current upgrade level moved, highlighted in accent. */
	const changed = $derived(
		new Set(
			level.value === 0 ? [] : Object.keys(stats).filter((k) => stats[k] !== entity.stats[k])
		)
	);

	const split = $derived(splitStats(stats, data.statMeta));

	const label = (slug: string) =>
		data.statMeta[slug]?.label[lang] ?? data.statMeta[slug]?.label.en ?? slug;

	/** Main-column stats, minus whatever the infobox already shows. */
	const mainStats = $derived(split.plain.filter((s) => !INFOBOX_STATS.includes(s)));

	/*
	 * Where the group changes, so the table can rule between blocks.
	 *
	 * A rule and not a heading: `splitStats` hands back up to eight groups and most
	 * of them are one or two rows, so eight headings over sixteen rows is a table
	 * of contents rather than a table. The rule says "these belong together"
	 * without spending a row to say it, and the group's name rides on the first
	 * row's title attribute for anyone who wants it spelled out.
	 */
	const startsGroup = $derived(
		new Set(mainStats.filter((s, i) => i > 0 && statGroup(s) !== statGroup(mainStats[i - 1])))
	);

	const effectValues = $derived(
		Object.fromEntries(
			split.effects.filter((s) => !INFOBOX_STATS.includes(s)).map((s) => [s, stats[s]])
		)
	);

	const texts = $derived(
		has.text ? entity.texts.filter((t) => t.text[lang] ?? t.text.en) : []
	);

	const hasStatsTable = $derived(has.stats && mainStats.length > 0);
	const empty = $derived(!texts.length && !hasStatsTable && !has.effects && !(has.damage && damage));
</script>

<svelte:head>
	<title>{itemName(entity, lang)} — Stalzone</title>
	<meta
		name="description"
		content="{itemName(entity, lang)} — {entity.category} stats, effects and upgrade levels in STALZONE."
	/>
</svelte:head>

<!-- No breadcrumb and no <h1> here: both live in the top bar, so the page has
     one heading and it never scrolls out of view. See the `crumb` snippet in
     the root +layout.svelte, which reads this route's `entity` straight off
     page.data. -->

<!-- One card, not one per entry. Upstream splits an item's prose into several
     `text` blocks, most of them a single line ("Headshot damage: x1"), and at
     290px each was a small note — at full width each was an all-but-empty card.
     They are one description, so they are one card. -->
{#if texts.length}
	<Card class="desc">
		{#each texts as t, i (i)}
			{#if t.title}<h3>{t.title[lang] ?? t.title.en}</h3>{/if}
			<p>{t.text[lang] ?? t.text.en}</p>
		{/each}
	</Card>
{/if}

{#if hasStatsTable}
	<SectionHeading>Stats <span class="count">{mainStats.length}</span></SectionHeading>
	<Card class="block" pad={false}>
		<table class="data">
			<tbody>
				{#each mainStats as slug (slug)}
					<tr class:changed={changed.has(slug)} class:group={startsGroup.has(slug)}>
						<th scope="row" title={statGroupLabel(slug) ?? undefined}>
							<!-- Decoration beside its own label, which is why the mark is
							     aria-hidden and the row keeps its text: on a rifle this table
							     is nineteen rows and the marks are what let you find reload
							     time in it without reading nineteen words.

							     Wrapped in a span rather than laying the <th> out as a flex
							     box: a table cell with `display: flex` stops being a
							     table-cell, and the browser wraps it in an anonymous one —
							     which takes the column out of the table's own width
							     calculation. -->
							<span class="what" style="--stat-tint: {statTint(slug)}"
								>{@html statIcon(slug)}<span>{label(slug)}</span></span
							>
						</th>
						<td class="num">
							<DeltaValue
								base={formatStat(entity.stats[slug] ?? stats[slug], data.statMeta[slug], lang)}
								current={formatStat(stats[slug], data.statMeta[slug], lang)}
								better={entity.stats[slug] === undefined
									? null
									: isBenefit(slug, stats[slug] - entity.stats[slug])}
							/>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</Card>
{/if}

{#if has.effects}
	<SectionHeading>Effects</SectionHeading>
	<Card class="block" pad={false}>
		<!-- maxLevel 0 hides the component's own control: the slider is in the
		     sublayout now, because the infobox moves with it too. -->
		<EffectBands
			values={effectValues}
			ranges={bands}
			baseRanges={entity.ranges}
			meta={data.statMeta}
			level={level.value}
			maxLevel={0}
			{lang}
		/>
	</Card>
{/if}

{#if has.damage && damage}
	<SectionHeading>Damage</SectionHeading>
	<Card class="block">
		<DamageChart {damage} base={baseDamage} />
	</Card>
{/if}

{#if empty}
	<!-- 222 entities have neither a stat nor a line of text upstream. The tab
	     still exists because it is the canonical URL and the other tabs have to
	     lead back to something. -->
	<p class="none">EXBO's database records no stats or description for this item.</p>
{/if}

<style>
	tr.changed td {
		color: var(--accent);
	}

	/* The mark sits in the label cell, not a column of its own: a third column
	   costs 24px of the value's width on every row, and 1 198 of the 2 311
	   entities would have an empty one. */
	.what {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	/* The tint rides a custom property on the wrapper and is read here, on the
	   glyph alone — set as `color` on the wrapper it would take the label with
	   it, and a stat table where every row's text is a different colour is
	   unreadable. Held back to 0.8 so a column of marks is texture beside the
	   labels rather than louder than them; hover brings the row's own mark up. */
	.what :global(svg) {
		width: 16px;
		height: 16px;
		flex: none;
		color: var(--stat-tint, var(--text-faint));
		opacity: 0.8;
	}

	tr:hover .what :global(svg) {
		opacity: 1;
	}

	/* The first row of each block, ruled off from the one above. A rule and
	   nothing else — a heading, a gap or a background would each turn a
	   sixteen-row table into eight small ones. */
	tr.group > :global(*) {
		border-top: var(--border-width) solid var(--border-strong);
	}

	:global(.desc) {
		font-size: var(--text-sm);
		/* prose does not want to run the full width of a 1400px screen */
		max-width: 68ch;
	}

	:global(.desc) h3 {
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-faint);
		margin-bottom: var(--space-1);
	}

	:global(.desc) p {
		color: var(--text-dim);
		white-space: pre-line;
	}

	/* the blocks are one description, so they are spaced as paragraphs of one */
	:global(.desc) p + p,
	:global(.desc) p + h3 {
		margin-top: var(--space-2);
	}

	.none {
		color: var(--text-faint);
		font-size: var(--text-sm);
	}
</style>
