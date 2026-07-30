/**
 * The build pipeline: gear in, one set of totals out.
 *
 * Order is load-bearing and matches BUILDS-CALCULATOR.md §3. In particular the
 * container's protection applies to the artefacts' *merged* accumulation, before
 * armour and buffs join in — a container shields you from what your artefacts
 * emit, not from the radiation your suit fails to stop.
 *
 * Pure and dependency-free (types only): `node --test` loads it without Vite,
 * which is the project rule for anything with maths in it.
 */
import {
	CONTAINER_PROTECTED_STATS,
	DANGER_LIMITS,
	REACTION_STATS,
	compareStatKeys,
	isBenefit,
	type StatOrigin
} from './keys.ts';
import { partitionPolyhedron, resolveArtefact, type ArtefactSlot, type Contribution } from './artefact.ts';
import type { CalcArmor, CalcBuff, CalcContainer, GearIndex } from './types.ts';

/** What the player configured. Serialised into the URL by `codec.ts`. */
export interface BuildState {
	armor: { id: string; level: number } | null;
	/** id of the container or backpack holding the artefacts */
	container: string | null;
	artefacts: ArtefactSlot[];
	/** ids of active food/drink/medicine */
	buffs: string[];
	/** anomaly reactions the player has switched on */
	reactions: string[];
	/** 0–4 */
	bleeding: number;
	burning: boolean;
}

export function emptyBuild(): BuildState {
	return {
		armor: null,
		container: null,
		artefacts: [],
		buffs: [],
		reactions: [],
		bleeding: 0,
		burning: false
	};
}

/** One stat after everything has been added up. */
export interface StatTotal {
	slug: string;
	value: number;
	benefit: boolean;
	/** where the total came from, so the UI can explain it */
	sources: Partial<Record<StatOrigin, number>>;
}

export interface BuildResult {
	stats: StatTotal[];
	/** the lifesaver block, shown apart rather than summed */
	polyhedron: StatTotal[];
	/** reactions this build could switch on, whether or not it has */
	availableReactions: string[];
	/** estimates — see BUILDS-CALCULATOR.md §3.8 */
	effectiveHealth: number;
	healingPerSecond: number;
	/** accumulation stats over their safe limit */
	alerts: string[];
	/** kilograms of gear worn, artefacts included */
	weight: number;
	/** artefact slots the chosen container provides, and how many are filled */
	slots: { used: number; total: number };
}

/**
 * Penalties by bleeding stage: regeneration first, healing efficiency second.
 * Stage 0 is "not bleeding".
 */
export const BLEEDING_PENALTIES: ReadonlyArray<readonly [number, number]> = [
	[0, 0],
	[2.5, 30],
	[17.5, 80],
	[27.5, 130],
	[37.5, 180]
];

export const BURNING_PENALTIES = { regeneration: 5, efficiency: 65 } as const;

export const MAX_BLEEDING = BLEEDING_PENALTIES.length - 1;

const HEALTH = 'art_health_bonus';
const BULLET = 'art_bullet_dmg_factor';
const TEAR = 'art_tear_dmg_factor';
const STABILITY = 'art_stopping_protection';
const REGEN = 'art_regeneration_bonus';
const HEAL_EFFICIENCY = 'art_heal_efficiency';
const ARTEFACT_HEAL = 'art_artefakt_heal';
const STAMINA_REGEN = 'art_stamina_regeneration_bonus';

/** Merge contributions by stat, keeping a per-origin breakdown. */
function sum(rows: Contribution[]): Map<string, StatTotal> {
	const out = new Map<string, StatTotal>();
	for (const r of rows) {
		const existing = out.get(r.slug);
		if (existing) {
			existing.value += r.value;
			existing.sources[r.origin] = (existing.sources[r.origin] ?? 0) + r.value;
			existing.benefit = isBenefit(r.slug, existing.value);
		} else {
			out.set(r.slug, {
				slug: r.slug,
				value: r.value,
				benefit: isBenefit(r.slug, r.value),
				sources: { [r.origin]: r.value }
			});
		}
	}
	return out;
}

