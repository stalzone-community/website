import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	alertPayload,
	fanOut,
	isPushEndpoint,
	parseSubscription,
	type PushMessage,
	type Sender,
	type SubscriptionDoc
} from '../src/lib/server/push.ts';

const FCM = 'https://fcm.googleapis.com/fcm/send/abc123';

const subscription = (over: Record<string, unknown> = {}) => ({
	subscription: {
		endpoint: FCM,
		keys: { p256dh: 'BNc'.padEnd(87, 'x'), auth: 'k7Yl'.padEnd(22, 'x') },
		...over
	},
	regions: ['RU']
});

const doc = (endpoint: string): SubscriptionDoc => ({
	_id: endpoint,
	keys: { p256dh: 'p', auth: 'a' },
	regions: ['RU'],
	createdAt: new Date(0),
	seenAt: new Date(0)
});

const message: PushMessage = { payload: '{}', topic: 'emission-RU' };

/* ---------- endpoint validation ---------- */

test('accepts the four real push services', () => {
	assert.ok(isPushEndpoint('https://fcm.googleapis.com/fcm/send/x'));
	assert.ok(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x'));
	assert.ok(isPushEndpoint('https://wns2-by3p.notify.windows.com/w/?token=x'));
	assert.ok(isPushEndpoint('https://web.push.apple.com/x'));
});

test('rejects anything that is not a push service', () => {
	// the point of the allowlist: without it, subscribing turns the emission
	// poller into a request cannon aimed wherever the caller likes
	assert.equal(isPushEndpoint('https://example.com/collect'), false);
	assert.equal(isPushEndpoint('https://fcm.googleapis.com.evil.test/x'), false);
	assert.equal(isPushEndpoint('http://fcm.googleapis.com/x'), false, 'http is not https');
	assert.equal(isPushEndpoint('not a url'), false);
});

/* ---------- parseSubscription ---------- */

test('parses a well-formed subscription', () => {
	const result = parseSubscription(subscription());
	assert.ok(result.ok);
	assert.equal(result.value.endpoint, FCM);
	assert.deepEqual(result.value.regions, ['RU']);
});

test('drops unknown regions and duplicates', () => {
	const result = parseSubscription({ ...subscription(), regions: ['RU', 'RU', 'XX', 'SEA'] });
	assert.ok(result.ok);
	assert.deepEqual(result.value.regions, ['RU', 'SEA']);
});

test('regions omitted is the rotation case, not an error', () => {
	// the service worker re-subscribes on pushsubscriptionchange and has no idea
	// which regions the user picked — only the server ever knew
	const { subscription: sub } = subscription();
	const result = parseSubscription({ subscription: sub });
	assert.ok(result.ok);
	assert.equal(result.value.regions, null);
});

test('regions present but all invalid is an error', () => {
	const result = parseSubscription({ ...subscription(), regions: ['XX'] });
	assert.equal(result.ok, false);
});

test('rejects malformed input', () => {
	assert.equal(parseSubscription(null).ok, false);
	assert.equal(parseSubscription({}).ok, false);
	assert.equal(parseSubscription(subscription({ endpoint: 'https://evil.test/x' })).ok, false);
	assert.equal(parseSubscription(subscription({ keys: { p256dh: 'x' } })).ok, false);
	assert.equal(parseSubscription(subscription({ keys: { p256dh: '!!', auth: '!!' } })).ok, false);
	assert.equal(
		parseSubscription(subscription({ endpoint: `https://fcm.googleapis.com/${'x'.repeat(2000)}` })).ok,
		false
	);
});

/* ---------- wording ---------- */

test('the two alerts say opposite things', () => {
	const started = alertPayload({ region: 'RU', kind: 'started' }, 'https://example.test');
	const ended = alertPayload({ region: 'RU', kind: 'ended' }, 'https://example.test');

	assert.match(started.body, /cover/i);
	assert.match(ended.body, /safe/i);
	assert.notEqual(started.title, ended.title);
});

test('the click-through link carries the region and no double slash', () => {
	const payload = alertPayload({ region: 'SEA', kind: 'ended' }, 'https://example.test/');
	assert.equal(payload.url, 'https://example.test/emission?region=SEA');
});

/* ---------- fan-out ---------- */

test('sends to every subscriber', async () => {
	const seen: string[] = [];
	const send: Sender = async (sub) => {
		seen.push(sub.endpoint);
	};

	const result = await fanOut([doc('a'), doc('b'), doc('c')], message, send);
	assert.equal(result.sent, 3);
	assert.deepEqual(seen.sort(), ['a', 'b', 'c']);
});

test('410 and 404 are pruned, other failures are kept', async () => {
	const send: Sender = async (sub) => {
		if (sub.endpoint === 'gone-410') throw Object.assign(new Error('gone'), { statusCode: 410 });
		if (sub.endpoint === 'gone-404') throw Object.assign(new Error('gone'), { statusCode: 404 });
		if (sub.endpoint === 'flaky') throw Object.assign(new Error('boom'), { statusCode: 500 });
		if (sub.endpoint === 'offline') throw new Error('ECONNRESET');
	};

	const result = await fanOut(
		[doc('ok'), doc('gone-410'), doc('gone-404'), doc('flaky'), doc('offline')],
		message,
		send
	);

	assert.equal(result.sent, 1);
	assert.deepEqual(result.gone.sort(), ['gone-404', 'gone-410']);
	assert.deepEqual(
		result.failed.map((f) => f.endpoint).sort(),
		['flaky', 'offline'],
		'a 500 or a dropped connection is a bad minute, not a dead subscriber'
	);
});

test('one failure does not abandon the rest of the region', async () => {
	const send: Sender = async (sub) => {
		if (sub.endpoint === 'b') throw Object.assign(new Error('nope'), { statusCode: 500 });
	};

	const result = await fanOut([doc('a'), doc('b'), doc('c')], message, send);
	assert.equal(result.sent, 2);
});

test('never runs more than 20 sends at once', async () => {
	let inFlight = 0;
	let peak = 0;
	const send: Sender = async () => {
		peak = Math.max(peak, ++inFlight);
		await new Promise((resolve) => setTimeout(resolve, 1));
		inFlight--;
	};

	const docs = Array.from({ length: 100 }, (_, i) => doc(`e${i}`));
	const result = await fanOut(docs, message, send);

	assert.equal(result.sent, 100);
	assert.ok(peak <= 20, `peak concurrency was ${peak}`);
	assert.ok(peak > 1, 'sends should overlap at all');
});

test('an empty region is not an error', async () => {
	const result = await fanOut([], message, async () => {});
	assert.deepEqual(result, { sent: 0, gone: [], failed: [] });
});
