/**
 * Fetching the calculator payloads.
 *
 * Separated from the maths for the same reason `search.ts` splits `loadIndex`
 * from `rank`: everything else under `$lib/calc` is pure and testable without a
 * network, and this is the one part that is not.
 *
 * Gear loads when the builder opens; weapons only when that tab is. One
 * in-flight promise per language per payload, so switching tabs twice does not
 * fetch twice, and a failure clears the entry rather than caching itself.
 */
import type { Lang } from '../types.ts';
import type { GearIndex, WeaponIndex } from './types.ts';

const gear = new Map<Lang, Promise<GearIndex>>();
const weapons = new Map<Lang, Promise<WeaponIndex>>();

function load<T>(
	cache: Map<Lang, Promise<T>>,
	kind: string,
	lang: Lang,
	fetcher: typeof fetch
): Promise<T> {
	let p = cache.get(lang);
	if (!p) {
		p = fetcher(`/calc/${kind}.${lang}.json`)
			.then((r) => {
				if (!r.ok) throw new Error(`${kind} index ${lang}: ${r.status}`);
				return r.json() as Promise<T>;
			})
			.catch((err) => {
				cache.delete(lang);
				throw err;
			});
		cache.set(lang, p);
	}
	return p;
}

export function loadGear(lang: Lang, fetcher: typeof fetch = fetch): Promise<GearIndex> {
	return load(gear, 'gear', lang, fetcher);
}

export function loadWeapons(lang: Lang, fetcher: typeof fetch = fetch): Promise<WeaponIndex> {
	return load(weapons, 'weapon', lang, fetcher);
}
