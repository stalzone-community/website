/**
 * Pure query helpers over the item catalogue.
 *
 * Deliberately free of project dependencies — no JSON import, no $lib/server —
 * so plain node:test can load it without Vite's import chain, and so the client
 * can use the same filter logic the server used. The data is passed in. The one
 * import is sveltekit-commons/text, which is itself pure and import-free.
 */
import type { Item, Lang, Rank, StatMeta, StatRange, Variant } from './types.ts';

/** Rank order as the game presents it, worst to best. */
export const RANKS: Rank[] = [
	'DEFAULT',
	'RANK_NEWBIE',
	'RANK_STALKER',
	'RANK_VETERAN',
	'RANK_MASTER',
	'RANK_LEGEND',
	'QUEST_ITEM'
];

const RANK_ORDER = new Map(RANKS.map((r, i) => [r, i]));

export function rankOrder(r: Rank): number {
	return RANK_ORDER.get(r) ?? 0;
}

/** `RANK_MASTER` → `master`, for CSS custom-property lookup. */
export function rankSlug(r: Rank): string {
	return r.replace(/^RANK_/, '').toLowerCase();
}

export function itemName(item: Pick<Item, 'name' | 'id'>, lang: Lang): string {
	return item.name[lang] ?? item.name.en ?? item.id;
}

/**
 * `"x2.40, x1.50"` → `[2.4, 1.5]`.
 *
 * A sight's magnification is one of the four stats upstream writes as literal
 * text rather than a number (see `Item.values`), and it is a list because half
 * the optics in the game are dual-magnification — the ACOG toggles 2.4× and
 * 1.5×, the Apogee 4× and 6×. Sorted ascending rather than left in upstream's
 * order, which is inconsistent between sights — the ACOG lists "x2.40, x1.50"
 * and the Apogee "x4.00, x6.00", so as written one column would read high-low
 * on one row and low-high on the next.
 */
export function zoomLevels(text: string | undefined | null): number[] {
	if (!text) return [];
	return text
		.split(',')
		.map((part) => Number.parseFloat(part.trim().replace(/^x/i, '')))
		.filter((n) => Number.isFinite(n))
		.sort((a, b) => a - b);
}

/** `[2.4, 1.5]` → `"2.4× · 1.5×"`. Trailing zeros dropped — "x2.40" reads as 2.4. */
export function formatZoom(levels: number[]): string {
	return levels.map((n) => `${Number(n.toFixed(2))}×`).join(' · ');
}

/* The fold is in commons, where UAR's search uses it too. Re-exported so the
   call sites here and the client-side filter keep importing it from one place.
   Its NFC pass matters for this catalogue in particular: without it every
   Korean name folded to something that no longer equalled itself. */
import { foldForSearch } from 'sveltekit-commons/text';
export { foldForSearch };

export interface ItemFilter {
	group?: string;
	category?: string;
	rank?: Rank;
	/** free text, matched against the name in every language */
	q?: string;
}

/**
 * The checkable filters, which are a different animal from `group` and `rank`.
 *
 * Those two are single-select — an item has exactly one group and one rank, so
 * picking a second replaces the first. These are independent properties an item
 * either has or does not, so several can be on at once and they narrow: each
 * one checked is another thing the item must be. That is why they get their own
 * row of controls rather than joining the category chips, where they would look
 * like more of the same and behave differently.
 *
 * `attachments` rather than `compatible`: the URL is read by people.
 */
export const ITEM_FLAGS = [
	'craftable',
	'buyable',
	'upgradeable',
	'attachments',
	'tech-tree'
] as const;
export type ItemFlag = (typeof ITEM_FLAGS)[number];

export const ITEM_FLAG_LABEL: Record<ItemFlag, string> = {
	craftable: 'Craftable',
	buyable: 'Buyable',
	upgradeable: 'Upgradeable',
	attachments: 'Has attachments',
	'tech-tree': 'On a tech tree'
};

/**
 * The longer sentence, for the chip's tooltip.
 *
 * `craftable` and `buyable` are two ways to end up holding the same item and a
 * player picks between them, so they are two chips rather than one "obtainable"
 * — and the hints are what stop the pair being read as the same question asked
 * twice. Neither is the same as being a crafting *material* or a trade-in:
 * those are the reverse direction through the same tables, and no chip here
 * asks about them.
 */
