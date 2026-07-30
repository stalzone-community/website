/**
 * Entity model: one detail page for everything, dispatching on what a thing
 * *has* rather than what it *is*.
 *
 * WHY NOT A TYPE HIERARCHY
 *
 * The obvious design is `Artefact extends Item` with an effect-bands widget on
 * the artefact subtype. The data says no: 34 of the `art_*` "artefact property"
 * stats appear on more than one group. `art_speed_modifier` is carried by
 * weapons, armour, supplies, artefacts, backpacks and `other` — the SA-58 rifle
 * has one. Hang the widget off a subtype and you need it on five more within a
 * week, at which point you have mixins, which is composition with ceremony.
 *
 * The second half of the argument: across 2 311 items there are only 13
 * distinct capability combinations, and they do not line up with the 14 groups
 * (`other` spans 6 of them, `artefact` only 2). Capabilities cut across types,
 * so capabilities are what the page should branch on. Type survives as
 * presentation metadata — icon, colour, breadcrumb, widget order — not as a
 * dispatch key.
 *
 * Pure and dependency-free so node:test can load it, same rule as $lib/items.
 * `./nav-icons` and `./stat-icons` are the only imports and hold to the same
 * rule — inert strings and lookup tables, no framework — so the tab table can
 * name its own glyph and `splitStats` can put a stat where it reads.
 */
import {
	auctionIcon,
	cosmeticsIcon,
	compatibleIcon,
	craftIcon,
	craftTreeIcon,
	modelIcon,
	overviewIcon,
	techTreeIcon
} from './nav-icons.ts';
import { statGroupOrder } from './stat-icons.ts';
import type { Item, Localized, StatMeta } from './types.ts';

export type EntityType = 'item' | 'mob' | 'location';

/**
 * Stats prefixed `art_` are the shared *effect* vocabulary — the bonuses and
 * accumulations an artefact, a suit, a backpack or a consumable applies to the
 * player. They read as a band ("+13.09% … +15.4% stamina") and want their own
 * widget, separate from the flat numeric stats.
 */
export const EFFECT_PREFIX = 'art_';

export const isEffect = (slug: string): boolean => slug.startsWith(EFFECT_PREFIX);

/**
 * The two `status` values that mean "bound to your character the moment you
 * acquire it". Those items can never reach the auction; everything else can.
 *
 * There is no `auctionable` flag upstream, so this is derived — and the obvious
 * guess is wrong in a way worth writing down. `NON_DROP` reads like a trade
 * restriction but means "stays in your inventory when you die": all 103
 * artefacts carry it, and artefacts are the busiest market in the game. Only
 * these two states actually bind:
 *
 *   PERSONAL_ON_GET       (28)  crafting parts, schematics, clan vouchers, IOUs
 *   PERSONAL_DROP_ON_GET  (51)  quest gathering — herbs, moss, data fragments
 *
 * Both lists were read off the catalogue and are exactly what you would expect
 * to be untradeable. The remaining 2232 of 2311 items are auctionable, which is
 * high but correct: in this game almost everything is.
 *
 * This is an inference, not a documented contract, and on its own it is a weak
 * one: `status` turns out to be a *category* fact, not a per-item one. All 338
 * weapons carry `PERSONAL_ON_USE`, as do all 137 suits and all 280 attachments,
 * so within a category this function distinguishes nothing — for a weapon it is
 * equivalent to "is it a weapon" and answers yes 338 times out of 338. The one
 * signal that cuts across it is `boundOnAssembly` below; see
 * $lib/server/assembly for what it is and why it lives outside this file.
 *
 * Nor can the API settle it yet. `GET /{region}/auction/{item}/lots` is the
 * authoritative test, but the demo tier answers 200 with the same fixture for
 * every valid id — including `PERSONAL_ON_GET` items that are certainly bound —
 * so it validates "known item", not "auctionable". Recheck against production
 * once that access lands, rather than trusting this comment.
 */
export const BOUND_ON_ACQUIRE: readonly string[] = ['PERSONAL_ON_GET', 'PERSONAL_DROP_ON_GET'];

export const isAuctionable = (status: string | undefined | null): boolean =>
	status != null && !BOUND_ON_ACQUIRE.includes(status);

