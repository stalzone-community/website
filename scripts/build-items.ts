/**
 * Normalises the vendored EXBO database into typed JSON the app can query.
 *
 * Upstream ships 9 886 files but only 2 311 items: 505 of them carry 15 upgrade
 * levels each under `_variants/<id>/<n>.json`, sharing the parent's item id.
 * `listing.json` is the canonical index of the 2 311.
 *
 * The upstream item shape is a *presentation tree* (`infoBlocks`), not a stat
 * schema — nested blocks of numeric/key-value/range/item/text elements labelled
 * with i18n keys. This flattens that into queryable columns, hoists the labels
 * and units out of every item into a single stat dictionary, and stores upgrade
 * levels as deltas.
 *
 *   node scripts/build-items.ts
 *   node scripts/build-items.ts --realm ru
 */
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugFor, UnknownStatKeyError } from './lib/stat-keys.ts';
import { LANGS } from '../src/lib/types.ts';
import type {
	DamageRamp,
	DbSource,
	Item,
	ItemDatabase,
	ItemText,
	Localized,
	StatMeta,
	StatRange,
	Variant
} from '../src/lib/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const realm = argv.includes('--realm') ? argv[argv.indexOf('--realm') + 1] : 'global';
const DB = join(ROOT, 'vendor', 'stalzone-database', realm);
const OUT = join(ROOT, 'src', 'lib', 'data');

if (!existsSync(join(DB, 'listing.json'))) {
	console.error(`[build] no vendored database at ${DB} — run: npm run db:vendor`);
	process.exit(1);
}

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

/** Upstream translation object. */
interface Tr {
	type: 'translation';
	key: string;
	lines?: Record<string, string>;
}
const isTr = (o: unknown): o is Tr =>
	!!o && typeof o === 'object' && (o as Tr).type === 'translation';

function localized(t: unknown): Localized {
	if (!isTr(t) || !t.lines) return {};
	const out: Localized = {};
	for (const l of LANGS) if (t.lines[l]) out[l] = t.lines[l];
	return out;
}

/**
 * Upstream's `value` is not always signed the way upstream itself prints it.
 *
 * A sight that speeds your aim carries `value: 20` and `formatted: "-20%"` —
 * the number is the magnitude of a *time reduction*, and the minus lives only
 * in the rendered string. Store the raw value and the page says a scope makes
 * you 20% slower to aim, which is backwards.
 *
 * Two stats are inverted every single time they appear:
 *
 *   weapon.stat_factor.aim_switch_time   96 of 96
 *   weapon.stat_factor.draw_time         83 of 83
 *
 * and `reload_modifier` disagrees on 3 of its 4 374. Rather than special-case
 * three keys and re-check them each patch, take the sign from the string the
 * game itself shows: it is the one thing guaranteed to match what a player
 * reads in-game. The magnitude still comes from `value`, which carries the
 * precision the string has rounded away.
 */
function signedValue(value: number, formatted: unknown): number {
	const en = (formatted as { value?: Record<string, string> })?.value?.en;
	if (typeof en !== 'string') return value;
	const shown = en.trim();
	// only an explicit sign is evidence; "0.38 kg" says nothing either way
	if (shown.startsWith('-')) return -Math.abs(value);
	if (shown.startsWith('+')) return Math.abs(value);
	return value;
}

/**
 * Learn the display unit from upstream's own formatted string: "1 kg" → "kg",
 * "+13.09%" → "%", "[+13.09%; +15.4%]" → "%". Cheaper and more faithful than
 * hand-maintaining a unit table for 161 stats.
 */
function parseFormat(formatted: unknown): { unit: string | null; signed: boolean } {
	const en = (formatted as { value?: Record<string, string> })?.value?.en;
	if (typeof en !== 'string') return { unit: null, signed: false };
	const first = en.replace(/[[\]]/g, '').split(';')[0].trim();
	const signed = first.startsWith('+') || first.startsWith('-');
	// strip sign, digits, decimal separators and thin/regular spaces used as
	// thousand separators; whatever survives is the unit
	const unit = first.replace(/^[+-]/, '').replace(/[\d.,\s  ]/g, '').trim();
	// Some stats render as a pair rather than value+unit — magazine capacity is
	// "0/20" (loaded/capacity), which would otherwise yield a unit of "/". A
	// real unit contains a letter or a unit symbol.
	if (!/[\p{L}°%]/u.test(unit)) return { unit: null, signed };
	return { unit, signed };
}