export const ITEM_FLAG_HINT: Record<ItemFlag, string> = {
	craftable: 'A hideout recipe produces this item',
	buyable: 'A trader hands this item over, for money or a trade-in',
	upgradeable: 'Has a +1..+15 upgrade path',
	attachments: 'Has compatible attachments',
	'tech-tree': 'Sits on a barter progression tree'
};

/**
 * Read `?has=craftable,tech-tree`.
 *
 * A whitelist, for the same reason `?sort=` is one: this is visitor input, and
 * an unknown name must drop out rather than reach a predicate lookup. Order and
 * duplicates are discarded — the set is what matters, and normalising here is
 * what makes the round trip through `flagsParam` stable.
 */
export function parseFlags(raw: string | null | undefined): ItemFlag[] {
	if (!raw) return [];
	const asked = new Set(raw.split(',').map((s) => s.trim()));
	return ITEM_FLAGS.filter((f) => asked.has(f));
}

/** The `?has=` value for a set of flags; empty means drop the parameter. */
export function flagsParam(flags: ItemFlag[]): string {
	return ITEM_FLAGS.filter((f) => flags.includes(f)).join(',');
}

/** Add or remove one flag — what a chip click does. */
export function toggleFlag(flags: ItemFlag[], flag: ItemFlag): ItemFlag[] {
	return flags.includes(flag) ? flags.filter((f) => f !== flag) : [...flags, flag];
}

/* Matching them is deliberately NOT here. Two of the four are facts the item
   carries and two are memberships of other tables — the recipes and the barter
   trees, both server-only. A predicate map next to those tables is one lookup;
   a pure matcher here would need the caller to resolve all four first, for
   every item, including the ones nobody checked. */

/** The minimum a filterable/sortable row must carry — satisfied by both `Item`
 *  and the lighter `ListItem` a list page ships. */
export type FilterableItem = Pick<Item, 'id' | 'name' | 'group' | 'category' | 'rank'>;

export function matchesFilter(item: FilterableItem, f: ItemFilter, lang: Lang): boolean {
	if (f.group && item.group !== f.group) return false;
	if (f.category && item.category !== f.category) return false;
	if (f.rank && item.rank !== f.rank) return false;
	if (f.q) {
		const needle = foldForSearch(f.q);
		if (!needle) return true;
		// the current language first (the common hit), then any other — a French
		// visitor searching an English weapon name should still find it
		const primary = itemName(item, lang);
		if (foldForSearch(primary).includes(needle)) return true;
		return Object.values(item.name).some((n) => foldForSearch(n).includes(needle));
	}
	return true;
}

export type SortKey = 'name' | 'rank' | 'weight' | (string & {});

/**
 * Comparator over items. Unknown keys are read from `stats`, so any of the 161
 * stats can sort a column without a special case here. Items missing the stat
 * sort last regardless of direction — "no value" is not "zero".
 */
export function compareItems(
	a: FilterableItem & { stats?: Record<string, number> },
	b: FilterableItem & { stats?: Record<string, number> },
	key: SortKey,
	dir: 1 | -1,
	lang: Lang
): number {
	if (key === 'name') return itemName(a, lang).localeCompare(itemName(b, lang)) * dir;
	if (key === 'rank') {
		const d = (rankOrder(a.rank) - rankOrder(b.rank)) * dir;
		return d || itemName(a, lang).localeCompare(itemName(b, lang));
	}
	const av = a.stats?.[key];
	const bv = b.stats?.[key];
	if (av === undefined && bv === undefined) return itemName(a, lang).localeCompare(itemName(b, lang));
	if (av === undefined) return 1;
	if (bv === undefined) return -1;
	return (av - bv) * dir || itemName(a, lang).localeCompare(itemName(b, lang));
}

export interface Facet<T extends string = string> {
	value: T;
	count: number;
}

/** Counts per category and rank for the items given — drives the filter UI. */
export function facetsOf(items: FilterableItem[]): {
	groups: Facet[];
	categories: Facet[];
	ranks: Facet<Rank>[];
} {
	const g = new Map<string, number>();
	const c = new Map<string, number>();
	const r = new Map<Rank, number>();
	for (const i of items) {
		g.set(i.group, (g.get(i.group) ?? 0) + 1);
		c.set(i.category, (c.get(i.category) ?? 0) + 1);
		r.set(i.rank, (r.get(i.rank) ?? 0) + 1);
	}
	const byCount = <T extends string>(m: Map<T, number>): Facet<T>[] =>
		[...m].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
	return {
		groups: byCount(g),
		categories: byCount(c),
		ranks: [...r]
			.map(([value, count]) => ({ value, count }))
			.sort((a, b) => rankOrder(a.value) - rankOrder(b.value))
	};
}

