import { error } from '@sveltejs/kit';
import { resolve } from '$lib/server/entities';
import { modelFor, modelUrls } from '$lib/server/models';

/**
 * The extracted mesh for this entity.
 *
 * The lightest loader on the page — a slug and three URLs. All the weight is in
 * the files themselves, which the browser fetches directly from /models and the
 * CDN caches by model rather than by item, so the three AKS-74 variants share
 * one download between them.
 *
 * Unlike every other tab there is nothing to derive here, because the matching
 * was already done offline: mapping a DB item id onto a file in a 43 GB game
 * install is not work a request can do, so scripts/build-models.ts does it once
 * per patch and commits the answer.
 */
export function load({ params }) {
	const found = resolve(params.slug);
	if (!found) error(404, `Unknown entity "${params.slug}"`);

	const slug = modelFor(found.item.id);
	/* Guarded rather than assumed: `prerender = 'auto'` on the layout keeps this
	   route in the server manifest, so it is reachable by hand for an item whose
	   tab bar never offered it. */
	if (!slug) error(404, 'No model was extracted for this item');

	return { model: modelUrls(slug), slug };
}
