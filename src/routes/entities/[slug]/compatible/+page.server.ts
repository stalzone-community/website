import { error } from '@sveltejs/kit';
import { compatibleItems, enumLabels, stats as statDict } from '$lib/server/catalogue';
import { resolve, slugFor } from '$lib/server/entities';
import { formatZoom, rankOrder, zoomLevels } from '$lib/items';
import { statGroupOrder } from '$lib/stat-icons';
import type { Localized, Rank, StatMeta } from '$lib/types';

/**
 * What this fits, or what fits it — the relation is symmetric upstream, so one
 * page answers both directions.
 *
 * WHY THIS IS GROUPED AND NOT A LIST
 *
 * The median compatibility list is 145 items and 727 of the 1 059 run past a
 * hundred; the LR-300 carries 269. Alphabetical, that is a wall with a 4×
 * optic three rows above a pink paint, and no way to answer the only question
 * anyone brings to it: "what can I put in *this* slot".
 *
 * `enums.category` is the grouping key rather than the `kind` slug: upstream
 * writes it in all five languages and every one of the 2 311 items has one.
 *
 * Paints are not here. They answer a different question and on a rifle they are
 * half the list, so they have their own tab — see ../cosmetics.
 */

/** Decoration rather than a fitting; belongs to the Cosmetics tab. */
const SKINS = 'core.handbook.category.skins';

/**
 * `core.handbook.category.other` is upstream's junk drawer, and it hides the
 * thing people come looking for: of its 20 items, 10 are laser designators.
 * "Other Attachments 17" is not an answer to "can I put a laser on this".
 *
 * They are separable without reading a single name, which matters because a
 * name rule would have to work in five languages and "LD" is the Russian
 * abbreviation. The stat signature partitions the bucket exactly:
 *
 *   upg_hip_spread only   10  lasers and tactical units — a laser tightens
 *                             hip-fire and touches nothing else
 *   the upg_recoil group   4  underbarrel launchers — M203, GP-25, FN EGLM,
 *                             the Groza's — they add mass, so they move recoil,
 *                             draw time and wiggle
 *   no upg_* at all        6  protective rails, which are mount points and by
 *                             definition change no number
 *
 * Checked against all 20: no item lands in two buckets and none lands in none.
 * This is an inference from stats, not a documented type — if EXBO ships a real
 * subcategory, delete this and group on it.
 *
 * The labels are ours, so unlike every other group they are not upstream i18n.
 * en/fr/es are filled in; ru and ko fall through to English the same way any
 * missing key does, rather than being invented here.
 */
const OTHER = 'core.handbook.category.other';

interface DerivedGroup {
	key: string;
	label: Localized;
	test: (stats: Record<string, number>) => boolean;
}

const OTHER_SPLIT: readonly DerivedGroup[] = [
	{
		key: 'derived.laser',
		label: { en: 'Laser sights', fr: 'Viseurs laser', es: 'Miras láser' },
		test: (s) => 'upg_hip_spread' in s
	},
	{
		key: 'derived.launcher',
		label: { en: 'Underbarrel launchers', fr: 'Lance-grenades', es: 'Lanzagranadas' },
		test: (s) => 'upg_recoil' in s
	},
	{
		key: 'derived.rail',
		label: { en: 'Rails and mounts', fr: 'Rails et supports', es: 'Rieles y soportes' },
		test: () => true
	}
];

/** Which group an `other` attachment belongs to. The last entry is the catch-all. */
const splitOther = (stats: Record<string, number>): DerivedGroup =>
	OTHER_SPLIT.find((g) => g.test(stats)) ?? OTHER_SPLIT[OTHER_SPLIT.length - 1];

/**
 * The stat columns a group's table shows, chosen from what its own members
 * actually carry rather than from a table per category.
 *
 * Every slot measures itself differently — a muzzle device is spread and
 * recoil, a magazine is capacity and reload, a handguard is nothing but weight
 * — so a fixed column set would be mostly empty cells whichever set you picked.
 * Deriving them also means a category EXBO adds next patch gets sensible
 * columns with no code change.
 *
 * Coverage is measured across the group as it appears on *this* page, not
 * across the catalogue, so the columns describe the parts you can actually fit.
 *
 * `MIN_COVERAGE` is deliberately low, because `MAX_STAT_COLUMNS` is what
 * actually keeps the table honest: the columns are ranked by coverage and the
 * top few taken, so a rare stat can only appear when the group has nothing
 * better to show. The floor exists purely to keep a column that one item in
 * forty carries from becoming thirty-nine dashes.
 *
 * It has to stay under a fifth. The LR-300's 45 sights record aim speed, draw
 * speed and stabilization on 22% each — those three are the whole reason to
 * prefer one optic over another, and at 0.25 the sights table showed weight
 * and nothing else.
 */
const MIN_COVERAGE = 0.15;
/**
 * The sections run the full content width, so the ceiling is readability rather
 * than fit: past half a dozen numbers a row stops being comparable at a glance.
 * Muzzles and magazines are the groups that reach it — nine and ten candidate
 * stats respectively — and the coverage ranking picks which six survive.
 */
const MAX_STAT_COLUMNS = 6;

