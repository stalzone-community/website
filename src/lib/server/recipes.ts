/**
 * Crafting and barter recipes, indexed in memory.
 *
 * Server-only, and static like the catalogue: 368 hideout recipes and 1 946
 * barter offers are ~933 KB loaded once at boot, so every lookup is a Map hit.
 * The same reasoning as $lib/server/catalogue.ts — reading these from Atlas
 * would move all 2 311 prerendered item pages onto the throttled read path.
 * The Mongo copy (see scripts/seed-graph.ts) exists for open-ended graph
 * traversal on the future codex page, not for rendering an item.
 */
import raw from '../data/recipes.json' with { type: 'json' };
import type { BarterRecipe, HideoutRecipe, RecipeData } from '../types.ts';

const data = raw as unknown as RecipeData;

export const perks = data.perks;

/** The flat offer table. Exported for $lib/server/tech-tree, which reads the
 *  whole thing once at boot rather than per item — the indexes below answer
 *  "this item", the tech tree asks "every edge". */
export const barter = data.barter;

/** Likewise for $lib/server/craft-tree: a rooted craft graph walks the whole
 *  table by recipe index, which the id-keyed indexes below cannot express. */
export const hideout = data.hideout;

function index<T>(rows: T[], keys: (row: T) => string[]): Map<string, T[]> {
	const m = new Map<string, T[]>();
	for (const row of rows) {
		for (const k of new Set(keys(row))) {
			const bucket = m.get(k);
			if (bucket) bucket.push(row);
			else m.set(k, [row]);
		}
	}
	return m;
}

/** id → recipes that produce it */
const producedBy = index(data.hideout, (r) => r.result.map((x) => x.item));
/** id → recipes that consume it */
const consumedBy = index(data.hideout, (r) => r.ingredients.map((x) => x.item));
/** id → offers that hand it over */
const offeredAs = index(data.barter, (b) => [b.item]);
/** id → offers that demand it as payment */
const demandedBy = index(data.barter, (b) => b.requiredItems.map((x) => x.item));

export function craftedFrom(id: string): HideoutRecipe[] {
	return producedBy.get(id) ?? [];
}

export function usedInCrafting(id: string): HideoutRecipe[] {
	return consumedBy.get(id) ?? [];
}

export function obtainableFrom(id: string): BarterRecipe[] {
	// cheapest first, then by the settlement level needed — the order a player
	// actually cares about
	return [...(offeredAs.get(id) ?? [])].sort((a, b) => a.cost - b.cost || a.level - b.level);
}

export function tradedFor(id: string): BarterRecipe[] {
	return demandedBy.get(id) ?? [];
}

/**
 * Whether an item has anything to say on each of the two tabs.
 *
 * These are two questions, not one, and the split is the whole point: a bench
 * and a trader are two different ways to end up holding the same item, and a
 * player is usually choosing between them. Only 19 items in the catalogue offer
 * both, so one combined answer would put a tab on 993 pages that could speak to
 * a third of them.
 *
 * Each covers both directions through its own table, which is what its tab
 * shows: crafting is "made at a bench" and "goes into one", trading is "a
 * trader sells it" and "a trader takes it as payment".
 */
export function hasCrafting(id: string): boolean {
	return producedBy.has(id) || consumedBy.has(id);
}

export function hasTrading(id: string): boolean {
	return offeredAs.has(id) || demandedBy.has(id);
}
