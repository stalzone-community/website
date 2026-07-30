/**
 * Web push — the subscription store, and the fan-out that turns one emission
 * edge into one notification per subscriber.
 *
 * WHY THE SERVER HOLDS THE SUBSCRIPTIONS
 *
 * A browser cannot wake itself. The only way a closed tab or a locked phone
 * hears about an emission is if a push service (Mozilla's, Google's, Apple's)
 * is handed a message addressed to that browser — which means we keep the
 * address. That address is the whole subscription: an endpoint URL plus two
 * keys the payload is encrypted to. Nobody but that browser can read what we
 * send, and the push service only ever sees ciphertext.
 *
 * WHAT THE POLLER CALLS
 *
 * `notifyEmission({ region, kind })`, once per detected edge. Everything about
 * delivery — encryption, batching, dead subscriptions — is this module's
 * problem, and none of it is the poller's.
 *
 * THREE THINGS THAT ARE NOT OBVIOUS
 *
 * 1. TTL. An emission notification is worthless once the emission is over, so
 *    every push carries a five-minute TTL. Past that the push service DROPS it
 *    rather than handing it to a phone that wakes up an hour later and
 *    announces an emission that ended long ago. Nothing else enforces this —
 *    without a TTL the default is to hold the message for days.
 *
 * 2. Topic. Two pushes to the same subscription with the same `Topic` collapse:
 *    the later one replaces the earlier if the earlier has not been delivered
 *    yet. Both alerts for a region share a topic, so a phone that was offline
 *    through the whole emission wakes up to "all clear" alone instead of to a
 *    panic followed by its own retraction.
 *
 * 3. 404/410 means the subscription is gone for good — browser uninstalled,
 *    site data cleared, permission revoked. Those rows are deleted on sight.
 *    Nothing else prunes them, and they are the only reason this collection
 *    would ever grow without bound. Other failures are NOT pruned: a 400 is
 *    usually our own bad VAPID config, and treating that as "subscriber gone"
 *    would quietly delete the entire audience the first time the config broke.
 */
import webpush, { type PushSubscription } from 'web-push';
import { db } from './db.ts';
import { isRegionId, type RegionId } from '../regions.ts';

/** Seconds a push may sit in a push service's queue before it is dropped. */
const TTL_SECONDS = 300;

/**
 * Simultaneous sends. Each is one HTTPS request to a third party, so this is
 * about not opening a thousand sockets at once rather than about our own CPU.
 * Serially, a few hundred subscribers would take longer than the emission.
 */
const CONCURRENCY = 20;

export type AlertKind = 'started' | 'ended';

export interface EmissionAlert {
	region: RegionId;
	kind: AlertKind;
}

/** What the service worker receives. Kept small — the encrypted payload cap is ~4 KB. */
export interface AlertPayload {
	region: RegionId;
	kind: AlertKind;
	title: string;
	body: string;
	url: string;
}

export interface SubscriptionInput {
	endpoint: string;
	keys: { p256dh: string; auth: string };
	/**
	 * null when the caller did not say. That is the browser-rotated-our-endpoint
	 * case: the service worker re-subscribes on its own and has no idea which
	 * regions the user picked, because only the server ever knew. Resolved
	 * against the replaced row in saveSubscription.
	 */
	regions: RegionId[] | null;
}

/** One row of `push_subscriptions`. The endpoint URL is the `_id`. */
export interface SubscriptionDoc {
	_id: string;
	keys: { p256dh: string; auth: string };
	regions: RegionId[];
	createdAt: Date;
	seenAt: Date;
}

/** One encrypted-payload-plus-headers unit of work, built once per emission edge. */
export interface PushMessage {
	payload: string;
	/** RFC 8030 topic: max 32 URL-safe characters. Collapses undelivered pushes. */
	topic: string;
}

/** A single delivery attempt. Injected in tests so the fan-out needs no network. */
export type Sender = (subscription: PushSubscription, message: PushMessage) => Promise<void>;

export interface FanOutResult {
	sent: number;
	/** Endpoints the push service says no longer exist — safe to delete. */
	gone: string[];
	/** Everything else. Kept, retried on the next emission. */
	failed: Array<{ endpoint: string; status: number | null }>;
}

