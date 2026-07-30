/**
 * Weapon + attachments.
 *
 * No reference implementation exists for this half — the wiki's calculator
 * stops at gear — so the rules here are read off the data rather than recovered
 * from someone else's, and the honest ones are separated from the assumed ones:
 *
 *  - **Exact.** The weapon's own stats at an upgrade level, and a magazine's
 *    stated clip size and reload times. Upstream ships all of these as real
 *    numbers per level.
 *  - **Assumed.** That an attachment's `upg_*` percentages add together and
 *    apply to the matching base stat. Multiplicative stacking is equally
 *    plausible; with one attachment per slot the two agree, and they only
 *    diverge once several slots modify the same stat. `modifiers` carries the
 *    per-attachment breakdown so a wrong assumption is visible rather than
 *    baked into a single number.
 *
 * Anything whose target is not obvious is left unapplied and reported in
 * `unmapped` rather than guessed at.
 *
 * Pure and dependency-free, like the rest of `$lib/calc`.
 */
import type { CalcAttachment, CalcWeapon } from './types.ts';

export interface WeaponState {
	id: string;
	/** upgrade level 0–15 */
	level: number;
	/** attachment ids, at most one per slot */
	attachments: string[];
}

export function emptyWeapon(): WeaponState {
	return { id: '', level: 0, attachments: [] };
}

/**
 * Which base stat each attachment percentage acts on.
 *
 * Every entry here is a stat where the pairing is unambiguous — `upg_spread`
 * and `spread` are the same quantity, and attachments state their effect as a
 * percentage of it. Percentages with no such partner (`upg_wiggle`,
 * `upg_recoil_gain`, `upg_shoot_factor_decrement`, the speed modifiers) are
 * deliberately absent: they are real effects with no base stat in the database
 * to apply them to, so they are surfaced as-is instead.
 */
export const UPGRADE_TARGETS: Readonly<Record<string, string>> = {
	upg_spread: 'spread',
	upg_hip_spread: 'hip_spread',
	upg_recoil: 'recoil',
	upg_horizontal_recoil: 'horizontal_recoil',
	upg_aim_switch_time: 'aim_switch',
	upg_draw_time: 'draw_time'
};

/** Magazine stats that replace the weapon's own rather than modifying it. */
const MAG_OVERRIDES: Readonly<Record<string, string>> = {
	mag_clip_size: 'clip_size',
	mag_reload_time: 'mag_reload_time',
	mag_reload_time_tactical: 'mag_reload_time_tactical'
};

/** The stats a weapon page leads with, in the order the game shows them. */
export const WEAPON_STAT_ORDER: readonly string[] = [
	'dmg_direct',
	'rate_of_fire',
	'clip_size',
	'distance',
	'spread',
	'hip_spread',
	'recoil',
	'horizontal_recoil',
	'draw_time',
	'aim_switch',
	'mag_reload_time',
	'mag_reload_time_tactical',
	'weight'
];

/** One attachment's share of a stat's change. */
export interface Modifier {
	id: string;
	name: string;
	/** percentage points, as stated by the attachment */
	percent: number;
}

export interface WeaponStat {
	slug: string;
	/** the weapon's value at its upgrade level, before attachments */
	base: number;
	/** after attachments */
	value: number;
	modifiers: Modifier[];
	/** the value came from a magazine's stated number, not a percentage */
	overridden: boolean;
}

export interface WeaponResult {
	stats: WeaponStat[];
	damage: CalcWeapon['damage'];
	/** weapon plus everything bolted to it */
	weight: number;
	/** attachment percentages with no base stat to apply to, summed */
	unmapped: { slug: string; percent: number; modifiers: Modifier[] }[];
	/** attachments referenced by the build that this weapon does not accept */
	incompatible: string[];
}

/** A weapon's stats at an upgrade level. Levels store only what differs. */
export function weaponStatsAtLevel(w: CalcWeapon, level: number): Record<string, number> {
	if (!level) return w.stats;
	return { ...w.stats, ...(w.levels[String(level)] ?? {}) };
}

export function weaponDamageAtLevel(w: CalcWeapon, level: number): CalcWeapon['damage'] {
	if (!level) return w.damage;
	return w.damageLevels[String(level)] ?? w.damage;
}

