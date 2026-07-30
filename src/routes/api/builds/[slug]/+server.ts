/**
 * One published build: delete it, or read it back.
 *
 * Deleting is owner-only, enforced in the query rather than by fetching and
 * comparing — see `deleteBuild`.
 */
import { json } from '@sveltejs/kit';
import { deleteBuild, getBuild } from '$lib/server/builds';
import { dbConfigured } from '$lib/server/db';
import { currentUser } from '$lib/server/session';
import { isSlug } from '$lib/calc/publish';
import type { RequestHandler } from './$types.ts';

export const prerender = false;

export const GET: RequestHandler = async ({ cookies, params }) => {
	if (!isSlug(params.slug)) return json({ error: 'not-found' }, { status: 404 });
	if (!dbConfigured()) return json({ error: 'storage-unavailable' }, { status: 503 });

	const build = await getBuild(params.slug, currentUser(cookies));
	if (!build) return json({ error: 'not-found' }, { status: 404 });
	return json({ build }, { headers: { 'cache-control': 'no-store' } });
};

export const DELETE: RequestHandler = async ({ cookies, params }) => {
	const user = currentUser(cookies);
	if (!user) return json({ error: 'sign-in-required' }, { status: 401 });
	if (!isSlug(params.slug)) return json({ error: 'not-found' }, { status: 404 });
	if (!dbConfigured()) return json({ error: 'storage-unavailable' }, { status: 503 });

	const gone = await deleteBuild(user, params.slug);
	if (!gone) return json({ error: 'not-found' }, { status: 404 });
	return json({ deleted: true });
};
