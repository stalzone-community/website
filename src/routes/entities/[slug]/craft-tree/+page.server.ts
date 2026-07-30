import { error } from '@sveltejs/kit';
import { resolve } from '$lib/server/entities';
import { layoutCraftPage } from '$lib/server/craft-tree';

/**
 * The whole chain behind this item, drawn.
 *
 * The sibling of the tech-tree tab and never its neighbour: an item is on a
 * barter progression or it is made at a bench, and across all 2 311 items not
 * one is on both. So the two tabs share a slot in the bar without ever having
 * to argue about it, and each says which tree it is rather than both hiding
 * behind a vaguer word.
 *
 * The geometry and the routing are `layoutCraftPage`, shared with the
 * standalone /craft/[slug] page. That page stays the canonical address for the
 * diagram — it carries the gathered-materials list and the notes on what the
 * graph left out — and this tab is the same picture reached from the item.
 */
export function load({ params }) {
	const found = resolve(params.slug);
	if (!found) error(404, `Unknown entity "${params.slug}"`);
	if (!found.capabilities.craftTree) error(404, 'No bench makes this item');

	const page = layoutCraftPage(found.item.id);
	if (!page) error(404, 'No bench makes this item');
	return { craftTree: page };
}