/** What a page can render for this entity. Every flag is derived from data. */
export interface Capabilities {
	stats: boolean;
	effects: boolean;
	upgrades: boolean;
	damage: boolean;
	/** made at a bench, goes into something made at one, or is gathered in
	 *  numbered parts and assembled — three answers to one question, so one tab */
	crafting: boolean;
	/** a trader sells it, or takes it as payment */
	trading: boolean;
	/** things that fit it, or that it fits — attachments, weapons, plates */
	attachments: boolean;
	/** paints that can be applied to it, or named skins made for it; a separate
	 *  tab because it is a separate question, and on a rifle the paints alone are
	 *  half the compatibility list */
	cosmetics: boolean;
	text: boolean;
	model: boolean;
	/** sits on a barter progression tree — distinct from `upgrades`, which is
	 *  the +1..+15 modification levels of this one item */
	techTree: boolean;
	/** a bench makes it, so there is a craft graph to draw. Never true at the
	 *  same time as `techTree`: across all 2 311 items not one is on both, which
	 *  is why the two get one tab position between them rather than competing
	 *  for it. */
	craftTree: boolean;
	/** can be listed on the auction, so the page can carry a price history */
	auction: boolean;
}

export interface CapabilityInput {
	stats?: Record<string, number>;
	ranges?: Record<string, { min: number; max: number }>;
	variants?: unknown[];
	damage?: unknown;
	/** compatible items that are fittings — resolved by the caller, because
	 *  telling a scope from a paint needs the catalogue and this file is pure */
	fittings?: unknown[];
	/** compatible items that are paints */
	cosmetics?: unknown[];
	/** named skins made for this item — the link is in the i18n key rather than
	 *  the compatibility list, so only the server can see it (see server/skins) */
	hasSkins?: boolean;
	texts?: unknown[];
	model?: string | null;
	hasCrafting?: boolean;
	/** either end of a parts→gear assembly link (see $lib/server/assembly).
	 *  Upstream records no recipe for these, so they are invisible to
	 *  `hasCrafting` even though assembly is how you obtain the thing. */
	hasAssembly?: boolean;
	hasTrading?: boolean;
	inTechTree?: boolean;
	isCraftable?: boolean;
	status?: string | null;
	/**
	 * Assembled from numbered parts, so every copy is personal and none can be
	 * listed. Resolved by the caller from `assembly.json`, because the part→gear
	 * link is a name match against the whole catalogue and this file is pure. See
	 * $lib/server/assembly.
	 */
	boundOnAssembly?: boolean;
}

export function capabilitiesOf(e: CapabilityInput): Capabilities {
	const statKeys = Object.keys(e.stats ?? {});
	const rangeKeys = Object.keys(e.ranges ?? {});
	return {
		// plain stats: everything that is not an effect band
		stats: statKeys.some((k) => !isEffect(k)),
		effects: statKeys.some(isEffect) || rangeKeys.length > 0,
		upgrades: (e.variants?.length ?? 0) > 0,
		damage: Boolean(e.damage),
		crafting: Boolean(e.hasCrafting) || Boolean(e.hasAssembly),
		trading: Boolean(e.hasTrading),
		attachments: (e.fittings?.length ?? 0) > 0,
		cosmetics: (e.cosmetics?.length ?? 0) > 0 || Boolean(e.hasSkins),
		text: (e.texts?.length ?? 0) > 0,
		model: Boolean(e.model),
		techTree: Boolean(e.inTechTree),
		craftTree: Boolean(e.isCraftable),
		auction: isAuctionable(e.status) && !e.boundOnAssembly
	};
}

/**
 * Split a stat map into the effect bands and the plain numbers, so a page can
 * render each with the widget that suits it. `meta` filters out slugs the stat
 * dictionary does not know, which would otherwise render as a raw key.
 *
 * Both halves come back in $lib/stat-icons' group order, then alphabetically
 * inside a group. Alphabetical alone is what put "Magazine capacity", "Reload"
 * and "Tactical reload" in three different parts of a rifle's twenty-three-row
 * table: it is a fine tie-break and a poor primary sort, because nothing a player
 * wants to compare is adjacent in it.
 */
