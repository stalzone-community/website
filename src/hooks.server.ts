import { building } from '$app/environment';
import { dbConfigured, ensureIndexes } from '$lib/server/db';

/**
 * Boot work, run once per server process.
 *
 * ensureIndexes() is idempotent and was until now called only by
 * scripts/seed-graph.ts, which is fine for collections that a script fills.
 * push_subscriptions is the first collection the *app* writes to, so its index
 * cannot depend on someone remembering to seed: a deploy to a fresh database
 * would otherwise scan the whole collection on every emission, forever, and
 * nothing would ever say so.
 *
 * `building` guards the prerender pass, which imports this module like any
 * other. Without the guard, `npm run build` would open an Atlas connection from
 * whatever machine happened to be building the image.
 *
 * Deliberately not awaited and deliberately not fatal: an index that cannot be
 * created is a slow query, not a reason for the site to refuse to serve 2 311
 * item pages that never touch the database.
 */
if (!building && dbConfigured()) {
	void ensureIndexes().catch((err: unknown) => {
		console.error('[startup] could not ensure indexes:', err);
	});
}
