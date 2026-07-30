import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	capabilitiesOf,
	ENTITY_ROUTE,
	entityHref,
	hasTab,
	idFromSlug,
	isEffect,
	slugify,
	splitStats,
	tabSegment,
	tabsFor
} from '../src/lib/entities.ts';
import type { StatMeta } from '../src/lib/types.ts';

const meta = (slug: string, en: string): StatMeta => ({
	slug,
	key: 'k',
	label: { en },
	unit: null,
	signed: false,
	items: 1
});

test('slug carries a readable name and the id', () => {
	assert.equal(slugify('SA-58 CTC', '7lnj7'), 'sa-58-ctc-7lnj7');
	assert.equal(slugify('Détecteur « Beloukha »', 'z4v9'), 'detecteur-beloukha-z4v9');
});

test('non-Latin names fall back to the bare id, never a leading dash', () => {
	assert.equal(slugify('벨루가 단거리 탐지기', 'z4v9'), 'z4v9');
	assert.equal(slugify('Вспышка', 'qyvk'), 'qyvk');
	assert.equal(slugify(undefined, 'abc'), 'abc');
	assert.equal(slugify('', 'abc'), 'abc');
});

test('slug round-trips to the id', () => {
	for (const [n, id] of [
		['SA-58 CTC', '7lnj7'],
		['벨루가', 'z4v9'],
		['A', 'b']
	] as const) {
		assert.equal(idFromSlug(slugify(n, id)), id);
	}
});

test('long names are truncated without a trailing dash', () => {
	const s = slugify('a'.repeat(80) + ' tail', 'xy');
	assert.ok(!s.includes('--'));
	assert.ok(/-xy$/.test(s));
});

test('effect stats are recognised across types, not by group', () => {
	// the SA-58 rifle really does carry art_speed_modifier
	assert.ok(isEffect('art_speed_modifier'));
	assert.ok(!isEffect('clip_size'));
});

test('capabilities derive from data, not type', () => {
	const weapon = capabilitiesOf({
		stats: { clip_size: 20, art_speed_modifier: -2 },
		damage: { startDamage: 1 },
		variants: [{}],
		fittings: ['a']
	});
	// Asserted flag by flag rather than deepEqual on the whole object: the
	// capability set grows as entity kinds land (mobs, locations, tech trees),
	// and a whole-shape assertion fails on every addition even though nothing
	// it actually tests has changed.
	assert.equal(weapon.stats, true);
	// true because of art_speed_modifier — on a weapon, not an artefact. This is
	// the whole argument against a type hierarchy, so it is the load-bearing
	// assertion in this file.
	assert.equal(weapon.effects, true);
	assert.equal(weapon.upgrades, true);
	assert.equal(weapon.damage, true);
	assert.equal(weapon.attachments, true);
	assert.equal(weapon.cosmetics, false);
	assert.equal(weapon.crafting, false);
	assert.equal(weapon.trading, false);
	assert.equal(weapon.text, false);
	assert.equal(weapon.model, false);
});

test('an artefact with only effect bands reports no plain stats', () => {
	const c = capabilitiesOf({ stats: {}, ranges: { art_stamina_bonus: { min: 1, max: 2 } } });
	assert.equal(c.effects, true);
	assert.equal(c.stats, false);
});

test('splitStats separates bands from plain numbers and drops unknown slugs', () => {
	const m = {
		weight: meta('weight', 'Weight'),
		art_stamina_bonus: meta('art_stamina_bonus', 'Stamina')
	};
	const { effects, plain } = splitStats(
		{ weight: 1, art_stamina_bonus: 2, mystery_stat: 3 },
		m
	);
	assert.deepEqual(plain, ['weight']);
	assert.deepEqual(effects, ['art_stamina_bonus']);
});

test('plain stats come back grouped, not alphabetised', () => {
	// the regression this ordering exists for: alphabetically these are
	// Magazine capacity, Reload, Spread, Tactical reload, Weight — three feed
	// stats split apart by two that have nothing to do with them
	const m = {
		mag_clip_size: meta('mag_clip_size', 'Magazine capacity'),
		mag_reload_time: meta('mag_reload_time', 'Reload'),
		mag_reload_time_tactical: meta('mag_reload_time_tactical', 'Tactical reload'),
		spread: meta('spread', 'Spread'),
		weight: meta('weight', 'Weight')
	};
	const { plain } = splitStats(
		{ mag_clip_size: 30, mag_reload_time: 2, mag_reload_time_tactical: 1.5, spread: 1, weight: 3 },
		m
	);
	assert.deepEqual(plain, [
		'spread',
		'mag_clip_size',
		'mag_reload_time',
		'mag_reload_time_tactical',
		'weight'
	]);
});

test('within a group the order is still the label', () => {
	const m = {
		durability: meta('durability', 'Durability'),
		max_durability: meta('max_durability', 'Max. durability'),
		uses: meta('custom_usages_left', 'Uses remaining')
	};
	const { plain } = splitStats({ max_durability: 1, custom_usages_left: 2, durability: 3 }, m);
	// all three are `wear`, so alphabetical decides — and `uses` is dropped
	// because its slug is not in `m`
	assert.deepEqual(plain, ['durability', 'max_durability']);
});