/** The stats worth showing as columns for a set of items: those most of them carry. */
export function commonStats(items: Item[], stats: Record<string, StatMeta>, min = 0.5): string[] {
	if (!items.length) return [];
	const n = new Map<string, number>();
	for (const i of items) for (const k of Object.keys(i.stats)) n.set(k, (n.get(k) ?? 0) + 1);
	return [...n]
		.filter(([, count]) => count / items.length >= min)
		.sort((a, b) => b[1] - a[1])
		.map(([k]) => k)
		.filter((k) => k in stats);
}

/** Only the upgrade-related fields — the item page drops `compatible` from its
 *  payload, so these must not demand a whole `Item`. */
export type UpgradableItem = Pick<Item, 'stats' | 'damage' | 'variants'>;

/**
 * An item's stats at a given upgrade level. Variants store only what differs
 * from level 0, so this layers the delta over the base rather than replacing it.
 */
export function statsAtLevel(item: UpgradableItem, level: number): Record<string, number> {
	if (!level) return item.stats;
	const v = item.variants.find((x) => x.level === level);
	return v ? { ...item.stats, ...v.stats } : item.stats;
}

/**
 * An item's effect *bands* at a given upgrade level.
 *
 * The catalogue-level counterpart of `calc/artefact.ts:bandsAtLevel`, which
 * does the same lookup against the calculator's own `CalcArtefact` shape. This
 * one exists so an entity page can render correct bands without pulling in the
 * whole build model; anything that needs a *value* out of a band — quality,
 * rarity, container effectiveness — belongs in calc, not here.
 *
 * Load-bearing for artefacts: 102 of the 103 widen their bands as they upgrade
 * — Cycle's stamina runs [13.09, 15.4] at level 0 and [17.02, 20.02] at 15.
 * Nothing else in the catalogue does this. Rendering the level-0 bands on an
 * upgraded artefact silently understates every one of its effects.
 */
export function rangesAtLevel(
	item: Pick<Item, 'ranges' | 'variants'>,
	level: number
): Record<string, StatRange> {
	if (!level) return item.ranges;
	const v = item.variants.find((x) => x.level === level);
	return v ? { ...item.ranges, ...v.ranges } : item.ranges;
}

export function damageAtLevel(item: UpgradableItem, level: number): Item['damage'] {
	if (!level) return item.damage;
	return item.variants.find((x) => x.level === level)?.damage ?? item.damage;
}

export function maxLevel(item: Pick<Item, 'variants'>): number {
	return item.variants.reduce((m, v) => Math.max(m, v.level), 0);
}

/** Format a stat for display using the unit learned from upstream. */
export function formatStat(value: number, meta: StatMeta | undefined, lang: Lang): string {
	const rounded = Math.abs(value) < 1 ? Number(value.toFixed(3)) : Number(value.toFixed(2));
	const sign = meta?.signed && rounded > 0 ? '+' : '';
	const num = rounded.toLocaleString(lang === 'ko' ? 'ko-KR' : lang);
	if (!meta?.unit) return `${sign}${num}`;
	// "%" and "°" sit tight against the number; word units get a space
	const tight = meta.unit === '%' || meta.unit === '°';
	return `${sign}${num}${tight ? '' : ' '}${meta.unit}`;
}

/**
 * Points for a damage-vs-distance chart: full damage out to `damageDecreaseStart`,
 * a linear fall to `endDamage` at `damageDecreaseEnd`, then flat to `maxDistance`.
 */
export function damageCurve(d: NonNullable<Item['damage']>): { x: number; y: number }[] {
	return [
		{ x: 0, y: d.startDamage },
		{ x: d.damageDecreaseStart, y: d.startDamage },
		{ x: d.damageDecreaseEnd, y: d.endDamage },
		{ x: d.maxDistance, y: d.endDamage }
	];
}

export type { Item, Variant };
