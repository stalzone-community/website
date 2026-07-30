/**
 * The stat keys the build maths treats specially, in our slug namespace.
 *
 * Upstream names these `stalker.artefact_properties.factor.<x>`; the build
 * slugs that prefix to `art_` (scripts/lib/stat-keys.ts), so `art_x` here is the
 * same stat. The lifesaver keys come from `stalker.tooltip.item.lifesaver*` and
 * slug to `lifesaver_*`.
 *
 * The groupings are not cosmetic — each one changes an arithmetic branch. See
 * BUILDS-CALCULATOR.md §3 for where each is applied.
 *
 * Pure and dependency-free so `node --test` can load it directly.
 */

/**
 * Stats where the game accumulates a hazard rather than granting a bonus, so a
 * NEGATIVE total is the good outcome.
 *
 * They are also the stats a container's effectiveness must not touch: a
 * container makes an artefact's bonuses stronger without making its radiation
 * worse.
 */
export const ACCUMULATION_STATS = [
	'art_radiation_accumulation',
	'art_biological_accumulation',
	'art_psycho_accumulation',
	'art_bleeding_accumulation',
	'art_thermal_accumulation',
	'art_frost_accumulation'
] as const;

/**
 * Stats whose sign decides whether they help — the accumulations plus two
 * bonuses that upstream also stores inverted. For everything else, "> 0 is
 * good" holds.
 */
export const INVERTED_STATS: readonly string[] = [
	...ACCUMULATION_STATS,
	'art_combustion_accumulation',
	'art_recoil_bonus',
	'art_wiggle_bonus'
];

/**
 * What a container shields you from. Frost is deliberately absent: containers
 * do not stop it, and treating them as if they did would overstate every
 * cold-zone build.
 */
export const CONTAINER_PROTECTED_STATS: readonly string[] = [
	'art_radiation_accumulation',
	'art_biological_accumulation',
	'art_psycho_accumulation',
	'art_bleeding_accumulation',
	'art_thermal_accumulation'
];

/**
 * Accumulations that damage you past a threshold, and where that threshold is.
 * Bleeding is absent — it is an accumulation, but not one with a hard cap.
 */
export const DANGER_LIMITS: Readonly<Record<string, number>> = {
	art_radiation_accumulation: 0.5,
	art_biological_accumulation: 0.5,
	art_psycho_accumulation: 0.5,
	art_thermal_accumulation: 0.5,
	art_frost_accumulation: 1
};

/**
 * Anomaly reactions. These do not apply on their own — the player picks which
 * are active, and the sum of the active ones is added to vitality and stamina
 * regeneration.
 */
export const REACTION_STATS: readonly string[] = [
	'art_reaction_to_tear',
	'art_reaction_to_electroshock',
	'art_reaction_to_chemical_burn',
	'art_reaction_to_burn'
];

/**
 * The Polyhedron's lifesaver stats. They resolve on their own curve and are
 * shown apart rather than summed with everything else — adding a recharge time
 * to another artefact's recharge time would be meaningless.
 */
export const POLYHEDRON_STATS: readonly string[] = [
	'lifesaver_recharge',
	'lifesaver_cost',
	'lifesaver_sniper_blocking_damage',
	'lifesaver_sniper_trigger_damage'
];

/** Where a contribution came from, for the per-stat breakdown. */
export type StatOrigin =
	| 'artefact'
	| 'armor'
	| 'container'
	| 'buff'
	| 'reaction'
	| 'debuff'
	| 'unknown';