export function splitStats(
	stats: Record<string, number>,
	meta: Record<string, StatMeta>
): { effects: string[]; plain: string[] } {
	const effects: string[] = [];
	const plain: string[] = [];
	for (const k of Object.keys(stats)) {
		if (!meta[k]) continue;
		(isEffect(k) ? effects : plain).push(k);
	}
	const byGroupThenLabel = (a: string, b: string) =>
		statGroupOrder(a) - statGroupOrder(b) ||
		(meta[a].label.en ?? a).localeCompare(meta[b].label.en ?? b);
	return { effects: effects.sort(byGroupThenLabel), plain: plain.sort(byGroupThenLabel) };
}

/**
 * `("SA-58 CTC", "7lnj7")` → `sa-58-ctc-7lnj7`.
 *
 * The id suffix is load bearing: names are not unique (392 upstream name keys
 * map to more than one entry) and EXBO renames things between patches, so a
 * name-only slug would collide and would break every inbound link on a rename.
 * With the suffix the URL stays readable for search engines and humans while
 * remaining stable and collision-free.
 *
 * Non-Latin names (ru/ko) strip to nothing, so those fall back to the bare id
 * rather than producing a leading dash.
 */
export function slugify(name: string | undefined, id: string): string {
	const base = (name ?? '')
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60)
		.replace(/-+$/g, '');
	return base ? `${base}-${id}` : id;
}

/** Inverse of `slugify` — the id is always the final dash-separated segment. */
export function idFromSlug(slug: string): string {
	const i = slug.lastIndexOf('-');
	return i === -1 ? slug : slug.slice(i + 1);
}

/**
 * Per-type presentation. Deliberately a flat lookup, not a hierarchy: it says
 * how to *show* a type, never what a type can do.
 */
export interface TypeDescriptor {
	label: string;
	/** widget order, most important first; unlisted widgets follow in default order */
	priority: (keyof Capabilities)[];
}

export const TYPES: Record<EntityType, TypeDescriptor> = {
	item: {
		label: 'Item',
		priority: ['stats', 'effects', 'damage', 'techTree', 'craftTree', 'crafting', 'trading', 'attachments', 'cosmetics']
	},
	mob: { label: 'Mutant', priority: ['model', 'stats', 'text'] },
	location: { label: 'Location', priority: ['text', 'model'] }
};

/**
 * The stats the infobox owns, and which the main column therefore never
 * repeats.
 *
 * The infobox carries identity and the handful of numbers you compare across
 * items; the main column carries everything you read once. Splitting on that
 * line rather than by data type is what keeps the sidebar a fixed 290px.
 *
 * It lives here rather than in the page because the two sides of the split are
 * now two components — the sublayout renders the facts, the overview tab
 * renders the table — and a stat shown in both would be the same number twice
 * on the same screen.
 */
export const INFOBOX_STATS: readonly string[] = [
	'weight',
	'base_price',
	'durability',
	'max_durability',
	'art_durability',
	'art_max_durability'
];

/**
 * One tab of the entity page, in tab order.
 *
 * WHY SUB-PAGES AND NOT ONE SCROLL
 *
 * A rifle has a stat table, a damage chart, a price history, four kinds of
 * recipe, its place on the tech tree and sixty compatible attachments. Stacked
 * in one column that is a page you scroll past rather than read, and it makes
 * every visitor download all of it to look at one part. Split into tabs, each
 * loader ships its own slice and nothing else.
 *
 * `needs` is a capability list, not a type: the tabs an entity gets are decided
 * by what it *has*, the same rule the page itself dispatches on. An empty list
 * means the tab is always there — the overview is the canonical URL and has to
 * stay reachable from the others even when it has little to say.
 */
export interface EntityTab {
	/** path segment under `/entities/[slug]`; `''` is the index */
	segment: string;
	label: string;
	/** inert SVG markup; on a narrow screen it is all the tab shows */
	icon: string;
	/** capabilities that put this tab on the page; any one of them is enough */
	needs: (keyof Capabilities)[];
	/** replaces `label` when the subject's own group changes what the tab shows */
	labelByGroup?: Record<string, string>;
}

