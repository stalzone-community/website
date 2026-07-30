import { error, json } from '@sveltejs/kit';
import { dbConfigured } from '$lib/server/db';
import { deleteSubscription, parseSubscription, saveSubscription } from '$lib/server/push';

/**
 * Create, update and delete a browser's push subscription.
 *
 * Unauthenticated by design — there are no accounts, and the endpoint is itself
 * the identity: only the browser that owns one can receive what is sent to it.
 * What that does not give us is proof the caller owns the endpoint they are
 * deleting, so DELETE is an unsubscribe-anyone primitive. The blast radius is
 * "someone stops getting emission alerts", re-subscribing is one click, and the
 * alternative is an account system for a notification about the weather.
 *
 * POST handles two callers: the opt-in UI, which sends `regions`, and the
 * service worker's pushsubscriptionchange handler, which sends `replaces` and
 * no regions because it does not know them. See saveSubscription.
 */
export const prerender = false;

export async function POST({ request }) {
	if (!dbConfigured()) error(503, 'push notifications are not configured');

	const body = await readJson(request);
	const parsed = parseSubscription(body);
	if (!parsed.ok) error(400, parsed.reason);

	const replaces = (body as { replaces?: unknown }).replaces;
	const stored = await saveSubscription(
		parsed.value,
		typeof replaces === 'string' ? replaces : undefined
	);
	if (!stored) error(400, 'no regions, and none to inherit');

	return json({ ok: true, regions: stored });
}

export async function DELETE({ request }) {
	if (!dbConfigured()) error(503, 'push notifications are not configured');

	const endpoint = (await readJson(request) as { endpoint?: unknown }).endpoint;
	if (typeof endpoint !== 'string') error(400, 'missing endpoint');

	return json({ removed: await deleteSubscription(endpoint) });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'expected JSON');
	}
	if (typeof body !== 'object' || body === null) error(400, 'expected a JSON object');
	return body as Record<string, unknown>;
}
