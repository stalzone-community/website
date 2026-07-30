import { error, json } from '@sveltejs/kit';
import { pushConfigured, vapidPublicKey } from '$lib/server/push';

/**
 * The VAPID public key, which the browser needs before it can subscribe.
 *
 * WHY AN ENDPOINT AND NOT $env/static/public
 *
 * A static public env var is inlined at build time, and the build is a Docker
 * image built by CI — where the key is not available, because in production it
 * is a Fly secret and Fly secrets are runtime-only. Reading it at request time
 * from process.env keeps the key exactly where the private one already is, and
 * matches how every other config value in this app is read.
 *
 * It is fetched on click, not on load, so a visitor who never touches the alert
 * toggle never pays for it.
 */
export const prerender = false;

export function GET() {
	if (!pushConfigured()) error(503, 'push notifications are not configured');

	return json(
		{ key: vapidPublicKey() },
		// Public, immutable in practice — rotating it invalidates every
		// subscription anyway, so an hour of caching costs nothing.
		{ headers: { 'cache-control': 'public, max-age=3600' } }
	);
}