export function pushConfigured(): boolean {
	return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey(): string {
	const key = process.env.VAPID_PUBLIC_KEY;
	if (!key) throw new Error('VAPID_PUBLIC_KEY is not set');
	return key;
}

/**
 * Hostnames a real push endpoint can live on, as suffixes.
 *
 * Subscribing is necessarily unauthenticated — the whole point is that anyone
 * can ask for alerts — which means anyone can also hand us an arbitrary URL to
 * POST to on every emission. That is a request amplifier pointed at a victim of
 * their choosing, so the endpoint has to belong to a push service.
 *
 * Chrome/Chromium (and everything built on it) use fcm.googleapis.com, Firefox
 * updates.push.services.mozilla.com, Edge *.notify.windows.com, Safari
 * web.push.apple.com. A new browser vendor is a one-line change here.
 */
export const PUSH_HOST_SUFFIXES = [
	'.googleapis.com',
	'.push.services.mozilla.com',
	'.notify.windows.com',
	'.push.apple.com'
];

/**
 * Validation for whatever arrived on the wire. Pure, so the rules are testable
 * without a database — and strict, because every field here is echoed back to a
 * third-party URL of the client's choosing.
 */
export function parseSubscription(
	body: unknown
): { ok: true; value: SubscriptionInput } | { ok: false; reason: string } {
	if (typeof body !== 'object' || body === null) return { ok: false, reason: 'not an object' };
	const { subscription, regions } = body as Record<string, unknown>;

	if (typeof subscription !== 'object' || subscription === null) {
		return { ok: false, reason: 'missing subscription' };
	}
	const { endpoint, keys } = subscription as Record<string, unknown>;

	// https, bounded, and a known push service — see PUSH_HOST_SUFFIXES.
	if (typeof endpoint !== 'string' || endpoint.length > 1024) {
		return { ok: false, reason: 'bad endpoint' };
	}
	if (!isPushEndpoint(endpoint)) return { ok: false, reason: 'unknown push service' };

	if (typeof keys !== 'object' || keys === null) return { ok: false, reason: 'missing keys' };
	const { p256dh, auth } = keys as Record<string, unknown>;
	if (!isKey(p256dh, 200) || !isKey(auth, 100)) return { ok: false, reason: 'bad keys' };

	let wanted: RegionId[] | null = null;
	if (regions !== undefined) {
		if (!Array.isArray(regions)) return { ok: false, reason: 'regions must be an array' };
		wanted = [...new Set(regions)].filter(isRegionId);
		if (!wanted.length) return { ok: false, reason: 'no valid region' };
	}

	return { ok: true, value: { endpoint, keys: { p256dh, auth }, regions: wanted } };
}

export function isPushEndpoint(endpoint: string): boolean {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return false;
	}
	if (url.protocol !== 'https:') return false;
	return PUSH_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
}

function isKey(value: unknown, max: number): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= max && /^[A-Za-z0-9_-]+=*$/.test(value);
}

/**
 * The notification itself. Pure and separate from sending, because the wording
 * is the part worth a test — a "safe to go outside" that says the opposite is
 * the only bug in this file a user would actually notice.
 */
export function alertPayload({ region, kind }: EmissionAlert, origin: string): AlertPayload {
	const started = kind === 'started';
	return {
		region,
		kind,
		title: started ? `Emission — ${region}` : `All clear — ${region}`,
		body: started ? 'Get to cover.' : 'Safe to go outside.',
		url: `${origin.replace(/\/$/, '')}/emission?region=${region}`
	};
}

/**
 * Send one payload to many subscriptions, bounded to CONCURRENCY at a time.
 *
 * Never rejects: a push that fails is a fact about one subscriber, not a reason
 * to abandon the rest of the region.
 */
export async function fanOut(
	subscriptions: SubscriptionDoc[],
	message: PushMessage,
	send: Sender
): Promise<FanOutResult> {
	const result: FanOutResult = { sent: 0, gone: [], failed: [] };

	let cursor = 0;
	const worker = async (): Promise<void> => {
		while (cursor < subscriptions.length) {
			const doc = subscriptions[cursor++];
			try {
				await send({ endpoint: doc._id, keys: doc.keys }, message);
				result.sent++;
			} catch (err) {
				const status = statusOf(err);
				if (status === 404 || status === 410) result.gone.push(doc._id);
				else result.failed.push({ endpoint: doc._id, status });
			}
		}
	};

	await Promise.all(
		Array.from({ length: Math.min(CONCURRENCY, subscriptions.length) }, () => worker())
	);
	return result;
}

