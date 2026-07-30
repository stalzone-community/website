/**
 * The build calculator's own view of the catalogue.
 *
 * A full `Item` carries five languages, 161 possible stats, up to 264
 * compatibility ids and 15 upgrade levels; the calculator needs one language,
 * the stats that actually take part in the maths, and the slots an item can go
 * in. `scripts/build-calc-index.ts` projects the catalogue down to this and
 * emits it per language, so the builder fetches ~50 KB instead of 6.8 MB.
 *
 * Gear and weapons are separate payloads because they are separate tabs — a
 * visitor who only ever plans armour never pays for 338 weapons.
 */
import type { Rank, StatRange } from '../types.ts';

/** How a stat is rendered. The label is already resolved to one language. */
export interface CalcStatMeta {
	label: string;
	unit: string | null;
	signed: boolean;
}

interface CalcItemBase {
	id: string;
	name: string;
	icon: string | null;
	rank: Rank;
	/** second segment of the upstream category, e.g. `combat`, `gravity` */
	kind: string;
	weight: number;
}

/**
 * Armour. Upgrade levels change exactly one stat across all 137 pieces
 * (`art_bullet_dmg_factor`), so levels are a sparse map of level → that value
 * rather than a per-level stat object.
 */
export interface CalcArmor extends CalcItemBase {
	stats: Record<string, number>;
	/** level (1–15) → the stats that differ from level 0 */
	levels: Record<string, Record<string, number>>;
}

/** Containers and backpacks — both hold artefacts, both use the same three numbers. */
export interface CalcContainer extends CalcItemBase {
	/** `containers` or `backpacks` */
	group: 'containers' | 'backpacks';
	/** artefact slots — upstream `pack_size` */
	size: number;
	/** scales artefact bonuses, as a percentage — upstream `pack_effectiveness` */
	effectiveness: number;
	/** shields against artefact accumulation, as a percentage — upstream `pack_inner_protection` */
	protection: number;
	/** the container's own effects, if any */
	stats: Record<string, number>;
}

/**
 * An artefact. Its effects are bands, resolved against quality/rarity/level at
 * calculation time.
 *
 * `levels` ships upstream's real per-level bands rather than deriving them.
 * For every artefact but one they are exactly `base × (1 + 2·level/100)` — but
 * the Polyhedron's lifesaver stats follow a different curve, so the rule is not
 * safe to apply blind. `tests/calc-index.test.ts` pins both facts.
 */
export interface CalcArtefact extends CalcItemBase {
	ranges: Record<string, StatRange>;
	/** fixed (non-band) effects, e.g. the Polyhedron's blocking damage */
	stats: Record<string, number>;
	/** level (1–15) → the bands that differ from level 0 */
	levels: Record<string, Record<string, StatRange>>;
}

/** Food, drink and medicine — a timed set of flat bonuses. */
export interface CalcBuff extends CalcItemBase {
	/** `food`, `drink` or `medicine` */
	group: string;
	/** seconds the effect lasts — upstream `med_duration` */
	duration: number;
	/** seconds before it can be used again — upstream `med_cooldown` */
	cooldown: number;
	stats: Record<string, number>;
}

export interface GearIndex {
	lang: string;
	stats: Record<string, CalcStatMeta>;
	armor: CalcArmor[];
	containers: CalcContainer[];
	artefacts: CalcArtefact[];
	buffs: CalcBuff[];
}

export interface CalcWeapon extends CalcItemBase {
	stats: Record<string, number>;
	damage: {
		startDamage: number;
		damageDecreaseStart: number;
		endDamage: number;
		damageDecreaseEnd: number;
		maxDistance: number;
	} | null;
	/** level → stats that differ from level 0 */
	levels: Record<string, Record<string, number>>;
	/** level → damage ramp, when the upgrade moved it */
	damageLevels: Record<string, CalcWeapon['damage']>;
	/** ids of the attachments this weapon accepts */
	fits: string[];
	/** resolved label of the ammunition it takes, e.g. `5.45x39` */
	ammo: string | null;
}

/** Which physical slot an attachment occupies. One attachment, one slot. */
export type AttachmentSlot =
	| 'barrel'
	| 'mag'
	| 'collimator_sights'
	| 'forend'
	| 'handgrips'
	| 'pistol_handle'
	| 'accessory'
	| 'other';

export interface CalcAttachment extends CalcItemBase {
	slot: AttachmentSlot;
	stats: Record<string, number>;
}

export interface WeaponIndex {
	lang: string;
	stats: Record<string, CalcStatMeta>;
	weapons: CalcWeapon[];
	attachments: CalcAttachment[];
}
