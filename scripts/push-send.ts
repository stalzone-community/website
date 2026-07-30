/**
 * Send an emission alert by hand.
 *
 * This is what makes the feature testable before the poller exists: subscribe in
 * a browser, run this, and the notification arrives exactly as it will when the
 * API-driven poller calls the same function. It is also the tool for confirming
 * a production deploy actually delivers — nothing else in the stack proves that
 * end to end, because there is no way to fake a real push service.
 *
 *   node --env-file=.env scripts/push-send.ts RU started
 *   node --env-file=.env scripts/push-send.ts EU ended
 *   node --env-file=.env scripts/push-send.ts --count      # who is subscribed
 *
 * Anything it sends is real, and goes to every subscriber of that region.
 */
import { closeDb, dbConfigured } from '../src/lib/server/db.ts';
import { countSubscriptions, notifyEmission, pushConfigured } from '../src/lib/server/push.ts';
import { isRegionId, REGIONS } from '../src/lib/regions.ts';
import type { AlertKind } from '../src/lib/server/push.ts';

const argv = process.argv.slice(2);

function die(message: string): never {
	console.error(message);
	process.exit(1);
}

if (!dbConfigured()) die('MONGODB_URI is not set — run with `node --env-file=.env`.');

if (argv.includes('--count')) {
	const total = await countSubscriptions();
	const perRegion = await Promise.all(
		REGIONS.map(async (r) => `  ${r.id.padEnd(4)} ${await countSubscriptions(r.id)}`)
	);
	console.log(`${total} subscription${total === 1 ? '' : 's'}`);
	console.log(perRegion.join('\n'));
	await closeDb();
	process.exit(0);
}

const [region, kind = 'started'] = argv;

if (!isRegionId(region)) {
	die(`usage: push-send.ts <${REGIONS.map((r) => r.id).join('|')}> [started|ended]`);
}
if (kind !== 'started' && kind !== 'ended') die('kind must be "started" or "ended"');
if (!pushConfigured()) die('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set.');

const result = await notifyEmission({ region, kind: kind as AlertKind });

console.log(`${region} ${kind}: sent ${result.sent}`);
if (result.gone.length) console.log(`  pruned ${result.gone.length} dead subscription(s)`);
for (const failure of result.failed) {
	console.log(`  failed ${failure.status ?? 'network'} ${failure.endpoint.slice(0, 60)}…`);
}

await closeDb();