function columnsFor(items: { stats: Record<string, number> }[]): string[] {
	const seen = new Map<string, number>();
	for (const i of items) {
		for (const k of Object.keys(i.stats)) {
			if (statDict[k]) seen.set(k, (seen.get(k) ?? 0) + 1);
		}
	}

	// Weight is on everything, so by coverage it would always win a slot it does
	// not deserve — it is the tie-breaker you check last, not the headline. It is
	// pulled out here and appended after the stats that actually distinguish.
	const weight = seen.get('weight');
	seen.delete('weight');

	const ranked = [...seen.entries()]
		.filter(([, n]) => n / items.length >= MIN_COVERAGE)
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, MAX_STAT_COLUMNS - 1);

	/*
	 * Coverage decides WHICH columns; the group decides where they sit.
	 *
	 * Those are separable and were conflated. Coverage ranking is the right way to
	 * pick five stats out of eleven — it finds the ones that actually tell these
	 * parts apart — but it is a poor left-to-right order, because it interleaves
	 * subjects: a handgrip table came out Stabilization, Aim speed, Recoil
	 * buildup, Weapon ergonomics, Vertical recoil, which is three of one subject
	 * and two of another, shuffled. Grouped, the precision columns are one run and
	 * the readiness columns are the next, and coverage still breaks the tie inside
	 * each run so the most telling column leads its own block.
	 */
	const columns = ranked
		.sort((a, b) => statGroupOrder(a[0]) - statGroupOrder(b[0]))
		.map(([k]) => k);

	// Weight stays pinned last rather than sorting into its group. It is the
	// tie-breaker you check after you have chosen, and it is on every row.
	if (weight) columns.push('weight');
	return columns;
}

export interface CompatGroup {
	key: string;
	label: Localized;
	/** stat slugs this group's table columns show, in order */
	columns: string[];
	items: {
		id: string;
		slug: string;
		name: Localized;
		icon: string | null;
		rank: Rank;
		stats: Record<string, number>;
		/** rendered instead of the formatted number, where a stat is really a
		 *  list — a sight's magnifications, for one */
		display: Record<string, string>;
	}[];
}

export function load({ params }) {
	const found = resolve(params.slug);
	if (!found) error(404, `Unknown entity "${params.slug}"`);
	if (!found.capabilities.attachments) error(404, 'Nothing fits this item');

	const groups = new Map<string, CompatGroup>();

	for (const i of compatibleItems(found.item)) {
		if (i.enums.category === SKINS) continue;
		const derived = i.enums.category === OTHER ? splitOther(i.stats) : null;
		const zoom = zoomLevels(i.values?.sight_zoom);
		const key = derived ? derived.key : i.enums.category;

		let g = groups.get(key);
		if (!g) {
			g = {
				key,
				// the raw key is a poor label but a visible one — better than an
				// empty heading if EXBO adds a category before the i18n catches up
				label: derived ? derived.label : (enumLabels[i.enums.category] ?? { en: key }),
				columns: [],
				items: []
			};
			groups.set(key, g);
		}
		g.items.push({
			id: i.id,
			slug: slugFor(i.id),
			name: i.name,
			icon: i.icon,
			rank: i.rank,
			// Magnification is a list upstream ("x2.40, x1.50"), so it arrives as
			// text and cannot be a plain stat. The largest level stands in as the
			// sort key — a dual sight is filed under the most it can do — while the
			// cell shows every level.
			stats: zoom.length ? { ...i.stats, sight_zoom: Math.max(...zoom) } : i.stats,
			display: zoom.length ? { sight_zoom: formatZoom(zoom) } : {}
		});
	}

	/* Best first. `rankOrder` runs DEFAULT → … → LEGEND → QUEST_ITEM, so
	   descending puts the top-tier gear at the head of every table, which is the
	   order you shop in. Ties break on name so the list is still stable. */
	for (const g of groups.values()) {
		g.items.sort(
			(a, b) =>
				rankOrder(b.rank) - rankOrder(a.rank) || (a.name.en ?? '').localeCompare(b.name.en ?? '')
		);
	}

	/* Biggest section first, so the two columns pack tight: the groups run from
	   45 items down to 1, and leading with the long ones keeps the short ones
	   filling the gaps rather than leaving a ragged half-empty second column.
	   Cosmetics ignore all of it and stay last — they are the fold. */
	const ordered = [...groups.values()].sort(
		(a, b) =>
			b.items.length - a.items.length || (a.label.en ?? a.key).localeCompare(b.label.en ?? b.key)
	);

	for (const g of ordered) {
		g.columns = columnsFor(g.items);
		// only the columns this group shows; an attachment carries up to ten
		const keep = new Set(g.columns);
		for (const i of g.items) {
			i.stats = Object.fromEntries(Object.entries(i.stats).filter(([k]) => keep.has(k)));
		}
	}

	// the dictionary entries the tables need to format and label their columns
	const used = new Set(ordered.flatMap((g) => g.columns));

	return {
		groups: ordered,
		statMeta: Object.fromEntries(
			[...used].filter((k) => statDict[k]).map((k) => [k, statDict[k]])
		) as Record<string, StatMeta>,
		total: ordered.reduce((n, g) => n + g.items.length, 0)
	};
}
