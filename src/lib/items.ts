/**
 * Pure query helpers over the item catalogue.
 *
 * Deliberately dependency-free — no JSON import, no $lib/server — so plain
 * node:test can load it without Vite's import chain, and so the client can use
 * the same filter logic the server used. The data is passed in.
 */
import type { Item, Lang, Rank, StatMeta, Variant } from './types.ts';

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

/** Fold accents and case so "Détecteur" matches "detecteur". */
export function foldForSearch(s: string): string {
	return s
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase();
}

export interface ItemFilter {
	group?: string;
	category?: string;
	rank?: Rank;
	/** free text, matched against the name in every language */
	q?: string;
}

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
