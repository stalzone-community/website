/**
 * Factions, and what "available at" means on the tech tree.
 *
 * WHAT THE DATA ACTUALLY SAYS
 *
 * There are no faction-exclusive *item properties*. Every item tooltip was
 * checked for the `alliance_item` key the client's own strings imply ("This
 * item can only be used by members of the factions: …") and not one item
 * carries it. Nothing is named after a faction either.
 *
 * What is real is *where you can trade for it*. Each barter offer names the
 * settlement it is made at, and four of those settlements are faction homes.
 * Two shapes come out of that, and both matter:
 *
 *   1. The endgame armour tree forks —
 *        Samson Exoarmor      duty, freedom
 *        ├ Mule Exoarmor      duty, freedom          ← Frontier + Rise
 *        └ Trump Exoarmor     covenant, merc         ← Covenant + Mercenaries
 *   2. The best gear in the game is not on a tree at all. Apostle at Covenant,
 *      Chieftain at Rise, Granite and Vanguard at Frontier are each sold at ONE
 *      base, bought outright for materials — see `TechGraph.outright`.
 *
 * So a late-tier suit really is faction gear. The distinction is availability,
 * not a property of the item, which is why this module classifies a *set of
 * settlements* rather than tagging an item.
 *
 * EMBLEMS
 *
 * The glyphs are EXBO's own, sliced out of the character-select atlas
 * (`stalker/textures/gui/alliances/atlas_char_select.mic`) — the monochrome
 * icon row at the bottom of the sheet, which is the only place they ship
 * complete; every other copy in the client is oversized background art clipped
 * by its tile. They are unlicensed client assets, so they follow RESEARCH.md
 * §5: served from our own origin, credited to EXBO in the site footer, removed
 * on request.
 *
 * Monochrome is why they are used as a CSS mask rather than an <img>: the mark
 * takes the faction colour from a custom property, so it works on both skins
 * and can be dimmed by the tree's filter. The colours are the game's too, read
 * off the coloured copies on the same sheet.
 *
 * Shape carries the meaning and colour only reinforces it, deliberately: the
 * rank band already owns a colour on the same card, and a reader who cannot
 * separate red from green still has four distinct emblems.
 *
 * Pure and dependency-free, same rule as $lib/items and $lib/entities. Labels
 * are NOT here — they come localised in five languages on the barter rows, and
 * hardcoding English would throw that away.
 */

/** The middle segment of `settlement.id.<key>.title`. */
export type SettlementKey = string;

export interface FactionMeta {
	/** stable slug for CSS custom properties and query params */
	id: string;
	/** the game's own emblem colour, dark skin */
	colour: string;
	/** and on the light skin, where the emblem hues glare */
	colourLight: string;
	/** the emblem, used as a CSS mask so it can be tinted and dimmed */
	emblem: string;
}

/**
 * A faction's home base, keyed the way upstream keys its settlements.
 *
 * These four and only these four: `north_factions_block` is the shared
 * northern trade block, not a faction. It appears alongside *every*
 * faction-tier item, so as a badge it would be pure noise — the fork above
 * reads as "Frontier + Rise vs Covenant + Mercenaries" only once the block is
 * left out. It is still a place you can trade, so it keeps its filter chip;
 * see `availabilityOf`.
 */
export const FACTIONS: Record<SettlementKey, FactionMeta> = {
	duty: {
		id: 'frontier',
		colour: '#d0574f',
		colourLight: '#b23c34',
		emblem: '/factions/duty.png'
	},
	freedom: {
		id: 'rise',
		colour: '#79bd5c',
		colourLight: '#4a8438',
		emblem: '/factions/freedom.png'
	},
	merc: {
		id: 'mercenaries',
		colour: '#5f9cd8',
		colourLight: '#2f6ba8',
		emblem: '/factions/merc.png'
	},
	covenant: {
		id: 'covenant',
		colour: '#b07ada',
		colourLight: '#7b45a8',
		emblem: '/factions/covenant.png'
	}
};

/** The four faction homes, in the order badges should always appear. */
export const FACTION_HOMES = Object.keys(FACTIONS);

/** The shared northern block — a place, not a faction. */
export const NORTH_BLOCK = 'north_factions_block';

export function isFaction(key: SettlementKey): boolean {
	return key in FACTIONS;
}

export type Scope =
	/** sold at every faction home — the item is not a faction choice */
	| 'everywhere'
	/** sold at some faction homes but not all — this is the interesting one */
	| 'faction'
	/** pre-faction, from a neutral hub */
	| 'hub'
	/** never sold, only handed over (a starter piece you already own) */
	| 'none';

export interface Availability {
	scope: Scope;
	/** the homes to badge, in table order — empty unless scope is `faction` */
	homes: SettlementKey[];
	/** every settlement, faction or not, in the order given */
	all: SettlementKey[];
}

export function availabilityOf(settlements: Iterable<SettlementKey>): Availability {
	const all = [...new Set(settlements)];
	const set = new Set(all);
	const homes = FACTION_HOMES.filter((k) => set.has(k));

	if (!all.length) return { scope: 'none', homes: [], all };
	if (!homes.length) return { scope: 'hub', homes: [], all };
	if (homes.length === FACTION_HOMES.length) return { scope: 'everywhere', homes: [], all };
	return { scope: 'faction', homes, all };
}

/** True when the item can be traded for at this settlement. */
export function availableAt(settlements: Iterable<SettlementKey>, key: SettlementKey): boolean {
	for (const s of settlements) if (s === key) return true;
	return false;
}
