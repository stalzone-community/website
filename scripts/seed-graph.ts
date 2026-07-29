/**
 * Seeds the `nodes` / `relations` graph in Atlas from the vendored database.
 *
 * WHY THIS EXISTS, AND WHAT IT DELIBERATELY LEAVES OUT
 *
 * The item catalogue itself is served from the prerendered static payload —
 * putting 2 311 items on the byte-throttled M0 read path is the failure UAR's
 * db.ts spends 200 lines working around. What this seeds is the data the item
 * JSON does *not* carry and which is genuinely graph-shaped: 1 497 barter
 * recipes and 368 hideout recipes, both keyed by item id, plus the settlements,
 * benches and perks they hang off. That is the substrate for a guildwars3-style
 * codex/panels page.
 *
 * Compatibility edges (~70 000 pairs) are NOT seeded by default. They are
 * already in the static catalogue, the item page renders them from there, and
 * 70k documents is a meaningful slice of a 512 MB free cluster for data we can
 * already answer from memory. `--compatibility` opts in.
 *
 * Node shape mirrors guildwars3's lore-repo (`objectType` / `dataType` /
 * `games`) so the codex UI ports across rather than being rewritten.
 *
 *   node --env-file=.env scripts/seed-graph.ts --dry-run   # counts only, no writes
 *   node --env-file=.env scripts/seed-graph.ts
 *   node --env-file=.env scripts/seed-graph.ts --compatibility
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDb, db, dbConfigured, ensureIndexes } from '../src/lib/server/db.ts';
import { LANGS } from '../src/lib/types.ts';
import type { ItemDatabase, Localized } from '../src/lib/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const realm = argv.includes('--realm') ? argv[argv.indexOf('--realm') + 1] : 'global';
const dryRun = argv.includes('--dry-run');
const withCompatibility = argv.includes('--compatibility');

const DB = join(ROOT, 'vendor', 'stalzone-database', realm);
const ITEMS = join(ROOT, 'src', 'lib', 'data', 'items.json');

for (const [label, p] of [
	['vendored database', join(DB, 'listing.json')],
	['built catalogue', ITEMS]
] as const) {
	if (!existsSync(p)) {
		console.error(`[seed] missing ${label} at ${p} — run: npm run db`);
		process.exit(1);
	}
}

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const catalogue: ItemDatabase = read(ITEMS);

/** Upstream translation object → the five languages we keep. */
function localized(t: unknown): Localized {
	const lines = (t as { lines?: Record<string, string> })?.lines;
	if (!lines) return {};
	const out: Localized = {};
	for (const l of LANGS) if (lines[l]) out[l] = lines[l];
	return out;
}

interface NodeDoc {
	_id: string;
	objectType: 'item' | 'settlement' | 'bench' | 'perk';
	/** matches guildwars3: lore vs gamedata, so both can share collections */
	dataType: 'gamedata';
	games: string[];
	slug: string;
	name: Localized;
	/** lower-cased English name, the search index guildwars3 uses */
	nameLower: string;
	category?: string;
	group?: string;
	rank?: string;
	icon?: string | null;
}

interface RelationDoc {
	from: string;
	to: string;
	type: string;
	source: 'items' | 'barter' | 'hideout';
	amount?: number;
	cost?: number;
	currency?: string;
	level?: number;
	bench?: string;
	/** which settlement offers this barter — the same item is traded at several,
	 *  and without this the edges are indistinguishable and dedupe would erase
	 *  every location but one */
	settlement?: string;
}

const nodes = new Map<string, NodeDoc>();
const relations: RelationDoc[] = [];

const itemNode = (id: string) => `item:${id}`;
const en = (l: Localized) => (l.en ?? '').toLowerCase();

// ── item nodes ──────────────────────────────────────────────────────────────
for (const i of catalogue.items) {
	nodes.set(itemNode(i.id), {
		_id: itemNode(i.id),
		objectType: 'item',
		dataType: 'gamedata',
		games: ['stalzone'],
		slug: i.id,
		name: i.name,
		nameLower: en(i.name),
		category: i.category,
		group: i.group,
		rank: i.rank,
		icon: i.icon
	});
}

