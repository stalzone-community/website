/**
 * Client-side item search over the per-language index in static/search.
 *
 * Pure apart from the one fetch, and the fetch is separated from the matching
 * so `rank()` can be tested without a network. The index is built by
 * scripts/build-items.ts — see the comment there for why the icon path is
 * derived rather than stored.
 */

import { foldForSearch } from 'sveltekit-commons/text';
import type { Lang, Rank } from './types.ts';

/** One row of the shipped index. Field names are short because there are 2 311. */
export interface SearchEntry {
	id: string;
	/** Name in the index's language. */
	n: string;
	/** English name, on the non-English indexes only, and only when it differs. */
	s?: string;
	/** Full category, e.g. `weapon/assault_rifle`. */
	c: string;
	r: Rank;
	/** Present only for the handful of items that have no icon at all. */
	ni?: 1;
}

export interface Hit extends SearchEntry {
	/** Resolved icon URL, or null where the item has none. */
	icon: string | null;
}

/** Every icon is `/icons/{category}/{id}.png`; build-items.ts asserts it. */
export function iconUrl(e: SearchEntry): string | null {
	return e.ni ? null : `/icons/${e.c}/${e.id}.png`;
}

/**
 * Match and order. A prefix match beats a match in the middle of a name — a
 * player typing "ak" wants the AK first, not the twelve items whose names
 * happen to contain those letters — and shorter names win among equals,
 * because "AK-74" is a likelier target than "AK-74 Barrel Assembly #3".
 *
 * `limit` is small on purpose: the list is a keyboard target, not a results
 * page, and the item pages exist for browsing.
 */
export function rank(entries: SearchEntry[], query: string, limit = 10): Hit[] {
	const needle = foldForSearch(query.trim());
	if (!needle) return [];

	const scored: { e: SearchEntry; score: number }[] = [];
	for (const e of entries) {
		const name = foldForSearch(e.n);
		let score = -1;
		if (name.startsWith(needle)) score = 0;
		else if (name.includes(needle)) score = 1;
		else if (e.s) {
			// the English fallback, so a French player can still find "RPL-20"
			const en = foldForSearch(e.s);
			if (en.startsWith(needle)) score = 2;
			else if (en.includes(needle)) score = 3;
		}
		if (score >= 0) scored.push({ e, score });
	}

	scored.sort((a, b) => a.score - b.score || a.e.n.length - b.e.n.length);
	return scored.slice(0, limit).map(({ e }) => ({ ...e, icon: iconUrl(e) }));
}

/** One in-flight or settled fetch per language, so a fast typist gets one. */
const loaded = new Map<Lang, Promise<SearchEntry[]>>();

export function loadIndex(lang: Lang, fetcher: typeof fetch = fetch): Promise<SearchEntry[]> {
	let p = loaded.get(lang);
	if (!p) {
		p = fetcher(`/search/${lang}.json`)
			.then((r) => {
				if (!r.ok) throw new Error(`search index ${lang}: ${r.status}`);
				return r.json() as Promise<SearchEntry[]>;
			})
			.catch((err) => {
				// a failed load must not poison the cache — the next keystroke retries
				loaded.delete(lang);
				throw err;
			});
		loaded.set(lang, p);
	}
	return p;
}
