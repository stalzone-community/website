/**
 * Who is signed in, for the top bar.
 *
 * Every page on this site is prerendered, so the HTML in the CDN cannot know
 * who asked for it. The account button asks here once it is running in the
 * browser. Deliberately tiny, and `no-store`: a cached answer here would show
 * one visitor another's name.
 */
import { json } from '@sveltejs/kit';
import { currentUser } from '$lib/server/session';
import type { RequestHandler } from './$types.ts';

export const prerender = false;

/* `currentUser` rather than reading the cookie here: it is what every publish
   and vote endpoint asks, and the two must agree. Reading the session directly
   made the top bar say "Connect" while the API happily accepted the same
   visitor's votes — which is only visible with a development session, and would
   have been baffling to whoever hit it first. */
export const GET: RequestHandler = ({ cookies }) => {
	return json({ user: currentUser(cookies) }, { headers: { 'cache-control': 'no-store' } });
};
