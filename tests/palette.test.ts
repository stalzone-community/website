/**
 * What this site puts in the palette. The ranking and the keyboard rules are
 * commons' and are tested there — these cover the mapping onto its row model,
 * and the ordering rule that mapping is responsible for.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankRows } from 'sveltekit-commons/palette';
import { groupLabel, itemRows, sectionRows, type Section } from '../src/lib/palette.ts';
import type { Hit } from '../src/lib/search.ts';

const S = (label: string, over: Partial<Section> = {}): Section => ({
	kind: 'group',
	id: label.toLowerCase(),
	label,
	href: `/items/${label.toLowerCase()}`,
	...over
});

const SECTIONS = [
	S('Weapons', { count: 338 }),
	S('Weapon modules', { count: 3 }),
	S('Artefacts', { count: 103 }),
	S('Armor', { count: 137 }),
	S('Backpacks', { count: 21 })
];

const ranked = (sections: Section[], q: string, limit?: number) =>
	rankRows(sectionRows(sections), q, limit).map((r) => r.label);

test('a prefix beats a match in the middle', () => {
	assert.equal(ranked(SECTIONS, 'arm')[0], 'Armor');
});

test('among equal matches the bigger category wins', () => {
	// both start with "weapon"; Weapons (338) should outrank Weapon modules (3),
	// which is what the negated count in sectionRows buys
	assert.deepEqual(ranked(SECTIONS, 'weapon'), ['Weapons', 'Weapon modules']);
});

test('a category outranks a standing page it ties with', () => {
	const mixed = [
		{ kind: 'page' as const, id: 'search', label: 'Search', href: '/search' },
		S('Searchlights', { count: 4 })
	];
	assert.deepEqual(ranked(mixed, 'search'), ['Searchlights', 'Search']);
});

test('aliases match but rank below the reader own language', () => {
	const fr = [S('Armure', { count: 137, alias: ['Armor'] }), S('Armes', { count: 338 })];
	// "arm" prefixes both French labels, so both come back...
	assert.equal(ranked(fr, 'arm').length, 2);
	// ...and an English-only query still finds the translated section
	assert.deepEqual(ranked(fr, 'armor'), ['Armure']);
});

test('an empty or whitespace query matches nothing', () => {
	assert.deepEqual(ranked(SECTIONS, ''), []);
	assert.deepEqual(ranked(SECTIONS, '   '), []);
});

test('accents fold, so a French label is reachable unaccented', () => {
	assert.equal(ranked([S('Artéfacts', { count: 103 })], 'artefacts').length, 1);
});

test('the result list is capped', () => {
	assert.equal(ranked(SECTIONS, 'a', 2).length, 2);
});

test('a section row carries its size, a page says so instead', () => {
	const [group, page] = sectionRows([
		S('Weapons', { count: 1338 }),
		{ kind: 'page', id: 'craft', label: 'Crafting', href: '/craft' }
	]);
	assert.equal(group.note, '1,338');
	assert.equal(page.note, 'Page');
});

const HIT: Hit = {
	id: 'ak74',
	n: 'AK-74',
	c: 'weapon/assault_rifle',
	r: 'RANK_LEGEND',
	icon: '/icons/weapon/assault_rifle/ak74.png'
};

test('an item row points at its entity page and is tinted by rarity', () => {
	const [row] = itemRows([HIT]);
	assert.equal(row.href, '/entities/ak-74-ak74');
	assert.equal(row.note, 'Assault rifle');
	assert.equal(row.tint, 'var(--rank-legend)');
	assert.equal(row.icon, HIT.icon);
});

test('a search started on a tab lands on the same tab', () => {
	// Comparing two rifles' attachments should not send you through each one's
	// overview. The next entity may not have the tab, and the palette cannot know
	// — its loader redirects to the overview, so the row stays optimistic.
	assert.equal(itemRows([HIT], 'compatible')[0].href, '/entities/ak-74-ak74/compatible');
	// the overview, and every page that is not an entity, carry nothing
	assert.equal(itemRows([HIT], '')[0].href, '/entities/ak-74-ak74');
});

test('group slugs become readable labels', () => {
	assert.equal(groupLabel('weapon_modules'), 'Weapon modules');
	assert.equal(groupLabel('artefact'), 'Artefact');
});