/** Recipes may name an item the catalogue does not carry (other realm, or
 *  removed). Those become edges to a node that does not exist, which would
 *  silently break traversal — so they are counted and skipped instead. */
let danglingRefs = 0;
const hasItem = (id: string) => nodes.has(itemNode(id));

// ── barter: settlements, and what they trade ────────────────────────────────
const barter: Array<{
	settlementTitle: { key: string; lines?: Record<string, string> };
	recipes: Array<{
		settlementRequiredLevel: number;
		item: string;
		offers: Array<{
			currency: string;
			cost: number;
			requiredItems: Array<{ item: string; amount: number }>;
		}>;
	}>;
}> = read(join(DB, 'barter_recipes.json'));

for (const settlement of barter) {
	const sid = `settlement:${settlement.settlementTitle.key}`;
	const sname = localized(settlement.settlementTitle);
	nodes.set(sid, {
		_id: sid,
		objectType: 'settlement',
		dataType: 'gamedata',
		games: ['stalzone'],
		slug: settlement.settlementTitle.key.replace(/^settlement\.id\./, '').replace(/\.title$/, ''),
		name: sname,
		nameLower: en(sname)
	});

	for (const r of settlement.recipes) {
		if (!hasItem(r.item)) {
			danglingRefs++;
			continue;
		}
		relations.push({
			from: itemNode(r.item),
			to: sid,
			type: 'sold_at',
			source: 'barter',
			level: r.settlementRequiredLevel
		});
		for (const offer of r.offers) {
			for (const req of offer.requiredItems) {
				if (!hasItem(req.item)) {
					danglingRefs++;
					continue;
				}
				relations.push({
					from: itemNode(r.item),
					to: itemNode(req.item),
					type: 'bartered_from',
					source: 'barter',
					amount: req.amount,
					cost: offer.cost,
					currency: offer.currency,
					settlement: sid
				});
			}
		}
	}
}

// ── hideout: benches, perks, crafting ───────────────────────────────────────
const hideout: {
	perks: Array<{ id: string; name: unknown; desc: unknown }>;
	recipes: Array<{
		bench: string;
		result: Array<{ item: string; amount: number }>;
		ingredients: Array<{ item: string; amount: number }>;
		energy: number;
		requirements?: { perks?: Record<string, number>; features?: string[] };
	}>;
} = read(join(DB, 'hideout_recipes.json'));

for (const p of hideout.perks) {
	const name = localized(p.name);
	nodes.set(`perk:${p.id}`, {
		_id: `perk:${p.id}`,
		objectType: 'perk',
		dataType: 'gamedata',
		games: ['stalzone'],
		slug: p.id,
		name,
		nameLower: en(name)
	});
}

for (const r of hideout.recipes) {
	const bid = `bench:${r.bench}`;
	if (!nodes.has(bid)) {
		nodes.set(bid, {
			_id: bid,
			objectType: 'bench',
			dataType: 'gamedata',
			games: ['stalzone'],
			slug: r.bench,
			name: { en: r.bench.replace(/_/g, ' ') },
			nameLower: r.bench.replace(/_/g, ' ')
		});
	}

	for (const out of r.result) {
		if (!hasItem(out.item)) {
			danglingRefs++;
			continue;
		}
		relations.push({ from: itemNode(out.item), to: bid, type: 'crafted_at', source: 'hideout' });

		for (const ing of r.ingredients) {
			if (!hasItem(ing.item)) {
				danglingRefs++;
				continue;
			}
			relations.push({
				from: itemNode(out.item),
				to: itemNode(ing.item),
				type: 'crafted_from',
				source: 'hideout',
				amount: ing.amount,
				bench: r.bench
			});
		}

		for (const [perk, level] of Object.entries(r.requirements?.perks ?? {})) {
			relations.push({
				from: itemNode(out.item),
				to: `perk:${perk}`,
				type: 'requires_perk',
				source: 'hideout',
				level
			});
		}
	}
}

