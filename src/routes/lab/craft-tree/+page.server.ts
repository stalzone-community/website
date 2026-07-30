import { error } from '@sveltejs/kit';
import { craftableIds, layoutCraftPage } from '$lib/server/craft-tree';
import { idFromSlug } from '$lib/entities';

/**
 * A bare bench for the craft graph. Not linked from anywhere and not
 * prerendered — it exists to take the entity page's chrome out of the picture
 * when the diagram misbehaves: no tabs, no infobox, no full-bleed margins, no
 * height derived from the shell's variables. Just the component in a box with
 * a size.
 *
 * `?id=` takes a bare item id or a slug; the default is a mid-sized chain.
 */
export const prerender = false;

export function load({ url }) {
	const asked = url.searchParams.get('id') ?? 'lynrj';
	const page = layoutCraftPage(idFromSlug(asked)) ?? layoutCraftPage(asked);
	if (!page) error(404, `Nothing crafts "${asked}"`);
	return { tree: page, ids: craftableIds().slice(0, 40) };
}