/**
 * The container's shielding, applied to what the artefacts emit.
 *
 * Only to what the artefacts emit: armour's own accumulation is not something
 * the container sits between you and.
 */
function applyContainerProtection(rows: Contribution[], protection: number): Contribution[] {
	if (!protection) return rows;
	return rows.map((r) =>
		!r.benefit && r.origin === 'artefact' && CONTAINER_PROTECTED_STATS.includes(r.slug)
			? { ...r, value: r.value * (1 - protection / 100), rawValue: r.rawValue * (1 - protection / 100) }
			: r
	);
}

/**
 * Stability, recomputed from the armour's tear factor.
 *
 * `tear_dmg_factor` behaves like armour points rather than a percentage — 100
 * points halves incoming damage — so the two combine multiplicatively instead
 * of adding. Runs even when nothing granted stability directly: a tear factor
 * on its own still produces some.
 */
function recomputeStability(totals: Map<string, StatTotal>): void {
	const tear = totals.get(TEAR)?.value ?? 0;
	const existing = totals.get(STABILITY);
	const stability = existing?.value ?? 0;
	if (!tear && !stability) return;

	const value = (1 - (100 / (100 + tear)) * (1 - stability / 100)) * 100;
	if (existing) {
		existing.value = value;
		existing.benefit = value > 0;
	} else {
		totals.set(STABILITY, { slug: STABILITY, value, benefit: value > 0, sources: {} });
	}
}

function add(totals: Map<string, StatTotal>, slug: string, value: number, origin: StatOrigin): void {
	const row = totals.get(slug);
	if (row) {
		row.value += value;
		row.sources[origin] = (row.sources[origin] ?? 0) + value;
		row.benefit = isBenefit(slug, row.value);
	} else {
		totals.set(slug, { slug, value, benefit: isBenefit(slug, value), sources: { [origin]: value } });
	}
}

/**
 * Anomaly reactions, which the player switches on rather than simply having.
 *
 * Each active reaction adds its own value to both vitality and stamina
 * regeneration — the reaction is a conversion, not a flat bonus, which is why
 * it lands on two unrelated stats.
 */
function applyReactions(totals: Map<string, StatTotal>, active: string[]): void {
	const bonus = [...new Set(active)]
		.filter((k) => REACTION_STATS.includes(k))
		.reduce((acc, k) => acc + (totals.get(k)?.value ?? 0), 0);
	if (!bonus) return;
	add(totals, HEALTH, bonus, 'reaction');
	add(totals, STAMINA_REGEN, bonus, 'reaction');
}

/** Bleeding and burning, which subtract from healing rather than from health. */
function applyDebuffs(totals: Map<string, StatTotal>, bleeding: number, burning: boolean): void {
	const stage = Math.min(Math.max(Math.round(bleeding), 0), MAX_BLEEDING);
	const [bleedRegen, bleedEfficiency] = BLEEDING_PENALTIES[stage];
	const regen = bleedRegen + (burning ? BURNING_PENALTIES.regeneration : 0);
	const efficiency = bleedEfficiency + (burning ? BURNING_PENALTIES.efficiency : 0);
	if (!regen && !efficiency) return;

	// the penalty needs a row to land on even when nothing granted the stat —
	// bleeding with no regeneration bonus is negative regeneration, not zero
	if (regen) add(totals, REGEN, -regen, 'debuff');
	if (efficiency) add(totals, HEAL_EFFICIENCY, -efficiency, 'debuff');
}

/**
 * Effective health: how much bullet damage the build absorbs before dying,
 * relative to a bare stalker at 100.
 */
export function effectiveHealth(totals: Map<string, StatTotal>): number {
	const health = totals.get(HEALTH)?.value ?? 0;
	const bullet = totals.get(BULLET)?.value ?? 0;
	return ((health + 100) / 100) * (100 + bullet);
}

/** Health per second from passive regeneration plus artefact healing. */
export function healingPerSecond(totals: Map<string, StatTotal>): number {
	const regen = totals.get(REGEN)?.value ?? 0;
	const artefact = totals.get(ARTEFACT_HEAL)?.value ?? 0;
	const efficiency = totals.get(HEAL_EFFICIENCY)?.value ?? 0;
	return (regen + 2.5) / 5 + artefact * (1 + efficiency / 100);
}

