import { error } from '@sveltejs/kit';
import { compatibleItems, enumLabels, getItem, items, stats } from '$lib/server/catalogue';
import { craftedFrom, obtainableFrom, perks, tradedFor, usedInCrafting } from '$lib/server/recipes';
import { maxLevel } from '$lib/items';
import type { ItemAmount, Localized } from '$lib/types';
import type { EntryGenerator } from './$types.ts';

/** One prerendered page per item — 2 311 of them. */
export const entries: EntryGenerator = () => items.map((i) => ({ id: i.id }));

export function load({ params }) {
	const item = getItem(params.id);
	if (!item) error(404, `Unknown item "${params.id}"`);

	// Only the stat metadata this item actually uses. Shipping all 161 on every
	// item page would be most of the payload for no benefit.
	const used = new Set([...Object.keys(item.stats), ...Object.keys(item.ranges)]);
	for (const v of item.variants) for (const k of Object.keys(v.stats)) used.add(k);
	for (const k of Object.keys(item.enums)) used.add(k);

	const compatible = compatibleItems(item)
		.map((i) => ({ id: i.id, name: i.name, icon: i.icon, rank: i.rank }))
		.sort((a, b) => (a.name.en ?? '').localeCompare(b.name.en ?? ''));

	// `compatible` is resolved above, so the raw id list on the item would be the
	// same 264 strings a second time. `unresolvedRefs` is diagnostic, not page
	// content. Dropping both is most of this page's payload.
	const { compatible: _ids, unresolvedRefs: _unresolved, ...rest } = item;

	// Recipes reference items by id; resolve just the ones this page names, so
	// the component renders labels without a second lookup table.
	const refNames = new Map<string, { name: Localized; icon: string | null }>();
	const noteRef = (id: string) => {
		if (refNames.has(id)) return;
		const it = getItem(id);
		if (it) refNames.set(id, { name: it.name, icon: it.icon });
	};
	const noteAll = (rows: ItemAmount[]) => rows.forEach((r) => noteRef(r.item));

	const madeFrom = craftedFrom(item.id);
	const usedIn = usedInCrafting(item.id);
	const buyFrom = obtainableFrom(item.id);
	const paysFor = tradedFor(item.id);

	for (const r of madeFrom) noteAll(r.ingredients);
	for (const r of usedIn) noteAll(r.result);
	for (const b of buyFrom) noteAll(b.requiredItems);
	for (const b of paysFor) noteRef(b.item);

	return {
		item: rest,
		recipes: {
			madeFrom,
			usedIn,
			buyFrom,
			paysFor,
			names: Object.fromEntries(refNames),
			// only the perks these recipes actually gate on
			perks: Object.fromEntries(
				[...new Set(madeFrom.flatMap((r) => Object.keys(r.perks)))]
					.filter((p) => perks[p])
					.map((p) => [p, perks[p]])
			)
		},
		maxLevel: maxLevel(item),
		compatible,
		statMeta: Object.fromEntries([...used].filter((k) => stats[k]).map((k) => [k, stats[k]])),
		enumLabels: Object.fromEntries(
			Object.values(item.enums)
				.filter((k) => enumLabels[k])
				.map((k) => [k, enumLabels[k]])
		)
	};
}
