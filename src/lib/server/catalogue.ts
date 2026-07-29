/**
 * The item catalogue, held in memory.
 *
 * Server-only, and deliberately NOT a database read. 2 311 items is ~7 MB of
 * JSON loaded once at boot; every query after that is a plain array filter,
 * sub-millisecond, with no round trip and nothing to cache. Reading this from
 * Atlas instead would put the catalogue on the free cluster's byte-throttled
 * read path on every page view — the exact failure UAR's db.ts is built to
 * work around. Mongo is for the data that mutates (auction, emissions,
 * accounts); see $lib/server/db.ts.
 *
 * The import is static so the bundler resolves it at build time and the file
 * ships inside the image.
 */
import raw from '../data/items.json' with { type: 'json' };
import type { Item, ItemDatabase, Lang, StatMeta } from '../types.ts';
import { facetsOf, matchesFilter, type ItemFilter } from '../items.ts';

const database = raw as unknown as ItemDatabase;

export const items: Item[] = database.items;
export const stats: Record<string, StatMeta> = database.stats;
export const enumLabels = database.enumLabels;
export const source = database.source;
export const realm = database.realm;

const byId = new Map(items.map((i) => [i.id, i]));

/** Items grouped by top-level category, in the site's display order. */
const groups = new Map<string, Item[]>();
for (const i of items) {
	const bucket = groups.get(i.group);
	if (bucket) bucket.push(i);
	else groups.set(i.group, [i]);
}

export function getItem(id: string): Item | undefined {
	return byId.get(id);
}

export function getGroup(group: string): Item[] {
	return groups.get(group) ?? [];
}

export function groupNames(): string[] {
	return [...groups.keys()].sort((a, b) => groups.get(b)!.length - groups.get(a)!.length);
}

export function query(filter: ItemFilter, lang: Lang = 'en'): Item[] {
	return items.filter((i) => matchesFilter(i, filter, lang));
}

export const facets = facetsOf(items);

/** Resolve an enum stat's i18n key to a label, e.g. the ammo type of a weapon. */
export function enumLabel(key: string, lang: Lang): string {
	return enumLabels[key]?.[lang] ?? enumLabels[key]?.en ?? key;
}

/**
 * The compatibility list, resolved to items. Upstream records this one way
 * (attachments name their weapons); the build mirrors it, so this answers in
 * both directions.
 */
export function compatibleItems(item: Item): Item[] {
	return item.compatible.map((id) => byId.get(id)).filter((i): i is Item => Boolean(i));
}