// ── compatibility (opt-in) ──────────────────────────────────────────────────
if (withCompatibility) {
	// stored once per pair, lexically ordered, and queried with
	// $or:[{from},{to}] — the mirrored form would be ~140k docs for data the
	// static catalogue already answers
	const seen = new Set<string>();
	for (const i of catalogue.items) {
		for (const other of i.compatible) {
			const [a, b] = i.id < other ? [i.id, other] : [other, i.id];
			const key = `${a}|${b}`;
			if (seen.has(key)) continue;
			seen.add(key);
			relations.push({
				from: itemNode(a),
				to: itemNode(b),
				type: 'compatible_with',
				source: 'items'
			});
		}
	}
}

// ── dedupe ──────────────────────────────────────────────────────────────────
// Upstream ships some settlements twice under one title key — "The Bar" appears
// as two entries of 141 recipes, "Factions of the North" as 150 and 151. The
// node map already collapses those to one settlement, but their edges would be
// emitted twice over. Deduping on the whole edge (not just from/to/type) keeps
// the genuinely different rows, e.g. the same item offered at two prices.
const beforeDedupe = relations.length;
const edgeKey = (r: RelationDoc) =>
	[r.from, r.to, r.type, r.amount, r.cost, r.currency, r.level, r.bench, r.settlement].join(' ');
const deduped = [...new Map(relations.map((r) => [edgeKey(r), r])).values()];
relations.length = 0;
relations.push(...deduped);

// ── report ──────────────────────────────────────────────────────────────────
const byType = new Map<string, number>();
for (const r of relations) byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
const byObject = new Map<string, number>();
for (const n of nodes.values()) byObject.set(n.objectType, (byObject.get(n.objectType) ?? 0) + 1);

console.log(`[seed] realm ${realm} @ ${catalogue.source.sha.slice(0, 8)}`);
console.log(`[seed] ${nodes.size} nodes`);
for (const [k, v] of [...byObject].sort((a, b) => b[1] - a[1])) console.log(`[seed]     ${String(v).padStart(6)}  ${k}`);
console.log(`[seed] ${relations.length} relations`);
for (const [k, v] of [...byType].sort((a, b) => b[1] - a[1])) console.log(`[seed]     ${String(v).padStart(6)}  ${k}`);
if (beforeDedupe !== relations.length)
	console.log(`[seed] ${beforeDedupe - relations.length} duplicate edges collapsed (upstream ships some settlements twice)`);
if (danglingRefs) console.log(`[seed] ${danglingRefs} recipe refs skipped — item not in this realm`);
if (!withCompatibility)
	console.log('[seed] compatibility edges skipped (--compatibility to include; ~70k docs)');

if (dryRun) {
	console.log('[seed] dry run — nothing written');
	process.exit(0);
}

if (!dbConfigured()) {
	console.error('[seed] MONGODB_URI is not set — run with: node --env-file=.env scripts/seed-graph.ts');
	process.exit(1);
}

// ── write ───────────────────────────────────────────────────────────────────
const d = await db();
await ensureIndexes();

// Scoped to what this script owns, mirroring guildwars3's seed: the lore layer
// (and anything else) shares these collections and must survive a reseed.
await d.collection('nodes').deleteMany({ dataType: 'gamedata', games: 'stalzone' });
await d.collection('relations').deleteMany({ source: { $in: ['items', 'barter', 'hideout'] } });

/** Atlas throttles on bytes; batched inserts keep one request from dominating. */
async function insertAll(name: string, docs: object[]): Promise<void> {
	const BATCH = 1000;
	for (let i = 0; i < docs.length; i += BATCH) {
		await d.collection(name).insertMany(docs.slice(i, i + BATCH) as never[], { ordered: false });
	}
}

await insertAll('nodes', [...nodes.values()]);
await insertAll('relations', relations);

console.log(`[seed] wrote ${nodes.size} nodes and ${relations.length} relations to "${d.databaseName}"`);
await closeDb();
