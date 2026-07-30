/**
 * One published build.
 *
 * The page a shared link points at, so it is SSR and its metadata is real —
 * name, author and tags in the HTML rather than assembled after hydration.
 *
 * A private build 404s for everyone but its owner. Not 403: telling a stranger
 * that a slug exists but is not for them is more than they asked and more than
 * they should get.
 */
import { error } from '@sveltejs/kit';
import { getBuild, votedSlugs } from '$lib/server/builds';
import { dbConfigured } from '$lib/server/db';
import { currentUser } from '$lib/server/session';
import { isSlug } from '$lib/calc/publish';
import type { PageServerLoad } from './$types.ts';

export const prerender = false;

export const load: PageServerLoad = async ({ cookies, params }) => {
	if (!isSlug(params.slug)) error(404, 'No such build');
	if (!dbConfigured()) error(404, 'No such build');

	const user = currentUser(cookies);
	const build = await getBuild(params.slug, user);
	if (!build) error(404, 'No such build');

	const voted = await votedSlugs(user, [build.slug]);

	return {
		build,
		user,
		voted: voted.has(build.slug),
		isOwner: Boolean(user && user.id === build.author.id)
	};
};
