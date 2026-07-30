<script lang="ts">
	import { formatStat } from '$lib/items';
	import { statGroupOrder, statIcon, statTint } from '$lib/stat-icons';
	import DeltaValue from './DeltaValue.svelte';
	import LevelControl from './LevelControl.svelte';
	import type { Lang, StatMeta, StatRange } from '$lib/types';

	interface Props {
		/** fixed-value effects, slug → value */
		values: Record<string, number>;
		/** banded effects, slug → {min,max}, already resolved for `level` */
		ranges: Record<string, StatRange>;
		/** the same bands at level 0, so an upgraded row can show what it was */
		baseRanges?: Record<string, StatRange>;
		meta: Record<string, StatMeta>;
		/** current upgrade level; bindable so the card owns the control */
		level?: number;
		/** 0 hides the control — an item with no upgrade path */
		maxLevel?: number;
		lang?: Lang;
	}

	let {
		values,
		ranges,
		baseRanges = {},
		meta,
		level = $bindable(0),
		maxLevel = 0,
		lang = 'en'
	}: Props = $props();

	interface Row {
		slug: string;
		label: string;
		text: string;
		/** formatted band at level 0, when the upgrade moved it */
		baseText: string | null;
		min: number;
		max: number;
		/** signed midpoint — sorts the list and decides benefit vs cost */
		mid: number;
		banded: boolean;
	}

	let rows = $derived.by((): Row[] => {
		const out: Row[] = [];
		for (const [slug, r] of Object.entries(ranges)) {
			const m = meta[slug];
			if (!m) continue;
			out.push({
				slug,
				label: m.label[lang] ?? m.label.en ?? slug,
				text: `${formatStat(r.min, m, lang)} – ${formatStat(r.max, m, lang)}`,
				baseText: baseRanges[slug]
					? `${formatStat(baseRanges[slug].min, m, lang)} – ${formatStat(baseRanges[slug].max, m, lang)}`
					: null,
				min: r.min,
				max: r.max,
				mid: (r.min + r.max) / 2,
				banded: true
			});
		}
		for (const [slug, v] of Object.entries(values)) {
			const m = meta[slug];
			if (!m || ranges[slug]) continue;
			out.push({
				slug,
				label: m.label[lang] ?? m.label.en ?? slug,
				text: formatStat(v, m, lang),
				baseText: null,
				min: v,
				max: v,
				mid: v,
				banded: false
			});
		}
		/* Group first, magnitude inside the group. The magnitude sort is still
		   doing its old job — "which of this item's effects is the big one" — but
		   it answers it inside the block you are reading rather than across the
		   whole table, so a suit's twelve resistances stay one comparable run
		   instead of being interleaved with its carry weight. */
		return out.sort(
			(a, b) =>
				statGroupOrder(a.slug) - statGroupOrder(b.slug) || Math.abs(b.mid) - Math.abs(a.mid)
		);
	});

	/* Scaled against the largest magnitude on THIS entity, not a global maximum:
	   effects are measured in wildly different units — a +25% stamina bonus and a
	   +1.06 temperature accumulation — so a shared scale would render most rows
	   as invisible slivers. The bar answers "which of this item's effects is the
	   big one", which is the comparison a player actually makes. */
	let scale = $derived(
		Math.max(1e-9, ...rows.flatMap((r) => [Math.abs(r.min), Math.abs(r.max)]))
	);

	const pct = (n: number) => Math.min(100, (Math.abs(n) / scale) * 100);
</script>

{#if rows.length}
	{#if maxLevel > 0}
		<LevelControl bind:level max={maxLevel} />
	{/if}

	<table class="data">
		<tbody>
			{#each rows as r (r.slug)}
				<tr class:negative={r.mid < 0}>
					<td class="label">
						<!-- This is the table the marks were drawn for. A suit lists eight
						     protections and five accumulations, every one of them either
						     "<hazard> protection" or the hazard's bare name — eighteen rows
						     that differ by one word each, where shield-versus-bare,
						     trefoil-versus-snowflake and acid-versus-amber separate them on
						     sight. -->
						<span class="name" style="--stat-tint: {statTint(r.slug)}"
							>{@html statIcon(r.slug)}<span>{r.label}</span></span
						>
						<!-- the bar rides under the label, across the wide column, rather
						     than in a column of its own: a third column has to be paid for
						     out of the value's width, and a banded effect's value is long
						     ("3.06% – 3.6% → 3.24% – 3.82%") -->
						<span class="track" aria-hidden="true">
							<!-- Length is magnitude, measured from zero, so the item's
							     strongest effect has the longest bar. The brighter segment
							     is the roll band inside it — where an actual artefact can
							     land. Drawing only the band made the biggest effect a short
							     mark at the far right and the smallest one a sliver at the
							     left, which reads as a position, not a size. -->
							<span class="fill" style="width:{pct(r.max)}%"></span>
							{#if r.banded}
								<span
									class="band"
									style="left:{pct(Math.min(Math.abs(r.min), Math.abs(r.max)))}%;width:{Math.max(
										2,
										pct(Math.abs(r.max)) - pct(Math.abs(r.min))
									)}%"
								></span>
							{/if}
						</span>
					</td>
					<td class="num">
						<DeltaValue base={r.baseText ?? r.text} current={r.text} better={r.mid >= 0} />
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	/* the label column takes the slack; the value column is sized by its content
	   and must never wrap, which is what turned a 28-character band into five
	   lines when it was allowed to */
	.label {
		width: 100%;
	}

	.name {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-dim);
	}

	/* The mark keeps its own hue on a penalty row rather than turning red with
	   the bar and the value. That is the division of labour the tints buy: the
	   bar and the number say whether the row is good for you, the mark says what
	   the row is about. Repeating the tone in a third place would cost the one
	   channel that tells a radiation row from a frost one. */
	.name :global(svg) {
		width: 16px;
		height: 16px;
		flex: none;
		color: var(--stat-tint, var(--text-faint));
	}

	.num {
		white-space: nowrap;
		vertical-align: middle;
	}

	.track {
		display: block;
		position: relative;
		height: 6px;
		margin-top: var(--space-1);
		/* never the full column: a bar running edge to edge under every row reads
		   as a rule, not as a measurement */
		max-width: 22rem;
		border-radius: 2px;
		background: var(--surface-sunken);
		overflow: hidden;
	}

	/* UAR's board bar: 2px radius, held back to 0.55 so a column of them reads
	   as texture rather than a wall of colour. */
	.fill {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		min-width: 2px;
		border-radius: 2px;
		background: var(--accent);
		opacity: 0.3;
	}

	/* the roll band, sitting inside the magnitude */
	.band {
		position: absolute;
		top: 0;
		height: 100%;
		min-width: 2px;
		border-radius: 2px;
		background: var(--accent);
		opacity: 0.75;
	}

	/* a penalty — radiation taken, speed lost — is a cost, not a bonus */
	tr.negative .fill,
	tr.negative .band {
		background: var(--danger);
	}

	@media (max-width: 34rem) {
		.track {
			display: none;
		}
	}
</style>
