/**
 * Resolving one artefact into flat numbers.
 *
 * An artefact does not have stats so much as *bands*: `stamina +13.09…+15.4`.
 * Which point in the band you get depends on the artefact's quality, its rarity
 * and how far it has been upgraded, and — for bonuses only — on the container
 * carrying it. This module is the only place that decision is made.
 *
 * Pure and dependency-free (types only), so `node --test` loads it directly.
 * See BUILDS-CALCULATOR.md §3.1 for the derivation and where it came from.
 */
import type { StatRange } from '../types.ts';
import type { CalcArtefact } from './types.ts';
import { isAccumulation, isBenefit, isPolyhedron, type StatOrigin } from './keys.ts';

export type Rarity =
	| 'ordinary'
	| 'unordinary'
	| 'special'
	| 'rare'
	| 'exclusive'
	| 'legendary'
	| 'unique';

/**
 * Rarity's place in the quality scale. `ordinary` has none — it is everything
 * below 100, where the bands interpolate rather than step.
 */
export const RARITY_INDEX: Readonly<Record<Rarity, number | null>> = {
	ordinary: null,
	unordinary: 0,
	special: 1,
	rare: 2,
	exclusive: 3,
	legendary: 4,
	unique: 5
};

export const QUALITY_MIN = 0;
export const QUALITY_MAX = 190;
export const MAX_LEVEL = 15;

/** Quality at which each rarity band opens. Order matters — highest first. */
const RARITY_BANDS: ReadonlyArray<[number, Rarity]> = [
	[175, 'unique'],
	[160, 'legendary'],
	[145, 'exclusive'],
	[130, 'rare'],
	[115, 'special'],
	[100, 'unordinary']
];

/** The rarity a given quality falls in, when the player has not stated one. */
export function rarityForQuality(quality: number): Rarity {
	for (const [floor, rarity] of RARITY_BANDS) if (quality > floor) return rarity;
	return quality > 100 ? 'unordinary' : 'ordinary';
}

/** One artefact as the player configured it. */
export interface ArtefactSlot {
	id: string;
	/** 0–190; above 100 the rarity bands take over */
	quality: number;
	rarity: Rarity;
	/** upgrade level, 0–15 */
	level: number;
}

export function clampQuality(q: number): number {
	return Math.min(QUALITY_MAX, Math.max(QUALITY_MIN, q));
}

export function clampLevel(l: number): number {
	return Math.min(MAX_LEVEL, Math.max(0, Math.round(l)));
}

/**
 * The artefact's bands at an upgrade level.
 *
 * Upstream ships a real band per level, so this is a lookup rather than a
 * formula. For every artefact but the Polyhedron those bands happen to be
 * `base × (1 + 2·level/100)`; the Polyhedron's recharge and cost go the other
 * way, `× (1 − 2·level/100)`, because a shorter recharge is the upgrade.
 * Applying one rule to both — which is what deriving instead of reading would
 * force — gets the Polyhedron backwards.
 */
export function bandsAtLevel(a: CalcArtefact, level: number): Record<string, StatRange> {
	if (!level) return a.ranges;
	return { ...a.ranges, ...(a.levels[String(level)] ?? {}) };
}

/**
 * A band with its endpoints ordered by magnitude and scaled by the container.
 *
 * `hi` is the end the game treats as "more of this stat" — which for a band
 * sitting entirely below zero (an artefact that *reduces* radiation) is the
 * most negative endpoint, not the largest one.
 */
interface Band {
	hi: number;
	lo: number;
	/** the same pair before the container's effectiveness was applied */
	baseHi: number;
	baseLo: number;
	/** upstream stores "lower is better" stats with max below min */
	inverted: boolean;
}

function orient(r: StatRange, factor: number): Band {
	const inverted = r.max < r.min;
	let hi = Math.max(r.max, r.min);
	let lo = Math.min(r.max, r.min);
	if (r.max <= 0 && r.min <= 0) {
		hi = Math.min(r.max, r.min);
		lo = Math.max(r.max, r.min);
	}
	return { hi: hi * factor, lo: lo * factor, baseHi: hi, baseLo: lo, inverted };
}

const RARITY_STEPS = [115, 130, 145, 160, 175, 190];

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, v));
}

/**
 * Where in the band a quality lands, for a stat that *helps*.
 *
 * Bonuses scale straight off the top of the band: quality is simply the
 * percentage of it you get, so a 100-quality artefact gives the full band and a
 * 50-quality one gives half.
 */
function resolveBenefit(band: Band, quality: number, useEffectiveness: boolean): number {
	const hi = useEffectiveness ? band.hi : band.baseHi;
	return hi * (quality / 100);
}

