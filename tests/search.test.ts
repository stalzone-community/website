/**
 * Search ranking and icon derivation (node:test, `npm test`).
 *
 * `rank` is pure and the index is passed in, so none of this needs a network
 * or a DOM — the fetch lives in `loadIndex`, deliberately separate.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iconUrl, rank, type SearchEntry } from '../src/lib/search.ts';

const entry = (id: string, n: string, extra: Partial<SearchEntry> = {}): SearchEntry => ({
	id,
	n,
	c: 'weapon/assault_rifle',
	r: 'DEFAULT',
	...extra
});

const CATALOGUE: SearchEntry[] = [
	entry('a', 'AK-74'),
	entry('b', 'AK-74 Barrel Assembly #3'),
	entry('c', 'Modified AK-74 Handguard'),
	entry('d', 'Scorpion EVO III'),
	entry('e', 'Détecteur de zone'),
	entry('f', '서지 부품', { s: 'Surge Part' })
];

test('a prefix match beats a match in the middle of a name', () => {
	const hits = rank(CATALOGUE, 'ak');
	assert.deepEqual(
		hits.map((h) => h.id),
		['a', 'b', 'c']
	);
});

test('among equal matches the shorter name wins', () => {
	// "AK-74" and "AK-74 Barrel Assembly #3" both match from the start
	const [first, second] = rank(CATALOGUE, 'ak-74');
	assert.equal(first.n, 'AK-74');
	assert.equal(second.n, 'AK-74 Barrel Assembly #3');
});

test('accents are folded, in both directions', () => {
	assert.equal(rank(CATALOGUE, 'detecteur')[0]?.id, 'e');
	assert.equal(rank(CATALOGUE, 'Détecteur')[0]?.id, 'e');
});

test('the English fallback finds a name the visitor cannot type', () => {
	// a Korean index row: the visitor searches the designation, not the label
	const hits = rank(CATALOGUE, 'surge');
	assert.deepEqual(
		hits.map((h) => h.id),
		['f']
	);
});

test('a Korean query matches a Korean name — the NFC fold, end to end', () => {
	assert.equal(rank(CATALOGUE, '서지')[0]?.id, 'f');
});

test('an empty or whitespace query returns nothing rather than everything', () => {
	assert.deepEqual(rank(CATALOGUE, ''), []);
	assert.deepEqual(rank(CATALOGUE, '   '), []);
});

test('the result list is capped', () => {
	const many = Array.from({ length: 50 }, (_, i) => entry(`x${i}`, `Widget ${i}`));
	assert.equal(rank(many, 'widget').length, 10);
	assert.equal(rank(many, 'widget', 3).length, 3);
});

test('a query matching nothing is empty, not an error', () => {
	assert.deepEqual(rank(CATALOGUE, 'zzzz'), []);
});

test('icon URLs are derived from category and id', () => {
	assert.equal(iconUrl(entry('006jk', 'x', { c: 'misc' })), '/icons/misc/006jk.png');
	// the handful of items with no icon at all
	assert.equal(iconUrl(entry('y', 'x', { ni: 1 })), null);
});

test('hits carry their resolved icon', () => {
	const [hit] = rank([entry('006jk', 'Surge', { c: 'misc' })], 'surge');
	assert.equal(hit.icon, '/icons/misc/006jk.png');
});
