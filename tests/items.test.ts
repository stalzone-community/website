import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	commonStats,
	compareItems,
	damageCurve,
	facetsOf,
	flagsParam,
	foldForSearch,
	formatStat,
	ITEM_FLAG_HINT,
	ITEM_FLAG_LABEL,
	ITEM_FLAGS,
	matchesFilter,
	parseFlags,
	toggleFlag,
	maxLevel,
	rangesAtLevel,
	rankSlug,
	statsAtLevel,
} from '../src/lib/items.ts';
import type { Item, StatMeta } from '../src/lib/types.ts';

const item = (over: Partial<Item> = {}): Item => ({
	id: 'aaa',
	category: 'weapon/assault_rifle',
	group: 'weapon',
	kind: 'assault_rifle',
	nameKey: 'item.wpn.test.name',
	name: { en: 'Test Rifle', fr: 'Fusil Détecteur' },
	rank: 'RANK_MASTER',
	status: 'PERSONAL_ON_USE',
	values: {},
	icon: '/icons/weapon/aaa.png',
	stats: { weight: 3.5, clip_size: 20 },
	enums: {},
	ranges: {},
	damage: null,
	compatible: [],
	unresolvedRefs: [],
	usedInCrafts: false,
	texts: [],
	variants: [],
	...over
});

test('search folds accents and case', () => {
	assert.equal(foldForSearch('Détecteur'), 'detecteur');
	assert.ok(matchesFilter(item(), { q: 'detecteur' }, 'fr'));
	assert.ok(matchesFilter(item(), { q: 'DÉTECT' }, 'fr'));
});

test('search matches other languages than the active one', () => {
	// a French visitor typing an English weapon name should still find it
	assert.ok(matchesFilter(item(), { q: 'Test Rifle' }, 'fr'));
});

test('Korean names fold to themselves', () => {
	// Regression guard. Folding via NFD decomposes Hangul syllables into jamo,
	// so the folded name no longer equals the name a Korean visitor types and
	// every ko search returned nothing. Real catalogue entry (item z4v9).
	const ko = '벨루가 단거리 탐지기';
	assert.equal(foldForSearch(ko), ko);
	const i = item({ name: { en: 'Beluga Short Range Detector', ko } });
	assert.ok(matchesFilter(i, { q: ko }, 'ko'));
	assert.ok(matchesFilter(i, { q: '탐지기' }, 'ko'));
});

test('filters compose', () => {
	const i = item();
	assert.ok(matchesFilter(i, { group: 'weapon', rank: 'RANK_MASTER' }, 'en'));
	assert.ok(!matchesFilter(i, { group: 'armor' }, 'en'));
	assert.ok(!matchesFilter(i, { rank: 'RANK_NEWBIE' }, 'en'));
});

test('items missing a stat sort last in both directions', () => {
	const withStat = item({ id: 'a', stats: { weight: 1 } });
	const without = item({ id: 'b', name: { en: 'Zzz' }, stats: {} });
	assert.ok(compareItems(withStat, without, 'weight', 1, 'en') < 0);
	// -1 must not promote "no value" to the top; absent is not zero
	assert.ok(compareItems(withStat, without, 'weight', -1, 'en') < 0);
});

test('rank sort follows game order, not alphabet', () => {
	const master = item({ rank: 'RANK_MASTER' });
	const newbie = item({ rank: 'RANK_NEWBIE' });
	assert.ok(compareItems(newbie, master, 'rank', 1, 'en') < 0);
});

test('variant stats layer over the base rather than replacing it', () => {
	const i = item({
		stats: { weight: 3.5, clip_size: 20, dmg_direct: 46.5 },
		variants: [{ level: 3, stats: { dmg_direct: 52.6 }, ranges: {}, damage: null }]
	});
	const at3 = statsAtLevel(i, 3);
	assert.equal(at3.dmg_direct, 52.6);
	// carried over from level 0 — the variant only stores what differs
	assert.equal(at3.weight, 3.5);
	assert.equal(at3.clip_size, 20);
	assert.equal(statsAtLevel(i, 0).dmg_direct, 46.5);
	assert.equal(maxLevel(i), 3);
});

test('unknown upgrade level falls back to base stats', () => {
	const i = item({ variants: [{ level: 1, stats: { weight: 9 }, ranges: {}, damage: null }] });
	assert.equal(statsAtLevel(i, 7).weight, 3.5);
});

test('facets count and order', () => {
	const f = facetsOf([item(), item({ group: 'armor', category: 'armor/combat', rank: 'RANK_NEWBIE' })]);
	assert.equal(f.groups.length, 2);
	assert.deepEqual(
		f.ranks.map((r) => r.value),
		['RANK_NEWBIE', 'RANK_MASTER']
	);
});

