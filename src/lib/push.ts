/**
 * Browser side of emission alerts.
 *
 * Everything here runs in the page, not in the service worker — this module
 * only arranges the subscription; delivery is src/service-worker.ts.
 *
 * THE ORDER MATTERS AND IT IS NOT THE OBVIOUS ONE
 *
 * `Notification.requestPermission()` must be called from a user gesture. Not a
 * recommendation: Chrome silently resolves to "default" without one, and Safari
 * rejects outright. Every function here is therefore written to be called from a
 * click handler and to do its `await`s after the prompt, never before — an await
 * before the prompt can outlive the gesture and lose it.
 */
import { REGIONS, type RegionId } from './regions.ts';

export type SubscribeResult =
	| { status: 'subscribed'; regions: RegionId[] }
	| { status: 'denied' }
	| { status: 'unsupported'; reason: UnsupportedReason }
	| { status: 'error'; message: string };

export type UnsupportedReason =
	/** Not a browser feature we can reach — old browser, or a non-secure origin. */
	| 'no-push'
	/**
	 * iOS/iPadOS Safari: Web Push works only once the site has been added to the
	 * home screen. The API is present but subscribing throws, so this has to be
	 * detected up front and explained rather than discovered as a failure.
	 */
	| 'ios-needs-install';

export type PushSupport = { ok: true } | { ok: false; reason: UnsupportedReason };

export function pushSupport(): PushSupport {
	if (typeof window === 'undefined') return { ok: false, reason: 'no-push' };
	// The iOS check comes first: there the API is present but unusable, which
	// reads as a broken site unless it is named.
	if (isIos() && !isStandalone()) return { ok: false, reason: 'ios-needs-install' };
	if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
		return { ok: false, reason: 'no-push' };
	}
	return { ok: true };
}

/** iPhone and iPad, including iPadOS reporting itself as a Mac with a touchscreen. */
function isIos(): boolean {
	const ua = navigator.userAgent;
	return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

/** True once the site has been installed to the home screen / dock. */
function isStandalone(): boolean {
	return (
		window.matchMedia('(display-mode: standalone)').matches ||
		(navigator as { standalone?: boolean }).standalone === true
	);
}

/** The regions this browser currently receives alerts for. Empty when not subscribed. */
export async function currentRegions(): Promise<RegionId[] | null> {
	if (!pushSupport().ok) return null;
	const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
	if (!subscription) return null;
	// The server holds the authoritative choice, but reading it back would need an
	// endpoint that takes an endpoint URL as input — a lookup oracle for anyone
	// who guesses one. The local mirror is good enough for rendering a toggle.
	return readStoredRegions();
}

export async function subscribe(regions: RegionId[]): Promise<SubscribeResult> {
	const support = pushSupport();
	if (!support.ok) return { status: 'unsupported', reason: support.reason };
	if (!regions.length) return { status: 'error', message: 'pick at least one region' };

	// First, while the click is still fresh.
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') return { status: 'denied' };

	try {
		const registration = await navigator.serviceWorker.ready;
		const existing = await registration.pushManager.getSubscription();

		// Re-subscribing with a different key silently keeps the old subscription,
		// whose payloads we can no longer encrypt. Drop it and start over.
		const key = await applicationServerKey();
		if (existing && !sameKey(existing, key)) await existing.unsubscribe();

		const subscription =
			existing && sameKey(existing, key)
				? existing
				: await registration.pushManager.subscribe({
						userVisibleOnly: true,
						applicationServerKey: key
					});

		const response = await fetch('/api/push/subscription', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ subscription: subscription.toJSON(), regions })
		});
		if (!response.ok) return { status: 'error', message: await message(response) };

		const saved = (await response.json()) as { regions: RegionId[] };
		storeRegions(saved.regions);
		return { status: 'subscribed', regions: saved.regions };
	} catch (err) {
		return { status: 'error', message: err instanceof Error ? err.message : 'subscribe failed' };
	}
}

export async function unsubscribe(): Promise<{ ok: boolean; message?: string }> {
	if (!pushSupport().ok) return { ok: true };

	try {
		const registration = await navigator.serviceWorker.ready;
		const subscription = await registration.pushManager.getSubscription();
		storeRegions([]);
		if (!subscription) return { ok: true };

		// Tell the server first. If the browser-side unsubscribe succeeds and the
		// request does not, the row survives with an endpoint that will never
		// 410 — it is gone from the browser but still live at the push service.
		await fetch('/api/push/subscription', {
			method: 'DELETE',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ endpoint: subscription.endpoint })
		});
		await subscription.unsubscribe();
		return { ok: true };
	} catch (err) {
		return { ok: false, message: err instanceof Error ? err.message : 'unsubscribe failed' };
	}
}

/**
 * The VAPID public key, as the raw bytes `pushManager.subscribe` wants.
 *
 * The wire format is base64url; the API takes a BufferSource. Every push
 * tutorial on the internet carries some version of this function because the
 * platform never provided one.
 */
async function applicationServerKey(): Promise<Uint8Array<ArrayBuffer>> {
	const response = await fetch('/api/push/key');
	if (!response.ok) throw new Error('push notifications are not configured on the server');
	const { key } = (await response.json()) as { key: string };
	return decodeBase64Url(key);
}

export function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
	const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
	const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
	// Built over an explicit ArrayBuffer rather than Uint8Array.from: subscribe()
	// wants a BufferSource, and a Uint8Array over the generic ArrayBufferLike
	// (which might be shared memory) is not one.
	const bytes = new Uint8Array(new ArrayBuffer(binary.length));
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function sameKey(subscription: PushSubscription, key: Uint8Array<ArrayBuffer>): boolean {
	const existing = subscription.options.applicationServerKey;
	if (!existing) return false;
	const bytes = new Uint8Array(existing);
	return bytes.length === key.length && bytes.every((b, i) => b === key[i]);
}

async function message(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { message?: string };
		return body.message ?? `server said ${response.status}`;
	} catch {
		return `server said ${response.status}`;
	}
}

/*
 * A local mirror of the region choice, so the toggles render correctly on the
 * next visit without a round trip. The server's copy is the one that decides
 * what gets sent; this one only decides what the checkboxes look like.
 */
const STORAGE_KEY = 'sz:emission-alerts';

function storeRegions(regions: RegionId[]): void {
	try {
		if (regions.length) localStorage.setItem(STORAGE_KEY, regions.join(','));
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// private mode, or storage disabled — the feature still works
	}
}

function readStoredRegions(): RegionId[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const ids = new Set(REGIONS.map((r) => r.id as string));
		return raw.split(',').filter((id): id is RegionId => ids.has(id));
	} catch {
		return [];
	}
}
