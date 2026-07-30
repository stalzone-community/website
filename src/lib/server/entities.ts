/**
 * Entity lookup for the unified /entities/[slug] page.
 *
 * Today every entity is an item; mobs (from the client's .smm files) and
 * locations (from the PDA map) slot in here later without a new route, because
 * the page dispatches on capabilities rather than type. See $lib/entities.
 *
 * Server-only: reads the in-memory catalogue, never Atlas.
 */
import { boundOnAssembly, hasAssembly } from './assembly.ts';
import { compatibleItems, getItem } from './catalogue.ts';
import { isCraftable } from './craft-tree.ts';
import { hasCrafting, hasTrading } from './recipes.ts';
import { inTechTree } from './tech-tree.ts';
import { modelFor } from './models.ts';
import { hasSkins } from './skins.ts';
import { allSlugs, slugFor } from './slugs.ts';
import { capabilitiesOf, idFromSlug, type Capabilities, type EntityType } from '../entities.ts';
import type { Item } from '../types.ts';

/* Re-exported so callers keep asking one module about entities. The map itself
   lives in ./slugs because the tech tree needs it too — see that file. */
export { allSlugs, slugFor };

/** Paints and camo. The one category that decorates rather than fits. */
const SKINS = 'core.handbook.category.skins';

export interface EntityRef {
	id: string;
	slug: string;
	type: EntityType;
}

export interface ResolvedEntity {
	item: Item;
	type: EntityType;
	slug: string;
	capabilities: Capabilities;
	/** set when the requested slug was not the canonical one, so the page can
	 *  redirect rather than serve the same entity under two URLs */
	canonical: string | null;
}

/**
 * Resolve a slug to an entity. Accepts the canonical slug, a stale slug from
 * before a rename, or the bare id — all three carry the id in the last segment,
 * so an inbound link never 404s just because EXBO renamed something.
 */
export function resolve(slug: string): ResolvedEntity | null {
	const id = idFromSlug(slug);
	const item = getItem(id) ?? getItem(slug);
	if (!item) return null;

	/* The compatibility list is one array upstream, but it answers two different
	   questions — what fits this, and what you can paint it — so it is split here
	   and each half gets its own tab. Only this module can do the split: telling a
	   scope from a camo means resolving every id against the catalogue, and
	   $lib/entities is pure. */
	const compatible = compatibleItems(item);
	const cosmetics = compatible.filter((c) => c.enums.category === SKINS);
	const fittings = compatible.filter((c) => c.enums.category !== SKINS);

	const canonicalSlug = slugFor(item.id);
	return {
		item,
		type: 'item',
		slug: canonicalSlug,
		capabilities: capabilitiesOf({
			stats: item.stats,
			ranges: item.ranges,
			variants: item.variants,
			damage: item.damage,
			fittings,
			// the Cosmetics tab holds both: paints that can be applied to it, and
			// the named skins made for it — see ./skins for why the second kind is
			// not in `compatible`
			cosmetics,
			hasSkins: hasSkins(item.id),
			texts: item.texts,
			// null for the 74 weapons with no extracted mesh and for every
			// non-weapon, so the Model tab appears only where there is one
			model: modelFor(item.id),
			status: item.status,
			// `status` alone says every weapon is auctionable — see ./assembly for
			// why, and for the one signal that contradicts it
			boundOnAssembly: boundOnAssembly(item.id),
			hasAssembly: hasAssembly(item.id),
			hasCrafting: hasCrafting(item.id),
			hasTrading: hasTrading(item.id),
			inTechTree: inTechTree(item.id),
			isCraftable: isCraftable(item.id)
		}),
		canonical: slug === canonicalSlug ? null : canonicalSlug
	};
}