/**
 * Where in the band a quality lands, for a stat that *costs* you something.
 *
 * Drawbacks interpolate instead, and the rule changes at quality 100. Below it,
 * the band runs bottom to top with quality. Above it the artefact has a rarity,
 * and each rarity band restarts at 85% of the maximum and climbs to it across
 * its 15 points of quality — so a barely-legendary artefact carries a lighter
 * drawback than a maxed-out exclusive one.
 */
function resolveCost(
	band: Band,
	quality: number,
	rarity: Rarity,
	useEffectiveness: boolean
): number {
	const hi = useEffectiveness ? band.hi : band.baseHi;
	const lo = useEffectiveness ? band.lo : band.baseLo;
	const index = RARITY_INDEX[rarity];

	if (quality <= 100) {
		// an unordinary artefact pinned at exactly 100 sits at the foot of its
		// own band rather than the top of the ordinary one
		if (quality === 100 && rarity === 'unordinary') {
			const floor = 0.9 * hi;
			return floor + ((hi - floor) / 100) * ((quality - (100 + 10 * (index ?? 0))) * 10);
		}
		return lo + ((hi - lo) / 100) * quality;
	}

	const derived = Math.floor((quality - 100) / 15);
	// a quality sitting exactly on a band edge belongs to the rarity the player
	// stated, not the one the arithmetic would round it into
	const step = RARITY_STEPS.includes(quality) ? (index ?? derived) : clamp(index ?? derived, 0, 5);
	const t = clamp(quality - (100 + 15 * step), 0, 15) / 15;
	const floor = 0.85 * hi;
	return floor + (hi - floor) * t;
}

/**
 * A "lower is better" band — recharge time, activation cost. Upstream marks
 * these by storing max below min.
 *
 * Quality walks from the slow end to the fast end and stops there: there is no
 * evidence that quality past 100 shortens a recharge further, so it doesn't.
 */
function resolveInverted(band: Band, quality: number, useEffectiveness: boolean): number {
	const worst = useEffectiveness ? band.lo : band.baseLo;
	const best = useEffectiveness ? band.hi : band.baseHi;
	// orient() sorted them by value; for an inverted band the *smaller* number
	// is the good one, so walk from the larger down to it
	const from = Math.max(worst, best);
	const to = Math.min(worst, best);
	return from + (to - from) * (Math.min(quality, 100) / 100);
}

/** One stat's contribution from one source. */
export interface Contribution {
	slug: string;
	value: number;
	origin: StatOrigin;
	/** true when this value helps the player, by the stat's own sign convention */
	benefit: boolean;
	/** the same value with the container's effectiveness left out */
	rawValue: number;
}

/**
 * Every number one configured artefact contributes.
 *
 * `effectiveness` is the container's, as a percentage. It scales bonuses only —
 * never the accumulations, because a container that made an artefact's
 * radiation worse in proportion to how well it boosted it would be a strictly
 * worse container, and the game does not work that way.
 */
export function resolveArtefact(
	a: CalcArtefact,
	slot: ArtefactSlot,
	effectiveness = 100
): Contribution[] {
	const quality = clampQuality(slot.quality);
	const level = clampLevel(slot.level);
	const bands = bandsAtLevel(a, level);
	const out: Contribution[] = [];

	for (const [slug, range] of Object.entries(bands)) {
		const factor = isAccumulation(slug) ? 1 : effectiveness / 100;
		const band = orient(range, factor);

		let value: number;
		let raw: number;
		if (band.inverted) {
			value = resolveInverted(band, quality, true);
			raw = resolveInverted(band, quality, false);
		} else if (isBenefit(slug, band.baseHi)) {
			value = resolveBenefit(band, quality, true);
			raw = resolveBenefit(band, quality, false);
		} else {
			value = resolveCost(band, quality, slot.rarity, true);
			raw = resolveCost(band, quality, slot.rarity, false);
		}

		out.push({
			slug,
			value,
			rawValue: raw,
			origin: 'artefact',
			benefit: band.inverted ? true : isBenefit(slug, value)
		});
	}

	// fixed effects, if the artefact has any, ride along unscaled
	for (const [slug, value] of Object.entries(a.stats)) {
		out.push({ slug, value, rawValue: value, origin: 'artefact', benefit: isBenefit(slug, value) });
	}

	return out;
}

/** Splits an artefact's contributions into the summable ones and the lifesaver
 *  block, which is displayed on its own — adding two recharge times together
 *  would produce a number that means nothing. */
export function partitionPolyhedron(rows: Contribution[]): {
	stats: Contribution[];
	polyhedron: Contribution[];
} {
	const stats: Contribution[] = [];
	const polyhedron: Contribution[] = [];
	for (const r of rows) (isPolyhedron(r.slug) ? polyhedron : stats).push(r);
	return { stats, polyhedron };
}
