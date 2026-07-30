import { facets, items, stats } from '$lib/server/catalogue';
import { slugFor } from '$lib/server/entities';
import { craftedFrom, obtainableFrom } from '$lib/server/recipes';
import { inTechTree } from '$lib/server/tech-tree';
import { compareItems, ITEM_FLAGS, matchesFilter, parseFlags, type ItemFlag, type SortKey } from '$lib/items';
import { PER_PAGE, pageNumber } from 'sveltekit-commons/paging';
import type { Item, Lang, Rank } from '$lib/types';

/**
 * The full-catalogue listing, with search, filters, sorting and paging.
 *
 * SSR rather than prerendered: the view is a function of the query string, and
 * there is no finite set of pages to generate. That costs nothing here — the
 * catalogue is already in memory (see $lib/server/catalogue), so a request is a
 * filter and a slice over 2 311 rows, not a database read. This is the one
 * place a page view does work, and it is CPU we own rather than bytes from a
 * throttled cluster.
 */
export const prerender = false;

/**
 * Sortable columns. A whitelist rather than "any stat", because `?sort=` is
 * visitor input and an arbitrary key would let a URL name a field the table
 * has no column for.
 */
const SORTS: SortKey[] = ['name', 'rank', 'weight', 'base_price', 'max_durability'];

/**
 * How each checkable filter is answered.
 *
 * Two are facts the item carries — a `variants` array is the +1..+15 upgrade
 * path, a `compatible` array is the attachments — and cost a length check.
 * The rest are memberships of tables that are also already in memory: recipes
 * and the barter trees, both loaded once at boot alongside the catalogue (see
 * $lib/server/catalogue for why none of this is a database read). So a checked
 * flag stays a filter over 2 311 rows, with nothing on the throttled Atlas
 * path.
 *
 * Crafting and buying are asked separately, and pointedly not through
 * `hasRecipes`: that one is true when an item appears anywhere in either table,
 * including as an ingredient someone else's recipe consumes or as the trade-in
 * a trader demands. Both are the reverse direction — they tell you what the
 * item is *for*, not how you get one — so a chip built on it would answer a
 * different question from the one it asked. `craftedFrom` and `obtainableFrom`
 * are the two that point at this item.
 */
const PREDICATE: Record<ItemFlag, (i: Item) => boolean> = {
	craftable: (i) => craftedFrom(i.id).length > 0,
	buyable: (i) => obtainableFrom(i.id).length > 0,
	upgradeable: (i) => i.variants.length > 0,
	attachments: (i) => i.compatible.length > 0,
	'tech-tree': (i) => inTechTree(i.id)
};

/**
 * How many items each flag would leave, over the whole catalogue.
 *
 * Counted once at module scope, not per request: none of these three tables
 * changes after boot, so this is four passes over 2 311 rows on the first
 * import and a lookup thereafter.
 *
 * Over the whole catalogue rather than the current result set, for the reason
 * already written on the group facets below — a count that moved as you
 * filtered would hide the option you were about to want. It is a promise about
 * the catalogue, not a readout of the table.
 */
const flagCounts = Object.fromEntries(
	ITEM_FLAGS.map((f) => [f, items.filter(PREDICATE[f]).length])
) as Record<ItemFlag, number>;

export function load({ url }) {
	const p = url.searchParams;
	const q = (p.get('q') ?? '').trim();
	const group = p.get('group') ?? '';
	const rank = (p.get('rank') ?? '') as Rank | '';

	const key = p.get('sort') ?? '';
	const sort: SortKey = (SORTS as string[]).includes(key) ? (key as SortKey) : 'name';
	// name reads naturally A→Z; every numeric column is more useful biggest-first
	const dir: 1 | -1 = p.get('dir') === 'asc' ? 1 : p.get('dir') === 'desc' ? -1 : sort === 'name' ? 1 : -1;

	const flags = parseFlags(p.get('has'));

	const lang: Lang = 'en';
	const filtered = items.filter(
		(i) =>
			matchesFilter(i, { q, group: group || undefined, rank: rank || undefined }, lang) &&
			// every checked flag must hold — they narrow, one click at a time. An
			// unchecked one is never evaluated.
			flags.every((f) => PREDICATE[f](i))
	);
	filtered.sort((a, b) => compareItems(a, b, sort, dir, lang));

	const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
	const page = pageNumber(p.get('page'), pages);
	const start = (page - 1) * PER_PAGE;

	return {
		// projected to what the table renders — the full items would be ~10x this
		rows: filtered.slice(start, start + PER_PAGE).map((i) => ({
			id: i.id,
			slug: slugFor(i.id),
			name: i.name,
			category: i.category,
			kind: i.kind,
			rank: i.rank,
			icon: i.icon,
			weight: i.stats.weight ?? null,
			price: i.stats.base_price ?? null,
			durability: i.stats.max_durability ?? null
		})),
		total: filtered.length,
		page,
		pages,
		perPage: PER_PAGE,
		start,
		q,
		group,
		rank,
		flags,
		flagCounts,
		sort,
		dir: dir === 1 ? 'asc' : 'desc',
		// facets come from the whole catalogue, not the filtered set: a count that
		// changed as you filtered would hide the option you wanted to switch to
		groups: facets.groups,
		ranks: facets.ranks,
		statMeta: Object.fromEntries(
			(['weight', 'base_price', 'max_durability'] as const)
				.filter((s) => stats[s])
				.map((s) => [s, stats[s]])
		)
	};
}
