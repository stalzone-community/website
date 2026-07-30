import { error } from '@sveltejs/kit';
import { assemblesInto, boundOnAssembly, partsFor } from '$lib/server/assembly';
import { getItem } from '$lib/server/catalogue';
import { resolve, slugFor } from '$lib/server/entities';
import { craftedFrom, obtainableFrom, perks, tradedFor, usedInCrafting } from '$lib/server/recipes';
import { craftGraph } from '$lib/server/craft-tree';
import type { ItemAmount, Localized } from '$lib/types';

/**
 * Every way this entity is made, bought, used or paid with.
 *
 * One tab for benches and traders both, because a player on this page is asking
 * one question — how do I get one — and the two are the alternative answers to
 * it, not separate subjects.
 *
 * Three depths of "made from", which is the thing to keep straight:
 *   - `madeFrom`   the bench recipes, one step, exactly as the game states them
 *   - `materials`  the same chain walked to the bottom: what you end up
 *                  gathering, once every intermediate part is itself crafted
 *   - /craft/[slug]  the whole graph drawn out, which this page links to
 * The middle one is what a player actually shops for and the one the game never
 * tells you, so it is here rather than only on the graph page.
 */
export function load({ params }) {
	const found = resolve(params.slug);
	if (!found) error(404, `Unknown entity "${params.slug}"`);
	const { crafting, trading } = found.capabilities;
	if (!crafting && !trading) error(404, 'Nothing crafts or trades this item');

	const { item } = found;

	// Recipes and offers name items by id; resolve just the ones this page renders.
	const refNames = new Map<string, { name: Localized; icon: string | null; slug: string }>();
	const noteRef = (id: string) => {
		if (refNames.has(id)) return;
		const it = getItem(id);
		if (it) refNames.set(id, { name: it.name, icon: it.icon, slug: slugFor(id) });
	};
	const noteAll = (rows: ItemAmount[]) => rows.forEach((r) => noteRef(r.item));

	/* Assembly: the fourth way to get something, and the only one upstream does
	   not put in a recipe table. Parts are joined to their gear by name in
	   $lib/server/assembly, which is also what tells the auction tab that gear
	   built from a bind-on-pickup part can never be listed — worth saying here,
	   because "why is there no price history" is answered by this section. */
	const assembledFrom = partsFor(item.id);
	const assembles = assemblesInto(item.id);
	assembledFrom.forEach(noteRef);
	assembles.forEach(noteRef);

	const madeFrom = craftedFrom(item.id);
	const usedIn = usedInCrafting(item.id);
	const buyFrom = obtainableFrom(item.id);
	const paysFor = tradedFor(item.id);
	for (const r of madeFrom) noteAll(r.ingredients);
	for (const r of usedIn) noteAll(r.result);
	for (const b of buyFrom) noteAll(b.requiredItems);
	for (const b of paysFor) noteRef(b.item);

	/* The parts list, rolled down the whole chain.
	   Built here rather than shipped from the graph page because it is cheap —
	   one rooted walk over the hideout table already in memory, and this page is
	   prerendered anyway — and because it is the answer to "what do I need",
	   which is what a player came for. Amounts are per recipe and NOT multiplied
	   down the chain; see the note on rollUp() in $lib/craft-tree for why the
	   honest total is not available from a deduplicated graph. */
	const graph = madeFrom.length ? craftGraph(item.id) : null;
	const steps = graph?.nodes.filter((n) => n.kind === 'recipe').length ?? 0;
	/* One step means the rolled-up list IS the recipe's own ingredients, which
	   are on screen twenty pixels above. Only a chain with something underneath
	   it has anything to add. */
	const chain =
		graph && steps > 1
			? { materials: graph.materials, steps, tiers: graph.tiers, slug: slugFor(item.id) }
			: null;
	if (chain) noteAll(chain.materials);

	return {
		craft: {
			madeFrom,
			usedIn,
			buyFrom,
			paysFor,
			chain,
			assembledFrom,
			assembles,
			/* Why the assembled thing has no auction tab. Read from the same
			   record rather than re-derived, so the two tabs cannot disagree. */
			boundOnAssembly: boundOnAssembly(item.id),
			names: Object.fromEntries(refNames),
			perks: Object.fromEntries(
				[...new Set(madeFrom.flatMap((r) => Object.keys(r.perks)))]
					.filter((p) => perks[p])
					.map((p) => [p, perks[p]])
			)
		}
	};
}
