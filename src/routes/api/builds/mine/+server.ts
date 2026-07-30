/**
 * The caller's own published builds, public and private.
 *
 * Exists so the local list can say which of its entries are synced: /builds
 * merges what is in this browser with what is on the account, matched by slug.
 * Without it a build saved on a laptop would look unsynced on a phone that had
 * never seen it.
 *
 * `/api/builds/mine` sits under the same `[slug]` parent as a real slug would,
 * so it is spelled in a way `isSlug` rejects — six characters minimum, and this
 * is four. SvelteKit prefers the static segment regardless; the length rule
 * means even a hand-written request cannot confuse the two.
 */
import { json } from '@sveltejs/kit';
import { listMine } from '$lib/server/builds';
import { dbConfigured } from '$lib/server/db';
import { currentUser } from '$lib/server/session';
import type { RequestHandler } from './$types.ts';

export const prerender = false;

export const GET: RequestHandler = async ({ cookies }) => {
	const user = currentUser(cookies);
	if (!user) return json({ builds: [] }, { headers: { 'cache-control': 'no-store' } });
	if (!dbConfigured()) return json({ builds: [] }, { headers: { 'cache-control': 'no-store' } });

	return json({ builds: await listMine(user) }, { headers: { 'cache-control': 'no-store' } });
};
