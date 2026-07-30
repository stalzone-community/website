<script lang="ts">
	/**
	 * One compatibility group as a sortable table.
	 *
	 * A component rather than markup in the page because the sort is per group:
	 * eight tables on a rifle's page each keep their own column and direction,
	 * and holding eight of those in the page would be a keyed map to thread
	 * through every callback. Here it is two locals.
	 */
	import { modifierBenefit } from '$lib/calc/keys';
	import { formatStat, rankSlug } from '$lib/items';
	import { statIcon, statTint } from '$lib/stat-icons';
	import { Card } from 'sveltekit-commons';
	import type { Lang, Localized, Rank, StatMeta } from '$lib/types';

	interface Row {
		id: string;
		slug: string;
		name: Localized;
		icon: string | null;
		rank: Rank;
		stats: Record<string, number>;
		display?: Record<string, string>;
	}

	interface Props {
		label: string;
		columns: string[];
		rows: Row[];
		meta: Record<string, StatMeta>;
		lang: Lang;
	}

	let { label, columns, rows, meta, lang }: Props = $props();

	/* null is the order the loader sent — best tier first. It is a real state,
	   not "unsorted": you can click back to it, and it is what the page opens on. */
	let key = $state<string | null>(null);
	let desc = $state(true);

	const name = (r: Row) => r.name[lang] ?? r.name.en ?? r.id;

	const sorted = $derived.by(() => {
		// pinned to a local: the comparator below is a closure, and TypeScript
		// cannot keep a narrowing on reactive state across one
		const k = key;
		if (k === null) return rows;
		const out = [...rows];
		const dir = desc ? -1 : 1;

		if (k === '@name') {
			out.sort((a, b) => name(a).localeCompare(name(b)) * dir);
			return out;
		}

		out.sort((a, b) => {
			const x = a.stats[k];
			const y = b.stats[k];
			// A part that does not touch this stat has no place in the ranking, so
			// it sinks to the bottom whichever way the column is pointing.
			if (x === undefined && y === undefined) return name(a).localeCompare(name(b));
			if (x === undefined) return 1;
			if (y === undefined) return -1;
			return (x - y) * dir || name(a).localeCompare(name(b));
		});
		return out;
	});

	/* Numbers open biggest-first — you sort a stat column to find the best one.
	   Names open A→Z, because nobody looks for a list backwards. */
	const opensDescending = (k: string) => k !== '@name';

	function sortBy(k: string) {
		if (key !== k) {
			key = k;
			desc = opensDescending(k);
		} else if (desc === opensDescending(k)) {
			desc = !desc;
		} else {
			// third click returns to the tier order rather than cycling forever
			key = null;
			desc = true;
		}
	}

	const ariaSort = (k: string) =>
		key !== k ? 'none' : desc ? ('descending' as const) : ('ascending' as const);

	const colLabel = (slug: string) =>
		/* trailing punctuation is upstream's — "Magazine size:" is written for a
		   label-then-value row and reads as a typo in a column header */
		(meta[slug]?.label[lang] ?? meta[slug]?.label.en ?? slug).replace(/\s*:$/, '');

	/* `display` wins where a stat is really a list: a dual sight sorts on its
	   highest magnification but has to show both. */
	const cell = (r: Row, slug: string) =>
		r.display?.[slug] ??
		(r.stats[slug] === undefined ? '—' : formatStat(r.stats[slug], meta[slug], lang));

	const tone = (v: number | undefined, slug: string) =>
		v === undefined ? null : modifierBenefit(slug, v, meta[slug]?.signed ?? false);
</script>

