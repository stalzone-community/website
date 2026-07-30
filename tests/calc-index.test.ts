/**
 * Invariants of the generated calculator index (node:test, `npm test`).
 *
 * Unlike calc.test.ts these run against the real payload, so they catch the
 * class of bug a fixture cannot: upstream changing shape under us, or the
 * projection in scripts/build-calc-index.ts dropping something the maths needs.
 *
 * The index is generated (`npm run db`) and not committed, so a clean checkout
 * skips this file rather than failing it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bandsAtLevel } from '../src/lib/calc/artefact.ts';
import type { GearIndex, WeaponIndex } from '../src/lib/calc/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GEAR = join(ROOT, 'static/calc/gear.en.json');
const WEAPON = join(ROOT, 'static/calc/weapon.en.json');

const built = existsSync(GEAR) && existsSync(WEAPON);
const skip = built ? false : 'run `npm run db` to generate static/calc';

const gear: GearIndex = built ? JSON.parse(readFileSync(GEAR, 'utf8')) : ({} as GearIndex);
const weapons: WeaponIndex = built ? JSON.parse(readFileSync(WEAPON, 'utf8')) : ({} as WeaponIndex);

test('the index carries every gear category the calculator offers', { skip }, () => {
	assert.ok(gear.armor.length > 100, `${gear.armor.length} armour`);
	assert.ok(gear.containers.length > 40, `${gear.containers.length} containers`);
	assert.ok(gear.artefacts.length > 90, `${gear.artefacts.length} artefacts`);
	assert.ok(gear.buffs.length > 100, `${gear.buffs.length} buffs`);
});

test('every stat mentioned has a label to render it with', { skip }, () => {
	const missing = new Set<string>();
	const check = (o: Record<string, unknown>) => {
		for (const k of Object.keys(o)) if (!(k in gear.stats)) missing.add(k);
	};
	for (const a of gear.armor) {
		check(a.stats);
		for (const l of Object.values(a.levels)) check(l);
	}
	for (const a of gear.artefacts) {
		check(a.ranges);
		check(a.stats);
		for (const l of Object.values(a.levels)) check(l);
	}
	for (const c of gear.containers) check(c.stats);
	for (const b of gear.buffs) check(b.stats);
	assert.deepEqual([...missing], []);
});

test('a container always states its three numbers', { skip }, () => {
	for (const c of gear.containers) {
		assert.ok(c.size > 0, `${c.name} has no artefact slots`);
		assert.ok(c.effectiveness > 0, `${c.name} has no effectiveness`);
		assert.ok(c.protection >= 0 && c.protection <= 100, `${c.name} protection ${c.protection}`);
	}
});

/**
 * The regression guard for the armour upgrade bug.
 *
 * Upstream ships an `upgrade_stats` block on every armour variant holding the
 * *bonus* under the same key as the real value. Extracting it overwrote the
 * upgraded number with the delta — level 1 of the Bandit Suit read 1.27 instead
 * of 40.27, and level 15 vanished entirely because the delta happened to equal
 * the level-0 value. Upgrading armour can only ever increase its bullet
 * resistance, so that is what this asserts.
 */
test('armour upgrades increase bullet resistance, monotonically', { skip }, () => {
	let checked = 0;
	for (const a of gear.armor) {
		const levels = Object.keys(a.levels)
			.map(Number)
			.sort((x, y) => x - y);
		if (!levels.length) continue;

		const base = a.stats.art_bullet_dmg_factor ?? 0;
		let previous = base;
		for (const level of levels) {
			const value = a.levels[String(level)].art_bullet_dmg_factor;
			if (value === undefined) continue;
			assert.ok(
				value >= previous,
				`${a.name} level ${level}: ${value} is not at least the previous ${previous}`
			);
			previous = value;
			checked++;
		}
		assert.ok(previous > base, `${a.name} gains nothing from 15 upgrade levels`);
	}
	assert.ok(checked > 1000, `only ${checked} armour levels checked`);
});

