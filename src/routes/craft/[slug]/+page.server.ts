import { error, redirect } from '@sveltejs/kit';
import { idFromSlug } from '$lib/entities';
import { craftableIds, layoutCraftPage } from '$lib/server/craft-tree';
import { slugFor } from '$lib/server/slugs';
import type { EntryGenerator } from './$types.ts';

/** One prerendered page per craftable item — 337 of them. */
export const entries: EntryGenerator = () => craftableIds().map((id) => ({ slug: slugFor(id) }));

/**
 * The standalone craft diagram: the whole chain, plus the gathered-materials
 * shopping list and the notes on what the graph had to leave out.
 *
 * The geometry and the routing are `layoutCraftPage` in $lib/server/craft-tree
 * now, shared with the entity page's craft-tree tab — a routing pitch that
 * drifted between two copies would show up as tangled wires on half the pages.
 */
export function load({ params }) {
	const id = idFromSlug(params.slug);

	const canonical = slugFor(id);
	if (params.slug !== canonical) redirect(308, `/craft/${canonical}`);

	const page = layoutCraftPage(id);
	if (!page) error(404, `Nothing crafts "${params.slug}"`);
	return page;
}
