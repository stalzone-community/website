/// <reference lib="webworker" />

/**
 * The only code in this app that runs while the site is closed.
 *
 * It exists solely to receive emission pushes and draw a notification. There is
 * deliberately no offline caching here: caching the item database would be a
 * separate feature with its own invalidation problem, and every line of it would
 * be a line that can break the one job this file has.
 *
 * SvelteKit excludes src/service-worker.ts from the app's tsconfig (it is a
 * different global environment), so `npm run check` type-checks it through
 * tsconfig.service-worker.json instead. It is bundled separately and served at
 * /service-worker.js; SvelteKit injects the registration call into every page.
 *
 * THE CONTRACT WITH THE BROWSER
 *
 * The subscription was created with `userVisibleOnly: true`, which is not a hint
 * — every push must result in a visible notification. Push a few that draw
 * nothing and the browser revokes the permission for the whole origin. Hence the
 * fallback text below: an unparseable payload still shows something rather than
 * spending one of those strikes.
 */

export {};

const sw = self as unknown as ServiceWorkerGlobalScope;

declare global {
	interface NotificationOptions {
		/**
		 * Re-alert when a notification replaces one with the same tag. Shipped in
		 * Chrome and Android since forever and ignored elsewhere, but TypeScript's
		 * lib still does not declare it.
		 */
		renotify?: boolean;
	}
}

/** Matches AlertPayload in $lib/server/push.ts. */
interface AlertPayload {
	region: string;
	kind: 'started' | 'ended';
	title: string;
	body: string;
	url: string;
}

sw.addEventListener('install', () => {
	// Nothing to pre-cache, so skip straight to activating rather than waiting
	// for every tab to close — a subscriber who reloads should be on the new
	// worker immediately.
	void sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(sw.clients.claim());
});

sw.addEventListener('push', (event) => {
	const alert = read(event.data);

	event.waitUntil(
		sw.registration.showNotification(alert.title, {
			body: alert.body,
			icon: '/icon-192.png',
			badge: '/badge-72.png',
			// One tag per region: "all clear" REPLACES that region's "emission
			// started" in the tray instead of stacking under it, so what is on
			// screen is always the current state of the Zone.
			tag: `emission-${alert.region}`,
			// ...but still alert for the replacement. Without this, a silent swap
			// means the all-clear arrives unannounced.
			renotify: true,
			// "Get to cover" should stay up until acknowledged. "Safe to go
			// outside" has done its job the moment it is seen.
			requireInteraction: alert.kind === 'started',
			data: { url: alert.url }
		})
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = (event.notification.data as { url?: string } | null)?.url;
	if (!url) return;

	// Focus an already-open tab of ours before opening another one. A stalker who
	// left the site open in a pinned tab does not want a second copy of it.
	event.waitUntil(
		(async () => {
			const target = new URL(url);
			const clients = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });

			for (const client of clients) {
				if (new URL(client.url).origin !== target.origin) continue;
				await client.focus();
				if (client.url !== target.href) await client.navigate(target.href);
				return;
			}
			await sw.clients.openWindow(target.href);
		})()
	);
});

/**
 * Browsers rotate a subscription's endpoint on their own schedule — after a
 * push service outage, a profile migration, or for no reason they explain. The
 * old address stops working and neither side is told, which is exactly how a
 * push feature quietly stops working for a slice of its users.
 *
 * Re-subscribe with the same key and tell the server which row to replace; it
 * carries the region choice across, since we do not know it here.
 */
sw.addEventListener('pushsubscriptionchange', (event) => {
	event.waitUntil(
		(async () => {
			const previous = event.oldSubscription;
			const key = previous?.options?.applicationServerKey;
			if (!key) return;

			const subscription =
				event.newSubscription ??
				(await sw.registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: key
				}));

			await fetch('/api/push/subscription', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ subscription: subscription.toJSON(), replaces: previous.endpoint })
			});
		})()
	);
});

function read(data: PushMessageData | null): AlertPayload {
	try {
		const parsed = data?.json() as Partial<AlertPayload> | undefined;
		if (parsed?.title && parsed.body) {
			return {
				region: parsed.region ?? '',
				kind: parsed.kind === 'ended' ? 'ended' : 'started',
				title: parsed.title,
				body: parsed.body,
				url: parsed.url ?? '/emission'
			};
		}
	} catch {
		// fall through
	}
	return {
		region: '',
		kind: 'started',
		title: 'Emission',
		body: 'Check the Zone status.',
		url: '/emission'
	};
}