function statusOf(err: unknown): number | null {
	const status = (err as { statusCode?: unknown })?.statusCode;
	return typeof status === 'number' ? status : null;
}

/**
 * The real sender. `setVapidDetails` is applied on first use rather than at
 * import, so that importing this module in a test — or in a CLI that only wants
 * `parseSubscription` — does not require the keys to exist.
 */
let vapidReady = false;

export const sendOne: Sender = async (subscription, { payload, topic }) => {
	if (!vapidReady) {
		const publicKey = process.env.VAPID_PUBLIC_KEY;
		const privateKey = process.env.VAPID_PRIVATE_KEY;
		if (!publicKey || !privateKey) throw new Error('VAPID keys are not configured');
		webpush.setVapidDetails(
			process.env.VAPID_SUBJECT ?? 'mailto:dessallescedric@gmail.com',
			publicKey,
			privateKey
		);
		vapidReady = true;
	}

	await webpush.sendNotification(subscription, payload, {
		TTL: TTL_SECONDS,
		// "Deliver now" — without this a phone in battery saver may hold the
		// message until it next wakes for its own reasons.
		urgency: 'high',
		topic,
		timeout: 10_000
	});
};

/**
 * The one call the poller makes. Reads the region's subscribers, sends, and
 * deletes whatever the push services reported as gone.
 *
 * The read is by design cheap against the free Atlas tier's byte throttle:
 * ~300 bytes a row, a handful of times a day per region. That is nothing like
 * the catalogue read that db.ts exists to keep off the hot path.
 */
export async function notifyEmission(
	alert: EmissionAlert,
	send: Sender = sendOne
): Promise<FanOutResult> {
	const origin = process.env.PUBLIC_ORIGIN ?? 'https://stalzone.cedricdessalles.dev';
	const message: PushMessage = {
		payload: JSON.stringify(alertPayload(alert, origin)),
		// Shared by both alerts of a region, deliberately: see (2) at the top.
		topic: `emission-${alert.region}`
	};

	const d = await db();
	const collection = d.collection<SubscriptionDoc>('push_subscriptions');
	const subscriptions = await collection.find({ regions: alert.region }).toArray();
	if (!subscriptions.length) return { sent: 0, gone: [], failed: [] };

	const result = await fanOut(subscriptions, message, send);
	if (result.gone.length) await collection.deleteMany({ _id: { $in: result.gone } });
	return result;
}

/**
 * Upsert a subscription, keyed by its endpoint.
 *
 * Returns the regions actually stored, or null when they could not be
 * determined — i.e. a rotation whose old row is already gone, which is nothing
 * to save, because a subscription with no regions would never be sent anything.
 */
export async function saveSubscription(
	input: SubscriptionInput,
	replaces?: string
): Promise<RegionId[] | null> {
	const d = await db();
	const collection = d.collection<SubscriptionDoc>('push_subscriptions');

	let regions = input.regions;
	if (!regions) {
		if (!replaces) return null;
		regions = (await collection.findOne({ _id: replaces }))?.regions ?? null;
		if (!regions) return null;
	}

	// A rotated subscription is the same person with a new address. Drop the old
	// row, or they get every notification twice until the stale endpoint finally
	// 410s — which can take weeks.
	if (replaces && replaces !== input.endpoint) await collection.deleteOne({ _id: replaces });

	const now = new Date();
	await collection.updateOne(
		{ _id: input.endpoint },
		{
			$set: { keys: input.keys, regions, seenAt: now },
			$setOnInsert: { createdAt: now }
		},
		{ upsert: true }
	);
	return regions;
}

export async function deleteSubscription(endpoint: string): Promise<boolean> {
	const d = await db();
	const { deletedCount } = await d
		.collection<SubscriptionDoc>('push_subscriptions')
		.deleteOne({ _id: endpoint });
	return deletedCount > 0;
}

export async function countSubscriptions(region?: RegionId): Promise<number> {
	const d = await db();
	return d
		.collection<SubscriptionDoc>('push_subscriptions')
		.countDocuments(region ? { regions: region } : {});
}