export const ENTITY_TABS: readonly EntityTab[] = [
	{ segment: '', label: 'Overview', icon: overviewIcon, needs: [] },
	{ segment: 'auction', label: 'Auction', icon: auctionIcon, needs: ['auction'] },
	/* One tab, and `needs` takes either: a bench and a counter are two ways to
	   end up holding the same item, and a player reading this page is asking
	   the one question — how do I get one. They were split for a while, which
	   made you check two tabs to find out that only one of them had anything.
	   The label is that question rather than "Craft", because crafting is only
	   one of the four answers it gives (bench, trader, assembly, chain) and the
	   narrower word sent people looking elsewhere for the other three. The
	   segment stays `craft` so existing links keep working. */
	{ segment: 'craft', label: 'How to get it', icon: craftIcon, needs: ['crafting', 'trading'] },
	/* Two entries, one slot. An item is on a barter progression or it is made at
	   a bench, never both — so exactly one of these is ever offered, and each can
	   carry the name of the thing it actually shows instead of both hiding behind
	   a vaguer word. */
	{ segment: 'tech-tree', label: 'Tech tree', icon: techTreeIcon, needs: ['techTree'] },
	{ segment: 'craft-tree', label: 'Craft tree', icon: craftTreeIcon, needs: ['craftTree'] },
	/* The label depends on which way round you are reading the relation. The
	   list is symmetric upstream, so a rifle's shows scopes and a scope's shows
	   rifles — and of the 912 entities that have one, 386 are the second kind
	   against 290 of the first. "Attachments" on every page would be wrong more
	   often than right, so the subject's own group names it. */
	{
		segment: 'compatible',
		label: 'Compatible',
		icon: compatibleIcon,
		needs: ['attachments'],
		labelByGroup: { weapon: 'Attachments', attachment: 'Weapons' }
	},
	{ segment: 'cosmetics', label: 'Cosmetics', icon: cosmeticsIcon, needs: ['cosmetics'] },
	/* Last, and a tab rather than a widget on the overview, for one reason: the
	   mesh and its two maps are about 1.6 MB. The whole point of splitting this
	   page was that each loader ships its own slice — putting the heaviest slice
	   on the canonical URL would undo it for every visitor who came for a stat.
	   "Model" and not "Asset": the rest of the bar is named in the player's
	   words, and an asset is something a build pipeline has. */
	{ segment: 'model', label: 'Model', icon: modelIcon, needs: ['model'] }
];

/** Whether this entity's capabilities put that tab on the page. */
const offers = (c: Capabilities, t: EntityTab): boolean =>
	t.needs.length === 0 || t.needs.some((k) => c[k]);

/**
 * The tabs this entity actually has, in order, with each label resolved for the
 * subject's group — see `labelByGroup`.
 */
export function tabsFor(c: Capabilities, group?: string): EntityTab[] {
	return ENTITY_TABS.filter((t) => offers(c, t)).map((t) => {
		const named = group ? t.labelByGroup?.[group] : undefined;
		return named ? { ...t, label: named } : t;
	});
}

/**
 * Does this entity have that tab? `''` — the overview — is always yes, and an
 * unknown segment is always no.
 *
 * Same table as `tabsFor`, so a segment the bar cannot offer is a segment the
 * loader turns away: the two cannot drift apart into a link that 404s or a URL
 * with no way back.
 */
export function hasTab(c: Capabilities, segment: string): boolean {
	const tab = ENTITY_TABS.find((t) => t.segment === segment);
	return tab != null && offers(c, tab);
}

/** The route the entity page and all its tabs live under. */
export const ENTITY_ROUTE = '/entities/[slug]';

/**
 * The tab an entity route id is on — `''` for the overview, `null` when the
 * route is not an entity page at all.
 *
 * The route id and not the pathname: it is already canonical and unencoded, so
 * there is nothing to normalise before comparing.
 */
export function tabSegment(routeId: string | null | undefined): string | null {
	if (!routeId?.startsWith(ENTITY_ROUTE)) return null;
	const rest = routeId.slice(ENTITY_ROUTE.length);
	if (rest === '') return '';
	return rest.startsWith('/') ? rest.slice(1) : null;
}

/** Where a tab of an entity lives: `('ak-74-ak74', 'craft')` → `/entities/ak-74-ak74/craft`. */
export function entityHref(slug: string, segment = ''): string {
	return segment ? `/entities/${slug}/${segment}` : `/entities/${slug}`;
}

/** An item's name in the requested language, falling back to English then id. */
export function entityName(e: { name: Localized; id: string }, lang: string): string {
	return (e.name as Record<string, string>)[lang] ?? e.name.en ?? e.id;
}

export type { Item };
