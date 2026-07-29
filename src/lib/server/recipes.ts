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

/** True when an item participates in any recipe at all — lets a page skip the
 *  whole panel without four lookups. */
export function hasRecipes(id: string): boolean {
	return producedBy.has(id) || consumedBy.has(id) || offeredAs.has(id) || demandedBy.has(id);
}
