/**
 * MongoDB (Atlas) access.
 *
 * WHAT LIVES HERE AND WHAT DOES NOT
 *
 * The 2 311-item catalogue is NOT read from here. It is generated at build time
 * (scripts/build-items.ts) and prerendered — the same split UAR settled on,
 * where wiki pages come from JSON snapshots and only mutable data is SSR from
 * Atlas. The reason is written all over UAR's db.ts: the free cluster throttles
 * on *bytes returned*, so a catalogue read is the one thing you never want on a
 * page view. `db:seed` still mirrors items into Atlas, but that copy exists for
 * cross-collection queries and the relation graph, not for rendering.
 *
 * Collections (db from MONGODB_DB, default "stalzone"):
 * - auction:    one doc per observed price point, per region+item. Append-only
 *               time series — the reason this database exists at all.
 * - emissions:  observed emission windows per region.
 * - push_subscriptions:
 *               browser push endpoints, keyed by the endpoint URL, with the
 *               regions each one wants alerts for. See $lib/server/push.ts.
 * - nodes:      items/mobs/locations as graph nodes, seeded from the built
 *               catalogue. Same shape as guildwars3 so the codex/panels page
 *               can be ported.
 * - relations:  typed edges between nodes (crafted_from, uses_ammo, …).
 * - feedback:   visitor-submitted, append-only.
 *
 * Uses process.env (not $env) so the same module works in the SvelteKit server
 * and in plain-node CLI scripts — same convention as UAR.
 */
import { MongoClient, type Db } from 'mongodb';

let client: MongoClient | null = null;

export function dbConfigured(): boolean {
	return Boolean(process.env.MONGODB_URI);
}

export async function db(): Promise<Db> {
	if (!client) {
		const uri = process.env.MONGODB_URI;
		if (!uri) throw new Error('MONGODB_URI is not set');
		client = new MongoClient(uri);
		await client.connect();
	}
	return client.db(process.env.MONGODB_DB || 'stalzone');
}

/**
 * Drop the shared pool. The server never calls this — it holds one client for
 * its whole life — but a CLI that touched this module otherwise never exits,
 * because the pool keeps the event loop alive.
 */
export async function closeDb(): Promise<void> {
	if (!client) return;
	const c = client;
	client = null;
	await c.close();
}

/**
 * Indexes the queries here rely on. `createIndex` is idempotent, so this is a
 * no-op after the first run. Deliberately short — every index costs storage
 * against the cluster limit.
 */
export async function ensureIndexes(): Promise<void> {
	if (!dbConfigured()) return;
	const d = await db();
	await Promise.all([
		// the price chart: one item's history in one region, oldest first
		d.collection('auction').createIndex({ region: 1, itemId: 1, at: 1 }, { name: 'price_series' }),
		// dedupe guard for the poller — the same observation must not double-write
		d
			.collection('auction')
			.createIndex({ region: 1, itemId: 1, at: 1, price: 1 }, { name: 'observation', unique: true }),
		d.collection('emissions').createIndex({ region: 1, start: -1 }, { name: 'region_start' }),
		// the only query the push fan-out makes: everyone watching one region.
		// The endpoint URL is the _id, so subscribe/unsubscribe are covered already.
		d.collection('push_subscriptions').createIndex({ regions: 1 }, { name: 'by_region' }),
		// graph traversal, mirroring guildwars3's lore-repo indexes
		d.collection('nodes').createIndex({ slug: 1 }, { name: 'slug', unique: true }),
		d.collection('nodes').createIndex({ objectType: 1 }, { name: 'objectType' }),
		d.collection('relations').createIndex({ from: 1 }, { name: 'from' }),
		d.collection('relations').createIndex({ to: 1 }, { name: 'to' }),
		d.collection('relations').createIndex({ type: 1 }, { name: 'type' }),
		// published builds: the list page's one sort, and the owner's own shelf
		d.collection('builds').createIndex({ slug: 1 }, { name: 'build_slug', unique: true }),
		d
			.collection('builds')
			.createIndex({ visibility: 1, votes: -1, createdAt: -1 }, { name: 'build_ranking' }),
		d.collection('builds').createIndex({ 'author.id': 1, updatedAt: -1 }, { name: 'build_author' }),
		// this one is not an optimisation: it is what makes one vote per account
		// true, rather than something the application hopes it checked first
		d
			.collection('build_votes')
			.createIndex({ slug: 1, user: 1 }, { name: 'one_vote', unique: true })
	]);
}

/**
 * A visitor's note from /feedback. Append-only — nothing updates or deletes
 * these, and no page reads them back; `scripts/list-feedback.ts` is the reader.
 *
 * Deliberately no index: the collection is read whole, by one person, from a
 * CLI. A `createdAt` index would cost storage against the cluster limit to
 * speed up a sort over a few hundred documents that nobody is waiting on.
 */
export interface FeedbackDoc {
	/** ISO-8601. A string, not a Date, so the CLI prints it without formatting. */
	createdAt: string;
	message: string;
	name?: string;
	contact?: string;
}

export async function insertFeedback(doc: FeedbackDoc): Promise<void> {
	const d = await db();
	await d.collection<FeedbackDoc>('feedback').insertOne(doc);
}