// ── stat dictionary, accumulated while walking items ────────────────────────
const statMeta = new Map<string, StatMeta>();
const enumLabels = new Map<string, Localized>();

function noteStat(slug: string, key: string, label: unknown, formatted: unknown) {
	let m = statMeta.get(slug);
	if (!m) {
		const { unit, signed } = parseFormat(formatted);
		m = { slug, key, label: localized(label), unit, signed, items: 0 };
		statMeta.set(slug, m);
	}
	// a later item may carry the unit when the first didn't (value 0 renders bare)
	if (!m.unit) {
		const f = parseFormat(formatted);
		if (f.unit) m.unit = f.unit;
		if (f.signed) m.signed = true;
	}
	return m;
}

/**
 * The armour upgrade block, present only on `_variants/<id>/<n>.json`.
 *
 * It repeats a stat the item already carries — under the SAME key — but with the
 * upgrade's *bonus* rather than the upgraded value. On the Bandit Suit at level 1
 * the main block says `bullet_dmg_factor = 40.27` and this one says `1.27`; it
 * sorts last, so extracting it overwrote the real number with the delta, and at
 * level 15 the delta happened to equal the level-0 value (39), which the
 * differs-from-base filter in `loadVariants` then dropped entirely.
 *
 * The bonus is `variant − base`, so nothing is lost by skipping it. Verified
 * across the database: no armour upgrade block carries a key that appears
 * nowhere else in the same file.
 *
 * The weapon block of the same name is NOT skipped. Its keys live in the
 * `weapon.stat_factor` namespace (slug prefix `upg_`), appear in no other block,
 * and are the only source of the upgrade factors — real information, not a
 * duplicate.
 */
const ARMOR_UPGRADE_BLOCK = 'stalker.tooltip.armor_artefact.info.upgrade_stats';

interface Extracted {
	stats: Record<string, number>;
	enums: Record<string, string>;
	/** key-value stats whose value is a literal string — see Item.values */
	values: Record<string, string>;
	ranges: Record<string, StatRange>;
	damage: DamageRamp | null;
	refs: string[];
	usedInCrafts: boolean;
	texts: ItemText[];
	/** every stat slug seen, so callers can count items-carrying once per item */
	slugs: Set<string>;
}

function extract(item: any): Extracted {
	const out: Extracted = {
		stats: {},
		enums: {},
		values: {},
		ranges: {},
		damage: null,
		refs: [],
		usedInCrafts: false,
		texts: [],
		slugs: new Set<string>()
	};
	const seenSlugs = out.slugs;

	const visit = (el: any) => {
		if (!el || typeof el !== 'object') return;
		switch (el.type) {
			case 'numeric': {
				if (!isTr(el.name) || typeof el.value !== 'number') break;
				const slug = slugFor(el.name.key);
				noteStat(slug, el.name.key, el.name, el.formatted);
				out.stats[slug] = signedValue(el.value, el.formatted);
				seenSlugs.add(slug);
				break;
			}
			case 'range': {
				if (!isTr(el.name)) break;
				const slug = slugFor(el.name.key);
				noteStat(slug, el.name.key, el.name, el.formatted);
				out.ranges[slug] = { min: el.min, max: el.max };
				seenSlugs.add(slug);
				break;
			}
			case 'key-value': {
				if (!isTr(el.key)) break;
				const slug = slugFor(el.key.key);
				noteStat(slug, el.key.key, el.key, undefined);
				seenSlugs.add(slug);
				if (isTr(el.value)) {
					out.enums[slug] = el.value.key;
					if (!enumLabels.has(el.value.key)) enumLabels.set(el.value.key, localized(el.value));
				} else if (el.value?.type === 'text' && typeof el.value.text === 'string') {
					// Not every key-value carries a translation. A sight's magnification
					// is the literal "x1.00, x1.50", an artefact's freshness is "III" —
					// numerals, so upstream ships them untranslated. Without this branch
					// `noteStat` still counted them into the dictionary (sight_zoom said
					// 34 items) while the value itself went nowhere.
					out.values[slug] = el.value.text;
				}
				break;
			}
			case 'item':
				// only a name key — upstream gives no id here, resolved in a second pass
				if (isTr(el.name)) out.refs.push(el.name.key);
				break;
			case 'usage':
				out.usedInCrafts = true;
				break;
			case 'text':
				if (isTr(el.text) || isTr(el.title)) {
					out.texts.push({
						titleKey: isTr(el.title) ? el.title.key : null,
						title: isTr(el.title) ? localized(el.title) : null,
						textKey: isTr(el.text) ? el.text.key : null,
						text: localized(el.text)
					});
				}
				break;
		}
		for (const child of el.elements ?? []) visit(child);
	};

	for (const b of item.infoBlocks ?? []) {
		if (isTr(b?.title) && b.title.key === ARMOR_UPGRADE_BLOCK) continue;
		if (b?.type === 'damage') {
			out.damage = {
				startDamage: b.startDamage,
				damageDecreaseStart: b.damageDecreaseStart,
				endDamage: b.endDamage,
				damageDecreaseEnd: b.damageDecreaseEnd,
				maxDistance: b.maxDistance
			};
			continue;
		}
		if (b?.type === 'text') {
			out.texts.push({
				titleKey: isTr(b.title) ? b.title.key : null,
				title: isTr(b.title) ? localized(b.title) : null,
				textKey: isTr(b.text) ? b.text.key : null,
				text: localized(b.text)
			});
		}
		for (const el of b?.elements ?? []) visit(el);
	}

	return out;
}