test('commonStats keeps only stats most items carry', () => {
	const meta: Record<string, StatMeta> = {
		weight: { slug: 'weight', key: 'k', label: {}, unit: 'kg', signed: false, items: 2 },
		clip_size: { slug: 'clip_size', key: 'k', label: {}, unit: null, signed: false, items: 1 }
	};
	// weight on 3/3, clip_size on 1/3 — only weight clears the default 0.5
	const items = [item(), item({ stats: { weight: 1 } }), item({ stats: { weight: 2 } })];
	assert.deepEqual(commonStats(items, meta), ['weight']);
	// exactly at the threshold counts as common
	assert.deepEqual(commonStats(items, meta, 1 / 3).sort(), ['clip_size', 'weight']);
});

test('formatStat applies unit and sign', () => {
	const pct: StatMeta = { slug: 'x', key: 'k', label: {}, unit: '%', signed: true, items: 1 };
	const kg: StatMeta = { slug: 'w', key: 'k', label: {}, unit: 'kg', signed: false, items: 1 };
	assert.equal(formatStat(13.09, pct, 'en'), '+13.09%');
	assert.equal(formatStat(3.5, kg, 'en'), '3.5 kg');
	assert.equal(formatStat(20, undefined, 'en'), '20');
});

test('damage curve is flat, then falls, then flat', () => {
	const pts = damageCurve({
		startDamage: 46.5,
		damageDecreaseStart: 24,
		endDamage: 33.6,
		damageDecreaseEnd: 82,
		maxDistance: 180
	});
	assert.deepEqual(pts, [
		{ x: 0, y: 46.5 },
		{ x: 24, y: 46.5 },
		{ x: 82, y: 33.6 },
		{ x: 180, y: 33.6 }
	]);
});

test('rankSlug strips the prefix', () => {
	assert.equal(rankSlug('RANK_MASTER'), 'master');
	assert.equal(rankSlug('DEFAULT'), 'default');
});

test('effect bands widen with upgrade level', () => {
	// 102 of 103 artefacts do this; nothing else in the catalogue does. Real
	// numbers from Cycle (1k4q).
	const art = item({
		group: 'artefact',
		stats: {},
		ranges: { art_stamina_bonus: { min: 13.09, max: 15.4 } },
		variants: [
			{
				level: 15,
				stats: {},
				ranges: { art_stamina_bonus: { min: 17.017, max: 20.02 } },
				damage: null
			}
		]
	});
	assert.deepEqual(rangesAtLevel(art, 0).art_stamina_bonus, { min: 13.09, max: 15.4 });
	assert.deepEqual(rangesAtLevel(art, 15).art_stamina_bonus, { min: 17.017, max: 20.02 });
	// a level with no recorded delta keeps the base band rather than vanishing
	assert.deepEqual(rangesAtLevel(art, 7).art_stamina_bonus, { min: 13.09, max: 15.4 });
});


/* ---------- the checkable filters ---------- */

test('parseFlags takes only names it knows, and normalises the order', () => {
	assert.deepEqual(parseFlags('tech-tree,craftable'), ['craftable', 'tech-tree']);
	// visitor input: an unknown name drops out rather than reaching a predicate
	assert.deepEqual(parseFlags('craftable,__proto__,nonsense'), ['craftable']);
	assert.deepEqual(parseFlags(' craftable , upgradeable '), ['craftable', 'upgradeable']);
	assert.deepEqual(parseFlags(''), []);
	assert.deepEqual(parseFlags(null), []);
});

test('a flag set survives the round trip through the query string', () => {
	const flags = parseFlags('attachments,craftable');
	assert.deepEqual(parseFlags(flagsParam(flags)), flags);
	// duplicates collapse, so two clicks on one chip cannot pile up in the URL
	assert.equal(flagsParam(parseFlags('craftable,craftable')), 'craftable');
	assert.equal(flagsParam([]), '');
});

test('a chip click adds a flag, and a second click takes it away', () => {
	assert.deepEqual(toggleFlag([], 'craftable'), ['craftable']);
	assert.deepEqual(toggleFlag(['craftable'], 'craftable'), []);
	assert.deepEqual(toggleFlag(['craftable'], 'tech-tree'), ['craftable', 'tech-tree']);
});

test('every flag has a label and a hint, so a chip can never render blank', () => {
	for (const f of ITEM_FLAGS) {
		assert.ok(ITEM_FLAG_LABEL[f]?.length, `${f} needs a label`);
		assert.ok(ITEM_FLAG_HINT[f]?.length, `${f} needs a hint`);
	}
});

test('getting an item and using one are separate questions', () => {
	// craftable and buyable are the two ways to end up holding an item; neither
	// is "this is an ingredient" or "a trader wants this as payment", which are
	// the same tables read backwards. Guard against them being merged again.
	assert.ok(ITEM_FLAGS.includes('craftable') && ITEM_FLAGS.includes('buyable'));
	assert.notEqual(ITEM_FLAG_HINT.craftable, ITEM_FLAG_HINT.buyable);
});
