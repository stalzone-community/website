/**
 * Upvoting.
 *
 * A toggle, not an increment: the same request removes a vote you already cast,
 * which is what the filled/hollow arrow on the card means.
 *
 * The 401 is the whole reason the connect prompt exists — a signed-out visitor
 * clicking the arrow gets this, and the page turns it into an invitation rather
 * than an error.
 */
import { json } from '@sveltejs/kit';
import { toggleVote } from '$lib/server/builds';
import { dbConfigured } from '$lib/server/db';
import { currentUser } from '$lib/server/session';
import { isSlug } from '$lib/calc/publish';
import type { RequestHandler } from './$types.ts';

export const prerender = false;

export const POST: RequestHandler = async ({ cookies, params }) => {
	const user = currentUser(cookies);
	if (!user) return json({ error: 'sign-in-required' }, { status: 401 });
	if (!isSlug(params.slug)) return json({ error: 'not-found' }, { status: 404 });
	if (!dbConfigured()) return json({ error: 'storage-unavailable' }, { status: 503 });

	const result = await toggleVote(user, params.slug);
	// a private build cannot be voted on, and says the same thing as one that
	// does not exist
	if (!result) return json({ error: 'not-found' }, { status: 404 });
	return json(result);
};