/** Upgrade levels for `id`, as deltas against level 0. Slugs that appear only
 *  on upgraded variants (the `upg_*` bonus factors) are folded into `seen` so
 *  they still count towards the stat dictionary. */
function loadVariants(baseFile: string, id: string, base: Extracted, seen: Set<string>): Variant[] {
	const dir = join(dirname(baseFile), '_variants', id);
	if (!existsSync(dir)) return [];

	const out: Variant[] = [];
	for (const f of readdirSync(dir)) {
		if (!f.endsWith('.json')) continue;
		const level = Number(f.slice(0, -5));
		if (!Number.isFinite(level)) continue;

		const v = extract(read(join(dir, f)));
		for (const s of v.slugs) seen.add(s);
		const stats: Record<string, number> = {};
		for (const [k, val] of Object.entries(v.stats)) if (base.stats[k] !== val) stats[k] = val;
		const ranges: Record<string, StatRange> = {};
		for (const [k, r] of Object.entries(v.ranges)) {
			const b = base.ranges[k];
			if (!b || b.min !== r.min || b.max !== r.max) ranges[k] = r;
		}
		const damage =
			v.damage && JSON.stringify(v.damage) !== JSON.stringify(base.damage) ? v.damage : null;

		out.push({ level, stats, ranges, damage });
	}
	return out.sort((a, b) => a.level - b.level);
}

// ── pass 1: build every item ────────────────────────────────────────────────
const listing: Array<{ data: string; icon: string }> = read(join(DB, 'listing.json'));
const items: Item[] = [];
const byNameKey = new Map<string, string[]>();
/** item id → the name keys its `item` elements referenced, kept for pass 2 */
const refsById = new Map<string, Set<string>>();

let missingIcons = 0;
let unknownKey: UnknownStatKeyError | null = null;

