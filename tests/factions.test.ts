/**
 * Faction availability (node:test, `npm test`).
 *
 * The classification is the whole point of $lib/factions: "sold at every base"
 * has to read as no marking at all, or the tree is covered in badges that mean
 * nothing and the handful that matter disappear into them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	availabilityOf,
	availableAt,
	FACTIONS,
	FACTION_HOMES,
	isFaction,
	NORTH_BLOCK
} from '../src/lib/factions.ts';

test('sold at every faction home is not a faction choice', () => {
	const a = availabilityOf([...FACTION_HOMES, NORTH_BLOCK]);
	assert.equal(a.scope, 'everywhere');
	assert.deepEqual(a.homes, [], 'badging all four says nothing');
});

test('sold at some homes but not all is the case worth marking', () => {
	// the real Mule Exoarmor row
	const a = availabilityOf(['duty', 'freedom', NORTH_BLOCK]);
	assert.equal(a.scope, 'faction');
	assert.deepEqual(a.homes, ['duty', 'freedom']);
});

test('a single-base item is marked with just that faction', () => {
	// Apostle Super-Heavy Armored Suit, sold only at the Covenant
	const a = availabilityOf(['covenant']);
	assert.equal(a.scope, 'faction');
	assert.deepEqual(a.homes, ['covenant']);
});

test('the northern block is never a badge', () => {
	// it rides along with every faction-tier item, so as a mark it is pure
	// noise — the Frontier/Rise vs Covenant/Mercenaries fork only reads once
	// it is left out
	assert.equal(FACTION_HOMES.includes(NORTH_BLOCK), false);
	assert.equal(isFaction(NORTH_BLOCK), false);
	assert.deepEqual(availabilityOf([NORTH_BLOCK]).homes, []);
	assert.equal(availabilityOf([NORTH_BLOCK]).scope, 'hub');
	// but it is still a place, so it stays in `all` for the filter
	assert.deepEqual(availabilityOf([NORTH_BLOCK]).all, [NORTH_BLOCK]);
});

test('a neutral hub is not a faction tier', () => {
	const a = availabilityOf(['rostok']);
	assert.equal(a.scope, 'hub');
	assert.deepEqual(a.homes, []);
});

test('an item that is never sold reports none', () => {
	assert.equal(availabilityOf([]).scope, 'none');
});

test('badge order is the table order, not the order the data arrived in', () => {
	const forward = availabilityOf(['duty', 'covenant']).homes;
	const reverse = availabilityOf(['covenant', 'duty']).homes;
	assert.deepEqual(forward, reverse, 'badges must not reshuffle between items');
	assert.deepEqual(forward, ['duty', 'covenant']);
});

test('duplicate settlements do not duplicate a badge', () => {
	assert.deepEqual(availabilityOf(['duty', 'duty', 'freedom']).homes, ['duty', 'freedom']);
});

test('every faction has a distinct colour and an emblem', () => {
	const ids = Object.values(FACTIONS).map((f) => f.id);
	assert.equal(new Set(ids).size, ids.length, 'ids collide, so CSS vars would too');
	const colours = Object.values(FACTIONS).map((f) => f.colour);
	assert.equal(new Set(colours).size, colours.length);
	for (const f of Object.values(FACTIONS)) {
		assert.match(f.colour, /^#[0-9a-f]{6}$/);
		assert.match(f.colourLight, /^#[0-9a-f]{6}$/);
		// a mask URL, not inline markup — see the module comment
		assert.match(f.emblem, /^\/factions\/[a-z]+\.png$/, `${f.id} has no emblem`);
	}
});

test('isFaction and availableAt agree with the table', () => {
	assert.equal(isFaction('duty'), true);
	assert.equal(isFaction('rostok'), false);
	assert.equal(availableAt(['duty', 'merc'], 'merc'), true);
	assert.equal(availableAt(['duty', 'merc'], 'covenant'), false);
});
