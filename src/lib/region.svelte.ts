/**
 * Which region's auction the site prices against, persisted to a `sz:region`
 * cookie.
 *
 * A COOKIE, NOT localStorage — AND THAT IS THE WHOLE DESIGN
 *
 * `lang.svelte.ts` can live in localStorage because every language already ships
 * in the page: switching is a client-side redraw of data the visitor has. Region
 * is the opposite. It decides which URL the *server* calls
 * (`/{region}/auction/{item}/lots`), so the choice has to be readable during
 * `load`, before any HTML exists — and localStorage is not.
 *
 * So the cookie is the source of truth, the auction loader reads it per request,
 * and this module is only the browser's half: it renders the current value in
 * the switcher and writes the new one. Changing it calls `invalidateAll()`,
 * because the answer lives on the server and a client-side state change alone
 * would leave the old region's prices on screen.
 *
 * The default is EU only because something has to be, and it is the quietest
 * wrong answer for a European author. RU carries two to four times the listings
 * of EU on the artefacts sampled, so most visitors are better served by changing
 * it — which is the reason this control exists at all rather than the region
 * staying an environment variable nobody outside the deployment can reach.
 */

import { isRegionId, type RegionId } from './regions.ts';

const KEY = 'sz:region';
/** a year: the choice is "where I play", not "what I am looking at today" */
const MAX_AGE = 60 * 60 * 24 * 365;

export const DEFAULT_REGION: RegionId = 'EU';

/** The server has no cookie to read while prerendering, so it renders the default. */
let current = $state<RegionId>(DEFAULT_REGION);

export function region(): RegionId {
	return current;
}

/**
 * Read the cookie into local state.
 *
 * Needed because the shell is prerendered: the HTML for the switcher is built
 * once, at build time, with the default selected. Without this the control would
 * disagree with the prices the server just rendered for whoever changed it.
 */
export function readStoredRegion(): void {
	const match = document.cookie.match(/(?:^|;\s*)sz:region=([^;]*)/);
	const stored = match ? decodeURIComponent(match[1]) : null;
	if (isRegionId(stored)) current = stored;
}

/**
 * Persist and apply. Returns whether anything changed, so the caller can skip a
 * pointless round trip when the visitor re-picks what they already had.
 */
export function setRegion(next: RegionId): boolean {
	if (next === current) return false;
	current = next;
	// Lax, not Strict: the cookie has to survive arriving from an external link,
	// which is how most item pages are reached.
	document.cookie = `${KEY}=${encodeURIComponent(next)};path=/;max-age=${MAX_AGE};samesite=lax`;
	return true;
}
