/**
 * The build calculator's arithmetic (node:test, `npm test`).
 *
 * Everything under `$lib/calc` takes its data as an argument, so these run
 * against hand-built fixtures with no Vite, no fetch and no DOM. The numbers
 * asserted here are the ones BUILDS-CALCULATOR.md §3 describes — if a formula
 * changes, this file is where the change has to be argued.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	bandsAtLevel,
	rarityForQuality,
	resolveArtefact,
	partitionPolyhedron,
	RARITY_INDEX,
	type ArtefactSlot
} from '../src/lib/calc/artefact.ts';
import {
	BLEEDING_PENALTIES,
	BURNING_PENALTIES,
	computeBuild,
	emptyBuild,
	indexGear,
	armorStatsAtLevel,
	type BuildState
} from '../src/lib/calc/build.ts';
import { isBenefit, statOrder, compareStatKeys } from '../src/lib/calc/keys.ts';
import { decodeBuild, encodeBuild, buildHref } from '../src/lib/calc/codec.ts';
import { resolveWeapon, slotsFor, weaponStatsAtLevel } from '../src/lib/calc/weapon.ts';
import type {
	CalcArmor,
	CalcArtefact,
	CalcAttachment,
	CalcBuff,
	CalcContainer,
	CalcWeapon,
	GearIndex
} from '../src/lib/calc/types.ts';

const close = (actual: number, expected: number, msg?: string) =>
	assert.ok(
		Math.abs(actual - expected) < 1e-6,
		msg ?? `expected ${expected}, got ${actual} (difference ${Math.abs(actual - expected)})`
	);

// ── fixtures ────────────────────────────────────────────────────────────────

const artefact = (over: Partial<CalcArtefact> = {}): CalcArtefact => ({
	id: 'art1',
	name: 'Test Artefact',
	icon: null,
	rank: 'DEFAULT',
	kind: 'gravity',
	weight: 0.2,
	ranges: { art_stamina_bonus: { min: 10, max: 20 } },
	stats: {},
	levels: {},
	...over
});

const armor = (over: Partial<CalcArmor> = {}): CalcArmor => ({
	id: 'arm1',
	name: 'Test Suit',
	icon: null,
	rank: 'DEFAULT',
	kind: 'combat',
	weight: 5,
	stats: { art_bullet_dmg_factor: 40, art_tear_dmg_factor: 50 },
	levels: { '10': { art_bullet_dmg_factor: 60 } },
	...over
});

const container = (over: Partial<CalcContainer> = {}): CalcContainer => ({
	id: 'con1',
	name: 'Test Container',
	icon: null,
	rank: 'DEFAULT',
	kind: 'containers',
	weight: 3,
	group: 'containers',
	size: 4,
	effectiveness: 100,
	protection: 0,
	stats: {},
	...over
});

const buff = (over: Partial<CalcBuff> = {}): CalcBuff => ({
	id: 'buf1',
	name: 'Test Snack',
	icon: null,
	rank: 'DEFAULT',
	kind: 'food',
	weight: 0.1,
	group: 'food',
	duration: 1800,
	cooldown: 5,
	stats: { art_stamina_bonus: 5 },
	...over
});

const gearIndex = (over: Partial<GearIndex> = {}): GearIndex => ({
	lang: 'en',
	stats: {},
	armor: [armor()],
	containers: [container()],
	artefacts: [artefact()],
	buffs: [buff()],
	...over
});

const slot = (over: Partial<ArtefactSlot> = {}): ArtefactSlot => ({
	id: 'art1',
	quality: 100,
	rarity: 'ordinary',
	level: 0,
	...over
});

// ── sign convention ─────────────────────────────────────────────────────────

test('a bonus helps when positive, an accumulation when negative', () => {
	assert.equal(isBenefit('art_stamina_bonus', 5), true);
	assert.equal(isBenefit('art_stamina_bonus', -5), false);
	assert.equal(isBenefit('art_radiation_accumulation', -2), true);
	assert.equal(isBenefit('art_radiation_accumulation', 2), false);
	// zero accumulation is fine; zero bonus is nothing
	assert.equal(isBenefit('art_radiation_accumulation', 0), true);
	assert.equal(isBenefit('art_stamina_bonus', 0), false);
});

test('known stats sort before unknown ones', () => {
	assert.ok(statOrder('art_health_bonus') < statOrder('made_up_stat'));
	assert.ok(compareStatKeys('art_bullet_dmg_factor', 'art_frost_accumulation') < 0);
});

// ── artefact resolution ─────────────────────────────────────────────────────

test('quality is the share of the band a bonus grants', () => {
	const [row] = resolveArtefact(artefact(), slot({ quality: 100 }));
	close(row.value, 20, 'full quality gives the top of the band');

	const [half] = resolveArtefact(artefact(), slot({ quality: 50 }));
	close(half.value, 10);
});

test('a container scales bonuses but never accumulation', () => {
	const a = artefact({
		ranges: {
			art_stamina_bonus: { min: 10, max: 20 },
			art_radiation_accumulation: { min: 2, max: 4 }
		}
	});
	const rows = resolveArtefact(a, slot({ quality: 100 }), 150);
	const stamina = rows.find((r) => r.slug === 'art_stamina_bonus')!;
	const radiation = rows.find((r) => r.slug === 'art_radiation_accumulation')!;

	close(stamina.value, 30, 'a 150% container gives half again as much stamina');
	close(radiation.value, 4, 'radiation is unchanged by the container');
	close(stamina.rawValue, 20, 'the unscaled value is kept for display');
});

test('an artefact that reduces a hazard counts as a bonus', () => {
	const a = artefact({ ranges: { art_biological_accumulation: { min: -3.5, max: -4.1 } } });
	const [row] = resolveArtefact(a, slot({ quality: 100 }));
	// both endpoints are negative, so the biggest magnitude is the good end
	close(row.value, -4.1);
	assert.equal(row.benefit, true);
});

test('a drawback interpolates across the band below quality 100', () => {
	const a = artefact({ ranges: { art_radiation_accumulation: { min: 1, max: 5 } } });
	close(resolveArtefact(a, slot({ quality: 0 }))[0].value, 1);
	close(resolveArtefact(a, slot({ quality: 50 }))[0].value, 3);
	close(resolveArtefact(a, slot({ quality: 100 }))[0].value, 5);
});

test('above quality 100 each rarity band restarts at 85% of the maximum', () => {
	const a = artefact({ ranges: { art_radiation_accumulation: { min: 1, max: 5 } } });

	// bottom of the rare band (index 2 → 130)
	close(resolveArtefact(a, slot({ quality: 130, rarity: 'rare' }))[0].value, 4.25);
	// half way up it
	close(resolveArtefact(a, slot({ quality: 137.5, rarity: 'rare' }))[0].value, 4.625);
	// top of it
	close(resolveArtefact(a, slot({ quality: 145, rarity: 'rare' }))[0].value, 5);
});

test('an unordinary artefact at exactly 100 sits at the foot of its own band', () => {
	const a = artefact({ ranges: { art_radiation_accumulation: { min: 1, max: 5 } } });
	close(resolveArtefact(a, slot({ quality: 100, rarity: 'unordinary' }))[0].value, 4.5);
	// ordinary at the same quality reaches the top of the ordinary band instead
	close(resolveArtefact(a, slot({ quality: 100, rarity: 'ordinary' }))[0].value, 5);
});

test('a lower-is-better band walks towards its faster end', () => {
	// upstream marks these by storing max below min
	const a = artefact({ ranges: { lifesaver_recharge: { min: 17, max: 11.825 } } });
	close(resolveArtefact(a, slot({ quality: 0 }))[0].value, 17);
	close(resolveArtefact(a, slot({ quality: 100 }))[0].value, 11.825);
	// and does not keep improving past 100
	close(resolveArtefact(a, slot({ quality: 190, rarity: 'unique' }))[0].value, 11.825);
});

test('upgrade levels come from the shipped bands, not a formula', () => {
	const a = artefact({
		ranges: { art_stamina_bonus: { min: 10, max: 20 } },
		levels: { '5': { art_stamina_bonus: { min: 11, max: 22 } } }
	});
	close(bandsAtLevel(a, 0).art_stamina_bonus.max, 20);
	close(bandsAtLevel(a, 5).art_stamina_bonus.max, 22);
	// a level with no shipped band falls back to level 0 rather than inventing one
	close(bandsAtLevel(a, 7).art_stamina_bonus.max, 20);
	close(resolveArtefact(a, slot({ level: 5, quality: 100 }))[0].value, 22);
});

test('rarity is derivable from quality, and the bands do not overlap', () => {
	assert.equal(rarityForQuality(50), 'ordinary');
	assert.equal(rarityForQuality(100), 'ordinary');
	assert.equal(rarityForQuality(114), 'unordinary');
	assert.equal(rarityForQuality(115), 'unordinary');
	assert.equal(rarityForQuality(116), 'special');
	assert.equal(rarityForQuality(190), 'unique');
	assert.equal(RARITY_INDEX.ordinary, null);
	assert.equal(RARITY_INDEX.unique, 5);
});

test('lifesaver stats are separated from the summable ones', () => {
	const a = artefact({
		ranges: {
			art_stamina_bonus: { min: 10, max: 20 },
			lifesaver_cost: { min: 5, max: 2.7 }
		}
	});
	const { stats, polyhedron } = partitionPolyhedron(resolveArtefact(a, slot()));
	assert.deepEqual(
		stats.map((s) => s.slug),
		['art_stamina_bonus']
	);
	assert.deepEqual(
		polyhedron.map((s) => s.slug),
		['lifesaver_cost']
	);
});

// ── the pipeline ────────────────────────────────────────────────────────────

const build = (over: Partial<BuildState> = {}): BuildState => ({ ...emptyBuild(), ...over });

test('an empty build is 100 effective health and nothing else', () => {
	const r = computeBuild(build(), indexGear(gearIndex()));
	assert.deepEqual(r.stats, []);
	close(r.effectiveHealth, 100);
	close(r.weight, 0);
});

test('armour, container, artefact and buff all reach the totals', () => {
	const r = computeBuild(
		build({
			armor: { id: 'arm1', level: 0 },
			container: 'con1',
			artefacts: [slot()],
			buffs: ['buf1']
		}),
		indexGear(gearIndex())
	);

	const stamina = r.stats.find((s) => s.slug === 'art_stamina_bonus')!;
	close(stamina.value, 25, 'artefact 20 + buff 5');
	assert.deepEqual(stamina.sources, { artefact: 20, buff: 5 });

	close(r.weight, 8.2, 'armour 5 + container 3 + artefact 0.2');
	assert.deepEqual(r.slots, { used: 1, total: 4 });
});

test('armour upgrade levels replace the base value', () => {
	const a = armor();
	close(armorStatsAtLevel(a, 0).art_bullet_dmg_factor, 40);
	close(armorStatsAtLevel(a, 10).art_bullet_dmg_factor, 60);
	// levels store only what differs, so untouched stats survive
	close(armorStatsAtLevel(a, 10).art_tear_dmg_factor, 50);
});

test('a container shields artefact accumulation but not the suit"s', () => {
	const index = gearIndex({
		artefacts: [artefact({ ranges: { art_radiation_accumulation: { min: 4, max: 4 } } })],
		armor: [armor({ stats: { art_radiation_accumulation: 4 } })],
		containers: [container({ protection: 50 })]
	});

	const r = computeBuild(
		build({ container: 'con1', artefacts: [slot()], armor: { id: 'arm1', level: 0 } }),
		indexGear(index)
	);
	const rad = r.stats.find((s) => s.slug === 'art_radiation_accumulation')!;
	close(rad.value, 6, 'artefact 4 halved to 2, plus the suit"s unshielded 4');
	close(rad.sources.artefact!, 2);
	close(rad.sources.armor!, 4);
});

test('frost is not something a container protects against', () => {
	const index = gearIndex({
		artefacts: [artefact({ ranges: { art_frost_accumulation: { min: 4, max: 4 } } })],
		containers: [container({ protection: 50 })]
	});
	const r = computeBuild(build({ container: 'con1', artefacts: [slot()] }), indexGear(index));
	close(r.stats.find((s) => s.slug === 'art_frost_accumulation')!.value, 4);
});

test('stability combines multiplicatively with the tear factor', () => {
	const index = gearIndex({
		armor: [armor({ stats: { art_tear_dmg_factor: 100, art_stopping_protection: 50 } })]
	});
	const r = computeBuild(build({ armor: { id: 'arm1', level: 0 } }), indexGear(index));
	// 100 tear points halve incoming damage, then stability halves what is left
	close(r.stats.find((s) => s.slug === 'art_stopping_protection')!.value, 75);
});

test('a tear factor alone still produces stability', () => {
	const index = gearIndex({ armor: [armor({ stats: { art_tear_dmg_factor: 100 } })] });
	const r = computeBuild(build({ armor: { id: 'arm1', level: 0 } }), indexGear(index));
	close(r.stats.find((s) => s.slug === 'art_stopping_protection')!.value, 50);
});

test('effective health multiplies vitality by bullet resistance', () => {
	const index = gearIndex({
		armor: [armor({ stats: { art_bullet_dmg_factor: 50 } })],
		artefacts: [artefact({ ranges: { art_health_bonus: { min: 20, max: 20 } } })]
	});
	const r = computeBuild(
		build({ armor: { id: 'arm1', level: 0 }, artefacts: [slot()] }),
		indexGear(index)
	);
	close(r.effectiveHealth, 180, '(20 + 100)/100 × (100 + 50)');
});

test('an active reaction feeds both vitality and stamina regeneration', () => {
	const index = gearIndex({
		artefacts: [artefact({ ranges: { art_reaction_to_burn: { min: 10, max: 10 } } })]
	});
	const withoutIt = computeBuild(build({ artefacts: [slot()] }), indexGear(index));
	assert.deepEqual(withoutIt.availableReactions, ['art_reaction_to_burn']);
	assert.equal(
		withoutIt.stats.find((s) => s.slug === 'art_health_bonus'),
		undefined,
		'a reaction does nothing until it is switched on'
	);

	const withIt = computeBuild(
		build({ artefacts: [slot()], reactions: ['art_reaction_to_burn'] }),
		indexGear(index)
	);
	close(withIt.stats.find((s) => s.slug === 'art_health_bonus')!.value, 10);
	close(withIt.stats.find((s) => s.slug === 'art_stamina_regeneration_bonus')!.value, 10);
});

test('a reaction that is not in the build cannot be switched on', () => {
	const r = computeBuild(
		build({ artefacts: [slot()], reactions: ['art_reaction_to_burn'] }),
		indexGear(gearIndex())
	);
	assert.equal(
		r.stats.find((s) => s.slug === 'art_health_bonus'),
		undefined
	);
});

test('bleeding and burning subtract from healing', () => {
	const index = gearIndex({
		artefacts: [
			artefact({
				ranges: {
					art_regeneration_bonus: { min: 50, max: 50 },
					art_heal_efficiency: { min: 100, max: 100 }
				}
			})
		]
	});

	const clean = computeBuild(build({ artefacts: [slot()] }), indexGear(index));
	close(clean.stats.find((s) => s.slug === 'art_regeneration_bonus')!.value, 50);

	const hurt = computeBuild(
		build({ artefacts: [slot()], bleeding: 2, burning: true }),
		indexGear(index)
	);
	const [bleedRegen, bleedEfficiency] = BLEEDING_PENALTIES[2];
	close(
		hurt.stats.find((s) => s.slug === 'art_regeneration_bonus')!.value,
		50 - bleedRegen - BURNING_PENALTIES.regeneration
	);
	close(
		hurt.stats.find((s) => s.slug === 'art_heal_efficiency')!.value,
		100 - bleedEfficiency - BURNING_PENALTIES.efficiency
	);
});

test('bleeding with no regeneration bonus is negative regeneration', () => {
	const r = computeBuild(build({ bleeding: 4 }), indexGear(gearIndex()));
	const regen = r.stats.find((s) => s.slug === 'art_regeneration_bonus')!;
	close(regen.value, -BLEEDING_PENALTIES[4][0]);
	assert.equal(regen.benefit, false);
});

test('healing per second folds efficiency into artefact healing', () => {
	const index = gearIndex({
		artefacts: [
			artefact({
				ranges: {
					art_regeneration_bonus: { min: 7.5, max: 7.5 },
					art_artefakt_heal: { min: 10, max: 10 },
					art_heal_efficiency: { min: 50, max: 50 }
				}
			})
		]
	});
	const r = computeBuild(build({ artefacts: [slot()] }), indexGear(index));
	close(r.healingPerSecond, (7.5 + 2.5) / 5 + 10 * 1.5);
});

test('an accumulation past its limit raises an alert', () => {
	const index = gearIndex({
		artefacts: [artefact({ ranges: { art_radiation_accumulation: { min: 0.6, max: 0.6 } } })]
	});
	assert.deepEqual(
		computeBuild(build({ artefacts: [slot()] }), indexGear(index)).alerts,
		['art_radiation_accumulation']
	);

	const safe = gearIndex({
		artefacts: [artefact({ ranges: { art_radiation_accumulation: { min: 0.4, max: 0.4 } } })]
	});
	assert.deepEqual(computeBuild(build({ artefacts: [slot()] }), indexGear(safe)).alerts, []);
});

test('unknown ids are ignored rather than fatal', () => {
	const r = computeBuild(
		build({
			armor: { id: 'nope', level: 0 },
			container: 'nope',
			artefacts: [slot({ id: 'nope' })],
			buffs: ['nope']
		}),
		indexGear(gearIndex())
	);
	assert.deepEqual(r.stats, []);
	assert.deepEqual(r.slots, { used: 0, total: 0 });
});

// ── weapons ─────────────────────────────────────────────────────────────────

const weapon = (over: Partial<CalcWeapon> = {}): CalcWeapon => ({
	id: 'wpn1',
	name: 'Test Rifle',
	icon: null,
	rank: 'DEFAULT',
	kind: 'assault_rifle',
	weight: 3,
	// no `weight` in `stats`: the index lifts it onto its own field and strips it
	// from there, and reading the wrong one silently gave every weapon zero mass
	stats: { dmg_direct: 100, clip_size: 30, spread: 2, recoil: 4, mag_reload_time: 3 },
	damage: {
		startDamage: 100,
		damageDecreaseStart: 10,
		endDamage: 40,
		damageDecreaseEnd: 50,
		maxDistance: 100
	},
	levels: { '5': { dmg_direct: 110 } },
	damageLevels: {},
	fits: ['att1', 'att2'],
	ammo: '5.45x39',
	...over
});

const attachment = (over: Partial<CalcAttachment> = {}): CalcAttachment => ({
	id: 'att1',
	name: 'Test Muzzle',
	icon: null,
	rank: 'DEFAULT',
	kind: 'barrel',
	weight: 0.2,
	slot: 'barrel',
	stats: { upg_spread: -10 },
	...over
});

const attachMap = (...list: CalcAttachment[]) => new Map(list.map((a) => [a.id, a]));

test('a weapon upgrade level replaces the base stat', () => {
	close(weaponStatsAtLevel(weapon(), 0).dmg_direct, 100);
	close(weaponStatsAtLevel(weapon(), 5).dmg_direct, 110);
	close(weaponStatsAtLevel(weapon(), 5).clip_size, 30);
});

test('an attachment percentage applies to its matching stat', () => {
	const r = resolveWeapon(
		weapon(),
		{ id: 'wpn1', level: 0, attachments: ['att1'] },
		attachMap(attachment())
	);
	const spread = r.stats.find((s) => s.slug === 'spread')!;
	close(spread.base, 2);
	close(spread.value, 1.8, '-10% of 2');
	assert.equal(spread.modifiers.length, 1);
	close(r.weight, 3.2, 'the muzzle adds its own weight');
});

test('percentages on the same stat add up, and each is attributed', () => {
	const r = resolveWeapon(
		weapon(),
		{ id: 'wpn1', level: 0, attachments: ['att1', 'att2'] },
		attachMap(
			attachment(),
			attachment({ id: 'att2', name: 'Test Grip', kind: 'handgrips', slot: 'handgrips', stats: { upg_spread: -15 } })
		)
	);
	const spread = r.stats.find((s) => s.slug === 'spread')!;
	close(spread.value, 2 * 0.75, '-25% in total');
	assert.deepEqual(
		spread.modifiers.map((m) => m.percent),
		[-10, -15]
	);
});

test('a magazine states its clip size rather than modifying it', () => {
	const r = resolveWeapon(
		weapon(),
		{ id: 'wpn1', level: 0, attachments: ['att2'] },
		attachMap(
			attachment({
				id: 'att2',
				name: 'Big Mag',
				kind: 'mag',
				slot: 'mag',
				stats: { mag_clip_size: 45, mag_reload_time: 2.2 }
			})
		)
	);
	const clip = r.stats.find((s) => s.slug === 'clip_size')!;
	close(clip.value, 45);
	assert.equal(clip.overridden, true);
	close(r.stats.find((s) => s.slug === 'mag_reload_time')!.value, 2.2);
});

test('an additive magazine adds to the weapon"s own clip', () => {
	const r = resolveWeapon(
		weapon(),
		{ id: 'wpn1', level: 0, attachments: ['att2'] },
		attachMap(
			attachment({
				id: 'att2',
				name: 'Extension',
				kind: 'mag',
				slot: 'mag',
				stats: { mag_additive_clip_size: 10 }
			})
		)
	);
	close(r.stats.find((s) => s.slug === 'clip_size')!.value, 40);
});

test('a percentage with no matching stat is reported, not applied', () => {
	const r = resolveWeapon(
		weapon(),
		{ id: 'wpn1', level: 0, attachments: ['att1'] },
		attachMap(attachment({ stats: { upg_wiggle: -8 } }))
	);
	assert.deepEqual(r.unmapped, [
		{ slug: 'upg_wiggle', percent: -8, modifiers: [{ id: 'att1', name: 'Test Muzzle', percent: -8 }] }
	]);
});

test('an attachment the weapon does not take is refused, not applied', () => {
	const r = resolveWeapon(
		weapon({ fits: [] }),
		{ id: 'wpn1', level: 0, attachments: ['att1'] },
		attachMap(attachment())
	);
	assert.deepEqual(r.incompatible, ['att1']);
	close(r.stats.find((s) => s.slug === 'spread')!.value, 2);
	close(r.weight, 3);
});

test('slots are derived from what the weapon accepts', () => {
	const slots = slotsFor(
		weapon(),
		attachMap(attachment(), attachment({ id: 'att2', kind: 'mag', slot: 'mag' }))
	);
	assert.deepEqual([...slots.keys()].sort(), ['barrel', 'mag']);
	assert.equal(slots.get('barrel')!.length, 1);
});

// ── the URL codec ───────────────────────────────────────────────────────────

test('a build survives a round trip through the URL', () => {
	const state = build({
		armor: { id: 'arm1', level: 7 },
		container: 'con1',
		artefacts: [
			slot({ id: 'art1', quality: 137.5, rarity: 'rare', level: 5 }),
			slot({ id: 'art2', quality: 90, rarity: 'ordinary', level: 0 })
		],
		buffs: ['buf1', 'buf2'],
		reactions: ['art_reaction_to_burn', 'art_reaction_to_tear'],
		bleeding: 3,
		burning: true
	});
	const wpn = { id: 'wpn1', level: 12, attachments: ['att1', 'att2'] };

	const decoded = decodeBuild(encodeBuild(state, wpn));
	assert.deepEqual(decoded.build.armor, state.armor);
	assert.deepEqual(decoded.build.container, state.container);
	assert.deepEqual(decoded.build.artefacts, state.artefacts);
	assert.deepEqual(decoded.build.buffs, state.buffs);
	assert.deepEqual(decoded.build.reactions.sort(), [...state.reactions].sort());
	assert.equal(decoded.build.bleeding, 3);
	assert.equal(decoded.build.burning, true);
	assert.deepEqual(decoded.weapon, wpn);
});

test('an empty build encodes to an empty query', () => {
	assert.equal(encodeBuild(emptyBuild(), null).toString(), '');
	assert.equal(buildHref(emptyBuild(), null), '/builds/create');
});

test('a hand-edited link loses the bad part and still opens', () => {
	const { build: b, weapon: w } = decodeBuild(
		new URLSearchParams('a=BAD!-3&c=con1&f=art1-999-9-99_--&u=buf1_BAD!&r=zz&d=99b&w=')
	);
	assert.equal(b.armor, null, 'an impossible id is dropped');
	assert.equal(b.container, 'con1', 'the rest of the link still works');
	assert.deepEqual(b.artefacts, [
		{ id: 'art1', quality: 190, rarity: 'ordinary', level: 15 }
	], 'out-of-range numbers clamp instead of throwing');
	assert.deepEqual(b.buffs, ['buf1']);
	assert.deepEqual(b.reactions, []);
	assert.equal(b.bleeding, 4);
	assert.equal(b.burning, true);
	assert.equal(w, null);
});

test('the share link is stable for the same build', () => {
	const state = build({ container: 'con1', artefacts: [slot({ quality: 120, rarity: 'special' })] });
	assert.equal(buildHref(state, null), buildHref(state, null));
	assert.ok(buildHref(state, null).startsWith('/builds/create?'));
});
