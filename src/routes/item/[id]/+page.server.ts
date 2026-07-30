import { error, redirect } from '@sveltejs/kit';
import { getItem } from '$lib/server/catalogue';
import { slugFor } from '$lib/server/entities';

/**
 * The detail page moved to /entities/[slug] when items, mobs and locations were
 * unified. Kept as a permanent redirect: these URLs were live and may already
 * be linked or indexed, and a 308 hands the ranking to the new address rather
 * than dropping it.
 *
 * Deliberately NOT prerendered — 2 311 redirect pages would double the build
 * output for URLs nothing links to internally any more.
 */
export const prerender = false;

export function load({ params }) {
	if (!getItem(params.id)) error(404, `Unknown item "${params.id}"`);
	redirect(308, `/entities/${slugFor(params.id)}`);
}
