/**
 * Translation-key namespaces → stat slug prefixes.
 *
 * The upstream database labels every stat with a full i18n key. Slugging on the
 * last segment alone would silently merge 22 distinct stats, and two of those
 * merges would actively corrupt weapon pages:
 *
 *   weapon.stat_factor.damage            = upgrade BONUS (%), varies per variant
 *   weapon.tooltip.bullet.stat_name.damage = the ammo's actual damage
 *
 *   core.tooltip.info.durability         = item durability
 *   stalker.tooltip.artefact.info.durability = artefact CHARGE (label says "Charge")
 *
 * So slugs are namespace-aware. Unknown prefixes throw rather than guessing —
 * a new EXBO patch adding stats should fail the build loudly, not drop them.
 * `npm run db:report` lists every key currently in the data.
 */
export const NAMESPACES: Record<string, string> = {
	// core item info — the bare namespace, these are the universal stats
	'core.tooltip.info': '',
	'core.tooltip': '',
	'core.tooltip.stat_name.damage_type': 'dmg_',
	'core.quality': 'quality_',

	// weapons: `tooltip` = actual stats, `stat_factor` = upgrade bonuses
	'weapon.tooltip.weapon.info': '',
	'weapon.stat_factor': 'upg_',
	'weapon.tooltip.magazine.info': 'mag_',
	'weapon.tooltip.bullet.stat_name': 'ammo_',
	'weapon.tooltip.bullet.info': 'ammo_',
	'weapon.tooltip.sight.info': 'sight_',
	'weapon.tooltip.melee_weapon.stat_name': 'melee_',
	'weapon.tooltip.melee_weapon.info.damage.min': 'melee_dmg_min_',
	'weapon.tooltip.melee_weapon.info.damage.max': 'melee_dmg_max_',
	'weapon.tooltip.melee_weapon.info.reach': 'melee_reach_',
	'weapon.grenade.frag.stats.info': 'frag_',
	'weapon.grenade.flash.stats.info': 'flash_',

	// artefacts: `factor` = the effects, `tooltip.artefact` = charge/freshness
	'stalker.artefact_properties.factor': 'art_',
	'stalker.tooltip.artefact.info': 'art_',

	// gear
	'stalker.tooltip.armor_plate.stat_name': 'plate_',
	'stalker.tooltip.backpack.stat_name': 'pack_',
	'stalker.tooltip.backpack.info': 'pack_',
	'stalker.tooltip.medicine.info': 'med_',
	'stalker.tooltip.stash_placer.info': 'stash_',
	'stalker.tooltip.item.lifesaver.info': 'lifesaver_',
	'stalker.tooltip.item.lifesaver_sniper.info': 'lifesaver_sniper_',

	// detectors / scanners
	'stalker.gauge_meter_stat.metal_detector.info': 'detector_',
	'anomaly.tooltip.scanner.info': 'scanner_',
	'anomaly.tooltip.signal_detector.info': 'signal_',

	// misc
	'customitem.lore.command.info': 'custom_',
	'upgrade_tool.tooltip.info': 'tool_'
};

export class UnknownStatKeyError extends Error {
	// a plain field, not a TS parameter property — node's strip-only TypeScript
	// support rejects those, and these scripts run under bare `node`
	key: string;

	constructor(key: string) {
		super(
			`Unknown stat namespace for "${key}".\n` +
				`  EXBO added a stat this build doesn't know about.\n` +
				`  Add its prefix to scripts/lib/stat-keys.ts, then re-run.\n` +
				`  See the current key set with: npm run db:report`
		);
		this.name = 'UnknownStatKeyError';
		this.key = key;
	}
}

/** `weapon.stat_factor.damage` → `upg_damage` */
export function slugFor(key: string): string {
	const prefix = key.slice(0, key.lastIndexOf('.'));
	const leaf = key.slice(key.lastIndexOf('.') + 1);
	const ns = NAMESPACES[prefix];
	if (ns === undefined) throw new UnknownStatKeyError(key);
	return ns + leaf;
}
