import { error } from '@sveltejs/kit';
import { compatibleItems, enumLabels } from '$lib/server/catalogue';
import { resolve, slugFor } from '$lib/server/entities';
import { skinsFor } from '$lib/server/skins';
import { rankOrder } from '$lib/items';
import type { Localized, Rank } from '$lib/types';

/**
 * The paints and camo this entity can wear.
 *
 * Split out of the compatibility tab because it is a different question and it
 * was drowning the answer to the other one: of the LR-300's 269 compatible
 * items, 128 are paints. They were a folded block at the bottom of that page,
 * which is a tab in all but name — so it is one.
 *
 * Upstream's own category, not a guess: `core.handbook.category.skins`, which
 * is the same key the Cosmetics label comes from in all five languages.
 *
 * Two sections, because there are two kinds of thing here:
 *
 *   skins   the named ones made for this weapon alone — "Pastoral" is the FN
 *           SCAR SSR's and nothing else's. These carry no compatibility link;
 *           the relation is in the i18n key, see $lib/server/skins.
 *   paints  the universal camo anything can wear, which upstream does link
 *
 * Skins lead: a one-of-a-kind finish for this gun is the more interesting half,
 * and there are at most a handful against a hundred-odd paints.
 */
const SKINS = 'core.handbook.category.skins';

export function load({ params }) {
	const found = resolve(params.slug);
	if (!found) error(404, `Unknown entity "${params.slug}"`);
	if (!found.capabilities.cosmetics) error(404, 'Nothing decorates this item');

	const paints = compatibleItems(found.item)
		.filter((i) => i.enums.category === SKINS)
		.map((i) => ({
			id: i.id,
			slug: slugFor(i.id),
			name: i.name as Localized,
			icon: i.icon,
			rank: i.rank as Rank
		}))
		// best first, same order as every other list on the entity page
		.sort(
			(a, b) =>
				rankOrder(b.rank) - rankOrder(a.rank) || (a.name.en ?? '').localeCompare(b.name.en ?? '')
		);

	const skins = skinsFor(found.item.id)
		.map((i) => ({
			id: i.id,
			slug: slugFor(i.id),
			name: i.name as Localized,
			icon: i.icon,
			rank: i.rank as Rank,
			// "Weapon motif" / "Weapon Style" — upstream's own words, and the two
			// really are different things in game, so the badge keeps them apart
			kind: enumLabels[i.enums.category] ?? { en: '' }
		}))
		.sort(
			(a, b) =>
				rankOrder(b.rank) - rankOrder(a.rank) || (a.name.en ?? '').localeCompare(b.name.en ?? '')
		);

	return {
		skins,
		paints,
		// "Paints", not upstream's "Cosmetics": the tab already carries that word,
		// and a section heading repeating its own tab reads as a stutter. en/fr/es
		// are ours; ru and ko fall back to English, as any missing key does.
		paintsLabel: {
			en: 'Paints and camo',
			fr: 'Peintures et camouflages',
			es: 'Pinturas y camuflajes'
		},
		skinsLabel: { en: 'Skins', fr: 'Apparences', es: 'Aspectos' }
	};
}