/** Accumulations past the point where they start hurting. */
export function dangerAlerts(totals: Map<string, StatTotal>): string[] {
	const out: string[] = [];
	for (const [slug, limit] of Object.entries(DANGER_LIMITS)) {
		const v = totals.get(slug)?.value ?? 0;
		if (v > limit) out.push(slug);
	}
	return out;
}

function statsToContributions(
	stats: Record<string, number>,
	origin: StatOrigin
): Contribution[] {
	return Object.entries(stats).map(([slug, value]) => ({
		slug,
		value,
		rawValue: value,
		origin,
		benefit: isBenefit(slug, value)
	}));
}

/** Armour's stats at an upgrade level. Levels store only what differs. */
export function armorStatsAtLevel(a: CalcArmor, level: number): Record<string, number> {
	if (!level) return a.stats;
	return { ...a.stats, ...(a.levels[String(level)] ?? {}) };
}

/** Everything the calculator needs to look items up by id. */
export interface GearLookup {
	armor: Map<string, CalcArmor>;
	containers: Map<string, CalcContainer>;
	artefacts: Map<string, GearIndex['artefacts'][number]>;
	buffs: Map<string, CalcBuff>;
}

export function indexGear(index: GearIndex): GearLookup {
	return {
		armor: new Map(index.armor.map((a) => [a.id, a])),
		containers: new Map(index.containers.map((c) => [c.id, c])),
		artefacts: new Map(index.artefacts.map((a) => [a.id, a])),
		buffs: new Map(index.buffs.map((b) => [b.id, b]))
	};
}

export function computeBuild(state: BuildState, gear: GearLookup): BuildResult {
	const container = state.container ? (gear.containers.get(state.container) ?? null) : null;
	const effectiveness = container?.effectiveness ?? 100;
	const protection = container?.protection ?? 0;

	// 1. artefacts, each resolved against its own quality/rarity/level
	const artefactRows: Contribution[] = [];
	let artefactWeight = 0;
	let filled = 0;
	for (const slot of state.artefacts) {
		const a = gear.artefacts.get(slot.id);
		if (!a) continue;
		filled++;
		artefactWeight += a.weight;
		artefactRows.push(...resolveArtefact(a, slot, effectiveness));
	}

	const split = partitionPolyhedron(artefactRows);

	// 2. the container shields you from what they emit
	const shielded = applyContainerProtection(split.stats, protection);

	// 3. armour, container and buffs join the pile
	const rows: Contribution[] = [...shielded];
	let weight = artefactWeight;

	const armor = state.armor ? (gear.armor.get(state.armor.id) ?? null) : null;
	if (armor) {
		weight += armor.weight;
		rows.push(...statsToContributions(armorStatsAtLevel(armor, state.armor?.level ?? 0), 'armor'));
	}
	if (container) {
		weight += container.weight;
		rows.push(...statsToContributions(container.stats, 'container'));
	}
	for (const id of state.buffs) {
		const b = gear.buffs.get(id);
		if (b) rows.push(...statsToContributions(b.stats, 'buff'));
	}

	// 4. merge, then the corrections that need the merged view
	const totals = sum(rows);
	recomputeStability(totals);
	applyReactions(totals, state.reactions);
	applyDebuffs(totals, state.bleeding, state.burning);

	const stats = [...totals.values()]
		.filter((s) => s.value !== 0)
		.sort((a, b) => compareStatKeys(a.slug, b.slug));

	const polyhedron = [...sum(split.polyhedron).values()].sort((a, b) =>
		compareStatKeys(a.slug, b.slug)
	);

	return {
		stats,
		polyhedron,
		availableReactions: REACTION_STATS.filter((k) => totals.has(k)),
		effectiveHealth: effectiveHealth(totals),
		healingPerSecond: healingPerSecond(totals),
		alerts: dangerAlerts(totals),
		weight,
		slots: { used: filled, total: container?.size ?? 0 }
	};
}
