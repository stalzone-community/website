/**
 * The community list.
 *
 * SSR, so the builds are in the HTML: this is the page a shared link lands on
 * and the one search engines should be able to read. That makes it the first
 * route on the site to opt out of the global prerender — everything else is
 * generated from the catalogue at build time, and this is generated from what
 * people published five minutes ago.
 *
 * One page is two queries: the builds, and which of them the viewer has already
 * voted for. Both take projections — the free Atlas tier meters bytes returned,
 * so a list page that fetched whole documents would be the most expensive read
 * on the site.
 */
import { listPublic, votedSlugs } from '$lib/server/builds';
import { dbConfigured } from '$lib/server/db';
import { currentUser } from '$lib/server/session';
import { BUILD_TAGS } from '$lib/calc/publish';
import type { PageServerLoad } from './$types.ts';

export const prerender = false;

const PAGE_SIZE = 20;

export const load: PageServerLoad = async ({ cookies, url }) => {
	const user = currentUser(cookies);
	const sort = url.searchParams.get('sort') === 'new' ? 'new' : 'top';

	const requested = url.searchParams.get('tag');
	const known = new Set<string>([...BUILD_TAGS.type, ...BUILD_TAGS.place]);
	const tag = requested && known.has(requested) ? requested : null;

	// the database is optional in development, and its absence is not an error
	// worth a 500 on a page whose other half is local storage
	if (!dbConfigured()) {
		return { user, sort, tag, builds: [], voted: [] as string[], storage: false };
	}

	const builds = await listPublic({ sort, tag, limit: PAGE_SIZE });
	const voted = await votedSlugs(
		user,
		builds.map((b) => b.slug)
	);

	return { user, sort, tag, builds, voted: [...voted], storage: true };
};
