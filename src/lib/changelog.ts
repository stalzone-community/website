/**
 * This site's changelog vocabulary.
 *
 * The parser, the markdown subset and the sort are `sveltekit-commons/changelog`
 * — UAR's changelog runs on the same ones. What is left here is the part that is
 * about STALZONE: what kinds of change it files, and which parts of the site
 * they land in.
 *
 * Both lists are ORDERED and the order is the display order, so putting
 * `feature` first is what puts features at the top of a release.
 *
 * Pure and dependency-free apart from commons, so node:test loads it directly —
 * same rule as $lib/items — and so `scripts/release.ts` can import it under
 * plain node without Vite.
 */
import type { ChangelogRelease, ChangelogSchema } from 'sveltekit-commons/changelog';

export const CHANGELOG_SCHEMA = {
	types: ['feature', 'improvement', 'fix', 'data'],
	areas: ['database', 'market', 'tools', 'site']
} as const satisfies ChangelogSchema;

export type EntryType = (typeof CHANGELOG_SCHEMA.types)[number];
export type EntryArea = (typeof CHANGELOG_SCHEMA.areas)[number];
export type Release = ChangelogRelease<EntryType, EntryArea>;

/**
 * What each area means, for the entry footer on /changelog — the labels are for
 * readers, who have no reason to know that "market" is one route tree.
 *
 * - database  items, entities, the tech tree, crafting — everything built from
 *             the vendored EXBO database
 * - market    the auction tracker and emissions, i.e. anything live from the API
 * - tools     the build calculator, search, the command palette
 * - site      chrome, theme, languages, performance
 */
export const AREA_LABELS: Record<EntryArea, string> = {
	database: 'Database',
	market: 'Market & emissions',
	tools: 'Tools',
	site: 'Site'
};
