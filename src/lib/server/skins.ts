/**
 * Which named skins belong to which weapon, suit or knife.
 *
 * THE LINK IS IN THE KEY, NOT IN A FIELD
 *
 * A skin's `compatible` array is empty — all 318 of them — so on the face of it
 * nothing says that "Pastoral" is the FN SCAR SSR's. It is said in the i18n key:
 *
 *   item.wpn.scarssr.name                    FN SCAR SSR
 *   item.motif.wpn.scarssr_summer25.name     Pastoral
 *
 * Every base item is `item.<kind>.<slug>.name` and every skin is
 * `item.<motif|style>.<kind>.<slug>_<event>.name`, where `<event>` is the drop
 * it came from — `summer25`, `winter26`, `ssop`, `halloween23`, `stalker`.
 *
 * The slug cannot be taken by splitting on the last underscore, because plenty
 * of them contain one: `highest_power`, `aks74_main`, `skat10`. So the match is
 * longest-prefix — try the whole thing, then drop a trailing segment at a time
 * until a base item answers. `skat10_halloween23` finds `skat10` (Scythian-5)
 * and not some non-existent `skat10_halloween`.
 *
 * WHAT IT DOES NOT CATCH
 *
 * 201 of 318 resolve. The rest divide into three, and none of them should:
 *
 *   item.camo.unique_arm.*   58  universal camo — deliberately not one suit's
 *   item.19801.name          18  numeric keys carrying no slug at all
 *   the remainder                slugs whose base item is not in this realm
 *                                (`oldfal`), i.e. upstream drift
 *
 * A convention, then, not a contract. It is stable across every drop in the
 * vendored database, but if EXBO renames a base item the skin quietly stops
 * resolving — which fails safe: the skin simply does not appear, rather than
 * appearing under the wrong gun.
 */
import { items } from './catalogue.ts';
import type { Item } from '../types.ts';

/** Base items, keyed `<kind>|<slug>` — the left-hand side of the convention. */
const BASE = /^item\.(wpn|arm|melee|cont)\.(.+?)(?:\.name)?$/;
/** Named skins: a motif or a style, never a `camo` (those are universal). */
const SKIN = /^item\.(?:motif|style)\.(wpn|arm|melee|cont)\.(.+?)(?:\.name)?$/;

const byBase = new Map<string, Item[]>();

{
	const base = new Map<string, Item>();
	for (const i of items) {
		const m = BASE.exec(i.nameKey);
		if (m) base.set(`${m[1]}|${m[2]}`, i);
	}

	for (const skin of items) {
		const m = SKIN.exec(skin.nameKey);
		if (!m) continue;
		const [, kind, rest] = m;

		const parts = rest.split('_');
		for (let n = parts.length; n > 0; n--) {
			const owner = base.get(`${kind}|${parts.slice(0, n).join('_')}`);
			if (!owner) continue;
			const bucket = byBase.get(owner.id);
			if (bucket) bucket.push(skin);
			else byBase.set(owner.id, [skin]);
			break;
		}
	}
}

/** The named skins made for this item. Empty for most of the catalogue. */
export function skinsFor(id: string): Item[] {
	return byBase.get(id) ?? [];
}

export function hasSkins(id: string): boolean {
	return byBase.has(id);
}