/** Display order, mirroring how the game groups these in a tooltip. */
export const STAT_ORDER: readonly string[] = [
	'art_bleeding_accumulation',
	'art_combustion_accumulation',
	'art_artefakt_heal',
	'art_bullet_dmg_factor',
	'art_health_bonus',
	'art_heal_efficiency',
	'art_regeneration_bonus',
	'art_speed_modifier',
	'art_sprint_speed_modifier',
	'art_stamina_bonus',
	'art_stamina_regeneration_bonus',
	'art_max_weight_bonus',
	'art_tear_dmg_factor',
	'art_stopping_protection',
	'art_explosion_dmg_factor',
	'art_burn_dmg_factor',
	'art_electra_dmg_factor',
	'art_chemical_burn_dmg_factor',
	'art_radiation_protection',
	'art_thermal_protection',
	'art_biological_protection',
	'art_psycho_protection',
	'art_frost_protection',
	'art_bleeding_protection',
	'art_reaction_to_electroshock',
	'art_reaction_to_burn',
	'art_reaction_to_chemical_burn',
	'art_reaction_to_tear',
	'art_biological_accumulation',
	'art_psycho_accumulation',
	'art_thermal_accumulation',
	'art_radiation_accumulation',
	'art_frost_accumulation'
];

const ORDER = new Map(STAT_ORDER.map((k, i) => [k, i]));

/** Stats outside the known order sort after it, alphabetically. */
export function statOrder(slug: string): number {
	return ORDER.get(slug) ?? STAT_ORDER.length;
}

export function compareStatKeys(a: string, b: string): number {
	return statOrder(a) - statOrder(b) || a.localeCompare(b);
}

/**
 * Does this value help the player?
 *
 * The one place the sign convention lives. Everything downstream — colouring a
 * row green, deciding which formula branch an artefact band takes, summing —
 * asks here rather than testing `> 0` itself.
 */
export function isBenefit(slug: string, value: number): boolean {
	return INVERTED_STATS.includes(slug) ? value <= 0 : value > 0;
}

/**
 * The `upg_*` modifiers an attachment applies, where a smaller number is the
 * better one.
 *
 * `isBenefit` above cannot answer for these. Its `INVERTED_STATS` is the
 * artefact vocabulary — accumulations and a few `art_*` bonuses — and a weapon
 * modifier falls through to its `value > 0` default, which is backwards for
 * exactly the stats people buy attachments for. Read off the catalogue:
 *
 *   upg_spread             all 72 muzzle devices carry it negative
 *   upg_horizontal_recoil  61 of 62 negative
 *   upg_recoil             35 negative, 8 positive (the ones that add recoil)
 *
 * against `upg_shoot_factor_decrement` (stabilization, 54 of 54 positive) and
 * the speed family, where up is up. So a silencer's headline number is −19%
 * spread, and painting that red because it is negative would invert the only
 * thing the column is for.
 *
 * A separate export rather than a change to `INVERTED_STATS`, because that list
 * feeds the builds calculator's formulas and this is a display rule.
 */
export const LOWER_IS_BETTER: readonly string[] = [
	'upg_spread',
	'upg_hip_spread',
	'upg_recoil',
	'upg_horizontal_recoil',
	'upg_recoil_gain',
	'upg_wiggle'
	/* Aim speed and draw speed are deliberately NOT here. The upstream key is
	   `aim_switch_time`, which reads like a duration, and on that reading a
	   scope's "-20%" would be a fifth off the time — an improvement. It is not.
	   The catalogue settles it two ways:

	     · magnitude tracks the optic. 8x -> -20, 6x -> -15, 2.4-4x -> -10, on
	       all 18 sights that carry it and 18 of 18 negative. That is a penalty
	       scaling with how much glass you put on the gun.
	     · the things that go positive are exactly the things that should:
	       Blitz Tactical Grip +35%, Viking Tactics UVG +25%, ergonomic
	       magazines +11..+15%. Grips and light mags help you onto target;
	       optics and silencers cost you.

	   So the label means what it says — speed, not time — and up is better. */
];

/**
 * Does this attachment modifier help the player? `null` when the stat is not a
 * modifier at all — an absolute weight or magazine size is neither good nor
 * bad, it is just a number, and colouring it would make every row shout.
 */
export function modifierBenefit(
	slug: string,
	value: number,
	signed: boolean
): boolean | null {
	if (!signed || value === 0) return null;
	return LOWER_IS_BETTER.includes(slug) ? value < 0 : value > 0;
}

export function isAccumulation(slug: string): boolean {
	return (ACCUMULATION_STATS as readonly string[]).includes(slug);
}

export function isPolyhedron(slug: string): boolean {
	return POLYHEDRON_STATS.includes(slug);
}