test('armour levels touch only the stat upgrades actually move', { skip }, () => {
	const keys = new Set<string>();
	for (const a of gear.armor) for (const l of Object.values(a.levels)) for (const k of Object.keys(l)) keys.add(k);
	assert.deepEqual([...keys], ['art_bullet_dmg_factor']);
});

/**
 * Why `bandsAtLevel` reads shipped data instead of scaling by level.
 *
 * Every artefact but one follows `base × (1 + 2·level/100)`. The Polyhedron's
 * recharge and cost run the other way — upgrading it makes them smaller — so a
 * single derived rule would improve them in the wrong direction. If a future
 * patch adds a second exception, this test names it rather than letting the
 * calculator quietly mis-state it.
 */
test('artefact levels follow the +2%/level rule, or are the known exception', { skip }, () => {
	const exceptions = new Map<string, Set<string>>();

	for (const a of gear.artefacts) {
		for (const [level, bands] of Object.entries(a.levels)) {
			const factor = 1 + (2 * Number(level)) / 100;
			for (const [slug, band] of Object.entries(bands)) {
				const base = a.ranges[slug];
				if (!base) continue;
				for (const end of ['min', 'max'] as const) {
					const expected = base[end] * factor;
					const actual = band[end];
					const tolerance = Math.max(1e-3, Math.abs(expected) * 1e-3);
					if (Math.abs(expected - actual) > tolerance) {
						const set = exceptions.get(a.name) ?? new Set<string>();
						set.add(slug);
						exceptions.set(a.name, set);
					}
				}
			}
		}
	}

	const summary = [...exceptions].map(([name, slugs]) => `${name}: ${[...slugs].sort().join(', ')}`);
	assert.deepEqual(summary, ['Polyhedron: lifesaver_cost, lifesaver_recharge']);
});

test('the Polyhedron"s recharge shortens as it upgrades', { skip }, () => {
	const poly = gear.artefacts.find((a) => a.name === 'Polyhedron');
	assert.ok(poly, 'Polyhedron missing from the index');
	const base = bandsAtLevel(poly, 0).lifesaver_recharge;
	const maxed = bandsAtLevel(poly, 15).lifesaver_recharge;
	assert.ok(maxed.min < base.min, `${maxed.min} should be quicker than ${base.min}`);
	assert.ok(base.max < base.min, 'a lower-is-better band stores max below min');
});

test('every attachment a weapon accepts exists in the same payload', { skip }, () => {
	const ids = new Set(weapons.attachments.map((a) => a.id));
	const dangling = weapons.weapons.flatMap((w) => w.fits.filter((id) => !ids.has(id)));
	assert.deepEqual(dangling, []);
});

test('every attachment lands in a known slot', { skip }, () => {
	const slots = new Set(weapons.attachments.map((a) => a.slot));
	assert.deepEqual(
		[...slots].sort(),
		['accessory', 'barrel', 'collimator_sights', 'forend', 'handgrips', 'mag', 'other', 'pistol_handle']
	);
});

test('most weapons take at least one attachment', { skip }, () => {
	const withSlots = weapons.weapons.filter((w) => w.fits.length > 0).length;
	assert.ok(
		withSlots / weapons.weapons.length > 0.7,
		`only ${withSlots} of ${weapons.weapons.length} weapons accept attachments`
	);
});

test('the five languages agree on everything but the words', { skip }, () => {
	const other = join(ROOT, 'static/calc/gear.ru.json');
	if (!existsSync(other)) return;
	const ru: GearIndex = JSON.parse(readFileSync(other, 'utf8'));
	assert.deepEqual(
		gear.artefacts.map((a) => a.id),
		ru.artefacts.map((a) => a.id)
	);
	assert.deepEqual(gear.artefacts[0].ranges, ru.artefacts[0].ranges);
	assert.notEqual(gear.artefacts[0].name, ru.artefacts[0].name);
});