test('tabs follow capabilities, and the overview is always one of them', () => {
	const bare = capabilitiesOf({ stats: {}, status: 'PERSONAL_ON_GET' });
	assert.deepEqual(
		tabsFor(bare).map((t) => t.segment),
		['']
	);

	const rifle = capabilitiesOf({
		stats: { damage_value: 40 },
		damage: { head: 1 },
		fittings: ['a'],
		hasCrafting: true,
		hasTrading: true,
		inTechTree: true,
		status: 'NON_DROP'
	});
	assert.deepEqual(
		tabsFor(rifle).map((t) => t.segment),
		['', 'auction', 'craft', 'tech-tree', 'compatible']
	);
});

test('the tree slot goes to whichever tree the item is actually on', () => {
	// Across the real catalogue no item is both on a barter progression and made
	// at a bench, which is what lets these share a position in the bar. If that
	// ever stops being true upstream, two tree tabs appear side by side — ugly
	// but not broken, and this is the note that explains what happened.
	const traded = capabilitiesOf({ stats: { weight: 1 }, inTechTree: true, status: 'NON_DROP' });
	assert.deepEqual(
		tabsFor(traded).map((t) => t.segment),
		['', 'auction', 'tech-tree']
	);

	const benched = capabilitiesOf({
		stats: { weight: 1 },
		isCraftable: true,
		hasCrafting: true,
		status: 'NON_DROP'
	});
	assert.deepEqual(
		tabsFor(benched).map((t) => t.segment),
		['', 'auction', 'craft', 'craft-tree']
	);

	// craftable is what puts the graph tab up, not merely being in a recipe: an
	// ingredient nothing makes has no chain to draw
	const ingredient = capabilitiesOf({
		stats: { weight: 1 },
		hasCrafting: true,
		status: 'NON_DROP'
	});
	assert.deepEqual(
		tabsFor(ingredient).map((t) => t.segment),
		['', 'auction', 'craft']
	);
});

test('a tab is only reachable when its own loader would find something', () => {
	// The sublayout renders the links and each tab's loader 404s on the same
	// capability, so the two have to agree or the prerenderer crawls into an
	// error. This is that agreement, spelled out.
	const c = capabilitiesOf({ stats: { weight: 1 }, hasCrafting: true, status: 'PERSONAL_ON_GET' });
	assert.deepEqual(
		tabsFor(c).map((t) => t.segment),
		['', 'craft']
	);
});

test('either half of the craft tab is enough to put it on the page', () => {
	// The two stay separate capabilities because they are separate facts — the
	// search chips filter on each — but one tab answers both, so an item that
	// only a trader deals in still gets it. `needs` is an OR, and this is the
	// one place that actually depends on it.
	const traded = capabilitiesOf({ stats: { weight: 1 }, hasTrading: true, status: 'NON_DROP' });
	assert.deepEqual(
		tabsFor(traded).map((t) => t.segment),
		['', 'auction', 'craft']
	);

	const crafted = capabilitiesOf({ stats: { weight: 1 }, hasCrafting: true, status: 'NON_DROP' });
	assert.deepEqual(
		tabsFor(crafted).map((t) => t.segment),
		['', 'auction', 'craft']
	);

	// and neither means no tab, which is what each loader 404s on
	const plain = capabilitiesOf({ stats: { weight: 1 }, status: 'NON_DROP' });
	assert.deepEqual(
		tabsFor(plain).map((t) => t.segment),
		['', 'auction']
	);
});

test('hasTab answers for the same set the bar offers', () => {
	// The bar renders the links and the sublayout's loader redirects off anything
	// it did not offer, so the two have to read the same table — a tab you can
	// click that redirects away, or a URL with no tab to click, is a drift bug.
	const rifle = capabilitiesOf({
		stats: { damage_value: 40 },
		fittings: ['a'],
		status: 'NON_DROP'
	});
	const offered = new Set(tabsFor(rifle).map((t) => t.segment));
	for (const segment of ['', 'auction', 'craft', 'tech-tree', 'compatible', 'cosmetics', 'model']) {
		assert.equal(hasTab(rifle, segment), offered.has(segment), segment);
	}
});

test('the overview is always a tab, and an unknown segment never is', () => {
	// A search from a tab carries its segment onto the next entity, so this is
	// what decides whether that lands or bounces to the overview.
	const bare = capabilitiesOf({ stats: {}, status: 'PERSONAL_ON_GET' });
	assert.equal(hasTab(bare, ''), true);
	assert.equal(hasTab(bare, 'compatible'), false);
	assert.equal(hasTab(bare, 'not-a-tab'), false);
});

test('the tab of a route id, and the route it came from', () => {
	assert.equal(tabSegment('/entities/[slug]'), '');
	assert.equal(tabSegment('/entities/[slug]/craft-tree'), 'craft-tree');
	// not an entity page: nothing to carry
	assert.equal(tabSegment('/items/weapon'), null);
	assert.equal(tabSegment(null), null);
	// the prefix has to end where the segment starts, or `/entities/[slug]x`
	// would report a tab called "x"
	assert.equal(tabSegment('/entities/[slug]x'), null);
});

test('a tab URL round-trips through the segment', () => {
	assert.equal(entityHref('ak-74-ak74'), '/entities/ak-74-ak74');
	assert.equal(entityHref('ak-74-ak74', 'compatible'), '/entities/ak-74-ak74/compatible');
	assert.equal(tabSegment(ENTITY_ROUTE + '/compatible'), 'compatible');
});
