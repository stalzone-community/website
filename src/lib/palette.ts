/**
 * What this site puts in the command palette.
 *
 * The row model, the ranking and the keyboard rules are `sveltekit-commons/palette`
 * — UAR's palette runs on the same ones. What is left here is the part that is
 * about STALZONE: its destinations, and turning an item index hit into a row.
 *
 * The item index answers "which thing is this"; a palette also has to answer
 * "where do I go". Typing "weap" should offer the Weapons category before it
 * offers the 338 individual weapons, because the category is one keystroke from
 * all of them.
 *
 * Pure and dependency-free apart from commons, so node:test loads it directly —
 * same rule as $lib/items.
 */
import type { PaletteRow } from 'sveltekit-commons/palette';
import type { Hit } from './search.ts';
import { rankSlug } from './items.ts';
import { entityHref, slugify } from './entities.ts';

export type SectionKind = 'group' | 'page';

/** A destination: an item category, or a standing page. */
export interface Section {
	kind: SectionKind;
	/** stable id — the group slug, or the route */
	id: string;
	/** display label, already in the reader's language */
	label: string;
	href: string;
	/** how many entities sit under it, for categories */
	count?: number;
	/** extra words that should match, e.g. the English label for a translated one */
	alias?: string[];
}

/**
 * Destinations as palette rows.
 *
 * The weight is the negated count, which is what `rankRows` needs to make the
 * bigger category win among equally good matches: both "Weapons" (338) and
 * "Weapon modules" (3) prefix-match "weapon", and the first is far likelier to
 * be what was meant. A standing page has no count and so sits at 0, below every
 * category — the same order `rankSections` produced before this moved to
 * commons.
 */
export function sectionRows(sections: Section[]): PaletteRow[] {
	return sections.map((s) => ({
		kind: 'section',
		id: s.id,
		href: s.href,
		label: s.label,
		note: s.count != null ? s.count.toLocaleString('en') : 'Page',
		alias: s.alias ?? [],
		weight: -(s.count ?? 0)
	}));
}

/**
 * Item rows, from `search.rank`.
 *
 * Not passed through `rankRows`: that index has its own shape — an English
 * fallback name for the translated languages — and `rank` already ordered a
 * top-N slice against all 2 311 entries. Re-ranking eight rows would only
 * shuffle what it already chose.
 *
 * The name is tinted by rarity, the way it is everywhere else on the site: the
 * palette is often the last thing a reader sees before an item page, and a
 * legendary that arrives grey there and gold on the page reads as two things.
 *
 * `tab` is the entity tab the reader is searching *from*, and every row keeps
 * it: comparing two rifles' attachments means the palette should land on the
 * next rifle's Attachments, not send you back to its overview to click through
 * again. Empty — the overview, or anywhere else on the site — carries nothing.
 * The index knows names, not capabilities, so a tab the next entity does not
 * have cannot be filtered out here; its loader redirects to the overview
 * instead (see entities/[slug]/+layout.server.ts).
 */
export function itemRows(hits: Hit[], tab = ''): PaletteRow[] {
	return hits.map((h) => ({
		kind: 'item',
		id: h.id,
		href: entityHref(slugify(h.n, h.id), tab),
		label: h.n,
		note: groupLabel(h.c.split('/').at(-1) ?? ''),
		icon: h.icon,
		tint: `var(--rank-${rankSlug(h.r)})`
	}));
}

/** Prettify a group slug for display: `weapon_modules` → `Weapon modules`. */
export function groupLabel(group: string): string {
	const spaced = group.replace(/_/g, ' ');
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