for (const entry of listing) {
	const file = join(DB, entry.data.replace(/^\//, ''));
	const raw = read(file);

	let ex: Extracted;
	try {
		ex = extract(raw);
	} catch (e) {
		if (e instanceof UnknownStatKeyError) {
			unknownKey ??= e;
			continue;
		}
		throw e;
	}

	const iconRel = entry.icon.replace(/^\//, '');
	const hasIcon = existsSync(join(DB, iconRel));
	if (!hasIcon) missingIcons++;

	const [group, kind = group] = String(raw.category).split('/');
	const nameKey: string = raw.name?.key ?? '';

	const carried = new Set(ex.slugs);
	const variants = loadVariants(file, raw.id, ex, carried);
	for (const s of carried) statMeta.get(s)!.items++;

	items.push({
		id: raw.id,
		category: raw.category,
		group,
		kind,
		nameKey,
		name: localized(raw.name),
		rank: raw.color,
		status: raw.status?.state ?? 'NONE',
		icon: hasIcon ? entry.icon : null,
		stats: ex.stats,
		enums: ex.enums,
		ranges: ex.ranges,
		damage: ex.damage,
		compatible: [],
		unresolvedRefs: [],
		usedInCrafts: ex.usedInCrafts,
		texts: ex.texts,
		values: ex.values,
		variants
	});

	refsById.set(raw.id, new Set(ex.refs));
	if (nameKey) {
		const bucket = byNameKey.get(nameKey);
		if (bucket) bucket.push(raw.id);
		else byNameKey.set(nameKey, [raw.id]);
	}
}

if (unknownKey) {
	console.error(`[build] ${unknownKey.message}`);
	process.exit(1);
}

// ── pass 2: resolve item references ─────────────────────────────────────────
// `item` elements carry only a name key. Now that every item is loaded, map
// name key → id. 13 keys reference craftables absent from this realm; they are
// recorded rather than dropped so a future patch adding them is visible.
let resolved = 0;
let unresolved = 0;
for (const it of items) {
	for (const key of refsById.get(it.id) ?? []) {
		const ids = byNameKey.get(key);
		if (!ids?.length) {
			it.unresolvedRefs.push(key);
			unresolved++;
			continue;
		}
		for (const id of ids) if (id !== it.id) it.compatible.push(id);
		resolved++;
	}
}

// Compatibility is recorded one-way upstream: an attachment lists the weapons it
// fits, weapons list nothing. Mirror the edges so a weapon page can show its
// attachments without scanning all 2 311 items at request time.
const byId = new Map(items.map((i) => [i.id, i]));
// snapshot the one-way edges before mirroring, so mirrored edges are not
// themselves re-mirrored while the loop is still running
const oneWay = items.map((i) => [i.id, [...i.compatible]] as const);
for (const [from, tos] of oneWay) {
	for (const to of tos) byId.get(to)?.compatible.push(from);
}
for (const it of items) it.compatible = [...new Set(it.compatible)].sort();

// ── emit ────────────────────────────────────────────────────────────────────
const source: DbSource = read(join(OUT, 'db-source.json'));
const db: ItemDatabase = {
	realm,
	source,
	builtAt: new Date().toISOString(),
	items: items.sort((a, b) => a.id.localeCompare(b.id)),
	stats: Object.fromEntries([...statMeta].sort(([a], [b]) => a.localeCompare(b))),
	enumLabels: Object.fromEntries([...enumLabels].sort(([a], [b]) => a.localeCompare(b)))
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'items.json'), JSON.stringify(db));

/*
 * Client-side search index, one file per language.
 *
 * A single index carrying all five languages was 530 KB, and every visitor
 * downloaded four they cannot read. Split, each is a fifth of that and only the
 * chosen one is ever fetched. It goes to static/ rather than src/lib/data so it
 * stays a plain file the browser fetches once and caches, instead of a JS chunk
 * rebuilt into the bundle.
 *
 * `s` is the English name, carried on the non-English indexes only. Item names
 * here are largely real weapon designations, so a French or Korean player
 * searching "RPL-20" should still find it — without that field a per-language
 * index would have quietly dropped the cross-language matching the combined one
 * had. It is omitted where it would only repeat `n`.
 *
 * The icon path is NOT stored: every one of them is `/icons/{c}/{id}.png`,
 * checked here rather than assumed, so storing it repeated the two fields
 * either side of it 2 311 times for 83 KB. `ni` marks the handful of items
 * that have no icon at all; the client derives the rest.
 */
const SEARCH_OUT = join(ROOT, 'static', 'search');
mkdirSync(SEARCH_OUT, { recursive: true });

// the assumption the `ic` field was dropped on, verified rather than trusted
const oddIcons = items.filter((i) => i.icon && i.icon !== `/icons/${i.category}/${i.id}.png`);
if (oddIcons.length) {
	throw new Error(
		`${oddIcons.length} icon paths are not /icons/{category}/{id}.png ` +
			`(e.g. ${oddIcons[0].id} -> ${oddIcons[0].icon}). The search index derives them; ` +
			`store the path again, or handle the exception.`
	);
}

for (const lang of LANGS) {
	const index = items.map((i) => {
		const en = i.name.en ?? i.id;
		const n = i.name[lang] ?? en;
		return {
			id: i.id,
			n,
			...(lang !== 'en' && n !== en ? { s: en } : {}),
			c: i.category,
			r: i.rank,
			...(i.icon ? {} : { ni: 1 })
		};
	});
	writeFileSync(join(SEARCH_OUT, `${lang}.json`), JSON.stringify(index));
}

// ── manifest: the committed fingerprint of a build ──────────────────────────
// items.json is too big to commit, so this small file is what git remembers.
// Diffing it against the previous build answers "was that a content patch?" —
// the cue to re-run the local client-asset extraction, which CI cannot do
// (no game install). Also catches a stat silently disappearing upstream.
const manifestPath = join(OUT, 'manifest.json');
const prev = existsSync(manifestPath) ? read(manifestPath) : null;

const categoryCounts: Record<string, number> = {};
for (const i of items) categoryCounts[i.category] = (categoryCounts[i.category] ?? 0) + 1;

const manifest = {
	sha: source.sha,
	committedAt: source.committedAt,
	items: items.length,
	categories: Object.fromEntries(Object.entries(categoryCounts).sort(([a], [b]) => a.localeCompare(b))),
	stats: Object.keys(db.stats).sort(),
	ids: items.map((i) => i.id)
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n');

if (prev) {
	const before = new Set<string>(prev.ids ?? []);
	const after = new Set(manifest.ids);
	const added = manifest.ids.filter((id) => !before.has(id));
	const removed = (prev.ids ?? []).filter((id: string) => !after.has(id));
	const newCats = Object.keys(manifest.categories).filter((c) => !(c in (prev.categories ?? {})));
	const newStats = manifest.stats.filter((s) => !(prev.stats ?? []).includes(s));
	const goneStats = (prev.stats ?? []).filter((s: string) => !manifest.stats.includes(s));

	if (added.length || removed.length || newCats.length || newStats.length || goneStats.length) {
		console.log(`[diff] vs ${String(prev.sha).slice(0, 8)}:`);
		if (added.length) console.log(`[diff]   +${added.length} items  ${added.slice(0, 8).join(' ')}${added.length > 8 ? ' …' : ''}`);
		if (removed.length) console.log(`[diff]   -${removed.length} items  ${removed.slice(0, 8).join(' ')}${removed.length > 8 ? ' …' : ''}`);
		if (newCats.length) console.log(`[diff]   new categories: ${newCats.join(', ')}`);
		if (newStats.length) console.log(`[diff]   new stats: ${newStats.join(', ')}`);
		if (goneStats.length) console.log(`[diff]   stats gone: ${goneStats.join(', ')}`);
		// New categories or a big item jump usually means new content shipped —
		// map tiles, models and mob definitions may need re-extracting locally.
		if (newCats.length || added.length > 25)
			console.log('[diff]   ^ looks like a content patch — consider re-running the local asset extraction');
	} else {
		console.log(`[diff] no item/stat changes vs ${String(prev.sha).slice(0, 8)}`);
	}
}

// ── icons ───────────────────────────────────────────────────────────────────
// Copied out of the vendor tree into static/ so the site serves them from its
// own origin. Apache-2.0, so redistribution is fine (see RESEARCH.md §5).
// Only icons referenced by an item are copied — the vendor tree carries both
// realms and we build one.
const ICONS_OUT = join(ROOT, 'static', 'icons');
if (existsSync(ICONS_OUT)) rmSync(ICONS_OUT, { recursive: true, force: true });
let copied = 0;
for (const it of items) {
	if (!it.icon) continue;
	const from = join(DB, it.icon.replace(/^\//, ''));
	const to = join(ROOT, 'static', it.icon.replace(/^\//, ''));
	mkdirSync(dirname(to), { recursive: true });
	copyFileSync(from, to);
	copied++;
}

const kb = (p: string) => `${(statSync(join(OUT, p)).size / 1024).toFixed(0)} KB`;
const searchKb = LANGS.map(
	(l) => `${l} ${(statSync(join(SEARCH_OUT, `${l}.json`)).size / 1024).toFixed(0)}`
).join(', ');
const withVariants = items.filter((i) => i.variants.length).length;

console.log(`[build] realm ${realm} @ ${source.sha.slice(0, 8)} (${source.committedAt})`);
console.log(`[build] ${items.length} items — ${withVariants} with upgrade levels, ${items.length - withVariants} without`);
console.log(`[build] ${statMeta.size} stats, ${enumLabels.size} enum values`);
console.log(`[build] refs: ${resolved} resolved, ${unresolved} unresolved; ${missingIcons} items without an icon`);
console.log(`[build] items.json ${kb('items.json')}`);
console.log(`[build] search index per language (KB): ${searchKb}`);
console.log(`[build] ${copied} icons copied to static/icons/`);
