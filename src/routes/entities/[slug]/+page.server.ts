import { allSlugs } from '$lib/server/entities';
import type { EntryGenerator } from './$types.ts';

/**
 * One prerendered page per entity, at its canonical slug.
 *
 * The tabs are not listed: they are links in the sublayout, so the prerenderer
 * finds them by crawling out from here. See the `prerender` note in
 * `+layout.server.ts`.
 *
 * No `load` — the overview renders the entity itself, and the sublayout has
 * already loaded it.
 */
export const entries: EntryGenerator = () => allSlugs().map((slug) => ({ slug }));