<Card class="block" pad={false}>
	<div class="scroller">
		<table class="data">
			<thead>
				<tr>
					<!-- "Name", not the group's own name: the heading directly above
					     already says Sights, and repeating it in the column head read
					     as a stutter rather than a label. -->
					<th aria-sort={ariaSort('@name')}>
						<button type="button" onclick={() => sortBy('@name')}>
							Name<span class="caret" class:on={key === '@name'} class:up={!desc}></span>
						</button>
					</th>
					{#each columns as slug (slug)}
						<!-- The mark leads the label, and on a rifle's Muzzle devices table
						     that is eight columns of "−19%" telling you apart by their
						     headers alone. Spread, recoil and horizontal recoil are three
						     near-identical words; the wedge, the up-arrow and the
						     double-headed arrow are not. -->
						<th class="num" aria-sort={ariaSort(slug)} style="--stat-tint: {statTint(slug)}">
							<button type="button" onclick={() => sortBy(slug)}>
								{@html statIcon(slug)}{colLabel(slug)}<span
									class="caret"
									class:on={key === slug}
									class:up={!desc}
								></span>
							</button>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each sorted as r (r.id)}
					<tr style="--rank: var(--rank-{rankSlug(r.rank)})">
						<td class="who">
							<a href="/entities/{r.slug}" title={name(r)}>
								{#if r.icon}
									<img class="icon" src={r.icon} alt="" width="24" height="24" loading="lazy" />
								{:else}
									<span class="noicon"></span>
								{/if}
								<span class="nm">{name(r)}</span>
							</a>
						</td>
						{#each columns as slug (slug)}
							{@const t = tone(r.stats[slug], slug)}
							<td class="num" class:good={t === true} class:bad={t === false}>
								{cell(r, slug)}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</Card>

<style>
	.scroller {
		overflow-x: auto;
	}

	/* `table.data` comes from commons/base.css — the class UAR's MOS tables use,
	   so the header rule, the row hover and the numeric alignment match. Only
	   what is particular to this table is set here. */
	.scroller :global(table.data th),
	.scroller :global(table.data td) {
		padding: 2px var(--space-2);
		vertical-align: middle;
	}

	/* "0,198 kg" was breaking after the number and taking the row to two lines */
	.scroller :global(table.data td.num) {
		white-space: nowrap;
	}

	/* the header is a row of buttons, but it has to keep reading as a header */
	.scroller :global(table.data th) {
		padding: 0;
	}

	th button {
		display: flex;
		align-items: center;
		gap: 4px;
		width: 100%;
		padding: var(--space-1) var(--space-2);
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		letter-spacing: inherit;
		text-transform: inherit;
		text-align: left;
		cursor: pointer;
	}

	th.num button {
		justify-content: flex-end;
	}

	th button:hover {
		color: var(--text);
	}

	/* 15px, matching the tab rail's glyphs: the header is the same uppercase mono
	   at the same size, so the marks have to be the same weight of thing. Held
	   back to 0.75 because the header itself is --text-dim — a full-strength mark
	   over a dimmed label reads as the icon being the heading. */
	th button :global(svg) {
		width: 15px;
		height: 15px;
		flex: none;
		color: var(--stat-tint, var(--text-faint));
		opacity: 0.75;
	}

	th button:hover :global(svg) {
		opacity: 1;
	}

	/* Always rendered, so the header does not reflow on the first click; it just
	   goes from a hint to the answer. */
	.caret {
		width: 0;
		height: 0;
		flex: none;
		border-left: 3.5px solid transparent;
		border-right: 3.5px solid transparent;
		border-top: 4px solid currentColor;
		opacity: 0.25;
	}

	.caret.on {
		opacity: 1;
		color: var(--accent);
	}

	.caret.on.up {
		transform: rotate(180deg);
	}

	.who a {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		border-left: 2px solid var(--rank);
		padding-left: var(--space-2);
		margin-left: calc(-1 * var(--space-2));
		text-decoration: none;
	}

	/* Long attachment names are the rule, not the exception ("Trijicon ACOG 2×40
	   Optical Sight"). The cell ellipsises; the link carries the full string. */
	.nm {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.who :global(img),
	.noicon {
		width: 24px;
		height: 24px;
		flex: none;
		object-fit: contain;
	}

	/* Green helps, red hurts — and which is which is per stat, not per sign:
	   a silencer's −19% spread is its best number. See modifierBenefit. */
	td.good {
		color: var(--accent);
	}

	td.bad {
		color: var(--danger);
	}
</style>
