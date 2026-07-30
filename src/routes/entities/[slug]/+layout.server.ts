import { error, redirect } from '@sveltejs/kit';
import { enumLabels, stats } from '$lib/server/catalogue';
import { resolve } from '$lib/server/entities';
import { entityHref, hasTab, tabSegment } from '$lib/entities';
import { maxLevel } from '$lib/items';

/**
 * What every tab of the entity page needs: the entity, what it can show, and
 * the stat dictionary the infobox reads. Each tab's own loader adds only its
 * slice — the recipes, the price series, the compatibility list — so a visitor
 * who came for the stats never downloads the other four.
 */

/**
 * 'auto', not the layout's `true`: every canonical slug is prerendered, but the
 * route also stays in the server manifest so unlisted params still reach `load`.
 * Without this the redirect below is dead code — a bare id or a slug from
 * before a rename would 404 instead of resolving, which is the whole reason the
 * id is carried in the slug.
 *
 * It sits on the layout so the tabs inherit it. They need no `entries` of their
 * own: the sublayout renders them as ordinary links, so the prerenderer reaches
 * them by crawling, and only for the entities whose capabilities put the link
 * on the page. That is what keeps a bound-on-acquire item from generating an
 * auction page nothing links to.
 */
export const prerender = 'auto';

export function load({ params, route }) {
	const found = resolve(params.slug);
	if (!found) error(404, `Unknown entity "${params.slug}"`);

	const tab = tabSegment(route.id) ?? '';

	// A stale slug (renamed upstream) or a bare id still resolves, but only the
	// canonical URL is served — otherwise the same entity exists at several
	// addresses and search engines split its ranking between them. The tab is
	// carried across: /entities/<stale>/craft has to land on the canonical
	// entity's crafting tab, not on its overview.
	if (found.canonical) redirect(308, entityHref(found.canonical, tab));

	const { item, capabilities, type } = found;

	/* A tab this entity does not have: land on its overview rather than 404.
	   The palette keeps the tab you searched from (see $lib/palette), and no
	   entity has all eight — a medkit found from a rifle's Attachments has no
	   attachments of its own, and that is an answer the overview gives, not an
	   error. 307 and not 308: capabilities are derived from the vendored
	   catalogue and a patch can add the tab back.

	   The tabs' own loaders still 404 on the same capability. Nothing reaches
	   them now — the layout's load is awaited first, parent before child, and a
	   redirect from any node wins over an error from another — but they are each
	   guarding a second condition of their own, and a tab that cannot answer
	   should say so wherever it is entered from. */
	if (!hasTab(capabilities, tab)) redirect(307, entityHref(found.slug));

	// Only the stat metadata this entity uses. All 161 on every page would be
	// most of the payload for no benefit.
	const used = new Set([...Object.keys(item.stats), ...Object.keys(item.ranges)]);
	for (const v of item.variants) for (const k of Object.keys(v.stats)) used.add(k);
	for (const k of Object.keys(item.enums)) used.add(k);

	// `compatible` is its own tab and resolves the ids to names there, so the raw
	// list would be the same strings twice; `unresolvedRefs` is diagnostic, not
	// page content.
	const { compatible: _ids, unresolvedRefs: _unresolved, ...entity } = item;

	return {
		entity,
		slug: found.slug,
		type,
		capabilities,
		maxLevel: maxLevel(item),
		statMeta: Object.fromEntries([...used].filter((k) => stats[k]).map((k) => [k, stats[k]])),
		enumLabels: Object.fromEntries(
			Object.values(item.enums)
				.filter((k) => enumLabels[k])
				.map((k) => [k, enumLabels[k]])
		)
	};
}