/** The slots a weapon has, derived from what it accepts. */
export function slotsFor(
	w: CalcWeapon,
	attachments: Map<string, CalcAttachment>
): Map<string, CalcAttachment[]> {
	const out = new Map<string, CalcAttachment[]>();
	for (const id of w.fits) {
		const a = attachments.get(id);
		if (!a) continue;
		const bucket = out.get(a.slot);
		if (bucket) bucket.push(a);
		else out.set(a.slot, [a]);
	}
	for (const list of out.values()) list.sort((a, b) => a.name.localeCompare(b.name));
	return out;
}

export function resolveWeapon(
	w: CalcWeapon,
	state: WeaponState,
	attachments: Map<string, CalcAttachment>
): WeaponResult {
	const level = Math.min(15, Math.max(0, Math.round(state.level)));
	const base = weaponStatsAtLevel(w, level);

	const fitted = new Set(w.fits);
	const incompatible: string[] = [];
	const equipped: CalcAttachment[] = [];
	for (const id of state.attachments) {
		const a = attachments.get(id);
		if (!a) continue;
		if (fitted.has(id)) equipped.push(a);
		else incompatible.push(id);
	}

	// percentages, gathered per target stat
	const percents = new Map<string, Modifier[]>();
	// magazine numbers, which replace rather than modify
	const overrides = new Map<string, { value: number; from: CalcAttachment }>();
	// `weight` is lifted onto its own field by the index and removed from
	// `stats`, so reading it from there gives every weapon a mass of zero
	let weight = w.weight;

	for (const a of equipped) {
		weight += a.weight;
		for (const [slug, value] of Object.entries(a.stats)) {
			const target = UPGRADE_TARGETS[slug];
			if (target !== undefined) {
				const list = percents.get(target) ?? [];
				list.push({ id: a.id, name: a.name, percent: value });
				percents.set(target, list);
				continue;
			}
			if (slug in MAG_OVERRIDES) {
				overrides.set(MAG_OVERRIDES[slug], { value, from: a });
				continue;
			}
			if (slug === 'mag_additive_clip_size') {
				const current = overrides.get('clip_size');
				overrides.set('clip_size', {
					value: (current?.value ?? base.clip_size ?? 0) + value,
					from: a
				});
				continue;
			}
			if (slug.startsWith('upg_')) {
				const list = percents.get(`?${slug}`) ?? [];
				list.push({ id: a.id, name: a.name, percent: value });
				percents.set(`?${slug}`, list);
			}
		}
	}

	const slugs = new Set([...Object.keys(base), ...overrides.keys()]);
	// weight is tracked separately — the stat row would only ever show the bare
	// weapon, which is not the number anyone wants
	slugs.delete('weight');

	const stats: WeaponStat[] = [];
	for (const slug of slugs) {
		const baseValue = base[slug] ?? 0;
		const override = overrides.get(slug);
		const modifiers = percents.get(slug) ?? [];
		const percent = modifiers.reduce((acc, m) => acc + m.percent, 0);

		const start = override ? override.value : baseValue;
		stats.push({
			slug,
			base: baseValue,
			value: percent ? start * (1 + percent / 100) : start,
			modifiers,
			overridden: Boolean(override)
		});
	}

	const order = new Map(WEAPON_STAT_ORDER.map((s, i) => [s, i]));
	stats.sort(
		(a, b) =>
			(order.get(a.slug) ?? WEAPON_STAT_ORDER.length) -
				(order.get(b.slug) ?? WEAPON_STAT_ORDER.length) || a.slug.localeCompare(b.slug)
	);

	const unmapped = [...percents.entries()]
		.filter(([k]) => k.startsWith('?'))
		.map(([k, modifiers]) => ({
			slug: k.slice(1),
			percent: modifiers.reduce((acc, m) => acc + m.percent, 0),
			modifiers
		}))
		.sort((a, b) => a.slug.localeCompare(b.slug));

	return {
		stats,
		damage: weaponDamageAtLevel(w, level),
		weight,
		unmapped,
		incompatible
	};
}
