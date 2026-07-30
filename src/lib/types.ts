/** The five languages EXBO ships in every translation object. */
export const LANGS = ['en', 'ru', 'fr', 'es', 'ko'] as const;
export type Lang = (typeof LANGS)[number];

export type Localized = Partial<Record<Lang, string>>;

/** `color` on the upstream item — the rank/quality band shown in-game. */
export type Rank =
	| 'RANK_NEWBIE'
	| 'RANK_STALKER'
	| 'RANK_VETERAN'
	| 'RANK_MASTER'
	| 'RANK_LEGEND'
	| 'QUEST_ITEM'
	| 'DEFAULT';

export type ItemStatus =
	| 'PERSONAL_ON_USE'
	| 'NON_DROP'
	| 'NONE'
	| 'PERSONAL_DROP_ON_GET'
	| 'PERSONAL_ON_GET';

/** Damage-vs-distance ramp: full damage to `decreaseStart`, falling to
 *  `endDamage` at `decreaseEnd`, nothing past `maxDistance`. */
export interface DamageRamp {
	startDamage: number;
	damageDecreaseStart: number;
	endDamage: number;
	damageDecreaseEnd: number;
	maxDistance: number;
}

/** Artefact effects are frequently a band rather than a fixed value. */
export interface StatRange {
	min: number;
	max: number;
}

/** A free-text block, e.g. "Compatible backpacks: Any". */
export interface ItemText {
	titleKey: string | null;
	title: Localized | null;
	textKey: string | null;
	text: Localized;
}

/**
 * One upgrade level of an item. Only the stats that actually differ from level
 * 0 are stored — for a typical weapon that's the damage ramp and the
 * `upg_*` bonus factors, not all 13 base stats repeated 15 times.
 */
export interface Variant {
	level: number;
	stats: Record<string, number>;
	ranges: Record<string, StatRange>;
	damage: DamageRamp | null;
}

export interface Item {
	id: string;
	/** upstream `category`, e.g. `weapon/assault_rifle` */
	category: string;
	/** first segment, e.g. `weapon` */
	group: string;
	/** second segment, e.g. `assault_rifle`; equals `group` when unsegmented */
	kind: string;
	/** i18n key of the item name — the join key for cross-item references */
	nameKey: string;
	name: Localized;
	rank: Rank;
	status: ItemStatus;
	/** path within the upstream repo, e.g. `/icons/weapon/7lnj7.png`; null when absent */
	icon: string | null;
	/** numeric stats at upgrade level 0, keyed by slug (see scripts/lib/stat-keys.ts) */
	stats: Record<string, number>;
	/** enum stats, value is an i18n key resolved through `enumLabels` */
	enums: Record<string, string>;
	/**
	 * Key-value stats whose value upstream is a literal string rather than a
	 * number or a translation, so neither `stats` nor `enums` can hold them.
	 * Four exist across the catalogue and every one was being dropped:
	 *
	 *   sight_zoom       34  "x2.40" or "x1.00, x1.50" — a sight can have several
	 *   art_freshness   103  "III"
	 *   usages_left      68  "5/5"
	 *   stash_inventory   4  "3 x 3"
	 *
	 * Untranslated by nature — they are numerals and roman numerals — so a plain
	 * string is the whole value, not a `Localized`.
	 */
	values: Record<string, string>;
	/** stats expressed as a band */
	ranges: Record<string, StatRange>;
	damage: DamageRamp | null;
	/** ids of items this one references (attachment ↔ weapon compatibility) */
	compatible: string[];
	/** name keys that referenced nothing in this realm */
	unresolvedRefs: string[];
	usedInCrafts: boolean;
	texts: ItemText[];
	/** upgrade levels 1..15, empty for the 1 806 items with no upgrade path */
	variants: Variant[];
}

/**
 * The projection a list page ships to the client.
 *
 * A full `Item` carries 15 upgrade variants, up to 264 compatibility ids and
 * five languages of every string. Sending those for a grid that renders a name
 * and an icon made /items/weapon a 2.4 MB document. This is what the card and
 * the client-side filter actually read.
 */
export interface ListItem {
	id: string;
	/** canonical /entities path segment — carried so a list link is a direct
	 *  hit rather than a redirect through the bare id */
	slug: string;
	name: Localized;
	category: string;
	group: string;
	kind: string;
	rank: Rank;
	icon: string | null;
}

export function toListItem(i: Item, slug: string): ListItem {
	return {
		id: i.id,
		slug,
		name: i.name,
		category: i.category,
		group: i.group,
		kind: i.kind,
		rank: i.rank,
		icon: i.icon
	};
}

/** How to render a stat: label in five languages, plus the unit/format learned
 *  from upstream's own `formatted.value` strings. */
export interface StatMeta {
	slug: string;
	/** originating i18n key */
	key: string;
	label: Localized;
	/** `kg`, `%`, `m`, `rpm`, … or null when the value is bare */
	unit: string | null;
	/** upstream renders it with an explicit +/- sign */
	signed: boolean;
	/** how many items carry it — drives filter UI ordering */
	items: number;
}

/** An item and how many of it — the unit both recipe kinds are built from. */
export interface ItemAmount {
	item: string;
	amount: number;
}

/** A workbench recipe: ingredients in, result out, gated on perks and features. */
export interface HideoutRecipe {
	bench: string;
	category: Localized;
	subcategory: Localized;
	result: ItemAmount[];
	ingredients: ItemAmount[];
	energy: number;
	/** perk id → required level */
	perks: Record<string, number>;
	/** hideout upgrades the bench needs, e.g. "precise_tools" */
	features: string[];
}

/**
 * One trader offer. Upstream nests offers under a recipe under a settlement;
 * this is flattened to one row per offer, because that is the grain an item
 * page renders ("you can get this here, for this").
 */
export interface BarterRecipe {
	/** i18n key of the settlement, e.g. `settlement.id.rostok.title` */
	settlement: string;
	settlementName: Localized;
	/** settlement reputation level required */
	level: number;
	/** the item being offered */
	item: string;
	currency: string;
	cost: number;
	requiredItems: ItemAmount[];
}

export interface RecipeData {
	hideout: HideoutRecipe[];
	barter: BarterRecipe[];
	perks: Record<string, { name: Localized; desc: Localized }>;
}

export interface DbSource {
	sha: string;
	committedAt: string;
	fetchedAt: string;
}

export interface ItemDatabase {
	realm: string;
	source: DbSource;
	builtAt: string;
	items: Item[];
	stats: Record<string, StatMeta>;
	/** i18n key → label, for every enum value appearing in `Item.enums` */
	enumLabels: Record<string, Localized>;
}
