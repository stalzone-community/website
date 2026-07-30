/**
 * Category glyph coverage (node:test, `npm test`).
 *
 * The point of this file is the first test: the catalogue's group list comes
 * from upstream, so a vendored-database refresh that adds a category should
 * fail here rather than ship a chip with the fallback ellipsis on it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	allGroupsIcon,
	GROUP_KEYS,
	groupIcon,
	groupTint,
	hasGroupIcon
} from '../src/lib/group-icons.ts';
import database from '../src/lib/data/items.json' with { type: 'json' };
import { readFileSync } from 'node:fs';

const groups = [...new Set((database as { items: { group: string }[] }).items.map((i) => i.group))];

test('every catalogue group has a glyph of its own', () => {
	const missing = groups.filter((g) => !hasGroupIcon(g));
	assert.deepEqual(missing, [], `no icon for: ${missing.join(', ')}`);
});

test('an unknown group still renders something', () => {
	assert.match(groupIcon('anomaly_containers'), /^<svg /);
});

test('glyphs inherit the chip colour and are hidden from assistive tech', () => {
	for (const svg of [allGroupsIcon, ...groups.map(groupIcon)]) {
		assert.match(svg, /stroke="currentColor"/);
		assert.match(svg, /aria-hidden="true"/);
		assert.match(svg, /viewBox="0 0 24 24"/);
		// nothing may paint with a fixed colour, or dark mode gets a hole in it
		assert.doesNotMatch(svg, /#[0-9a-f]{3,6}/i);
	}
});

/*
 * The tint half. Same contract as the glyph above: a group the palette has not
 * coloured renders neutral rather than picking up whatever it sits inside, and
 * a category the database adds should fail here rather than ship grey.
 */

const palette = readFileSync(new URL('../src/lib/styles/palette.css', import.meta.url), 'utf8');

/** How many times the palette declares one token — once per skin block. */
const declarations = (token: string) => palette.split(`--group-${token}:`).length - 1;

test('every catalogue group has a tint of its own, in every skin', () => {
	// three blocks: the dark default, the light media query, and the explicit
	// data-theme='light' the toggle stamps. Miss one and the toggle half-works.
	const SKINS = 3;
	const wrong = groups.map((g) => [g, declarations(g)] as const).filter(([, n]) => n !== SKINS);
	assert.deepEqual(wrong, [], `expected ${SKINS} declarations each, got: ${JSON.stringify(wrong)}`);
});

test('the glyph map and the palette cover the same groups', () => {
	const untinted = GROUP_KEYS.filter((g) => declarations(g) === 0);
	assert.deepEqual(untinted, [], `drawn but not coloured: ${untinted.join(', ')}`);
});

test('groupTint falls back to the catch-all rather than to nothing', () => {
	assert.equal(groupTint('weapon'), 'var(--group-weapon, var(--group-other))');
	// an upstream category nobody has coloured yet still resolves
	assert.equal(
		groupTint('anomaly_containers'),
		'var(--group-anomaly_containers, var(--group-other))'
	);
});
