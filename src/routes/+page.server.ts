/**
 * The overview page.
 *
 * This is the first route on the site whose *front page* needs a server. The
 * catalogue half of it is still build-time — the categories and their counts —
 * but the Steam chart and the published builds are generated from what happened
 * in the last few minutes, so the page as a whole opts out of the global
 * prerender in +layout.ts.
 *
 * Every live read here is optional and independently so. Steam being
 * unreachable, the database being unconfigured (it is, in a fresh checkout) and
 * both at once all render a page — a shorter one. Nothing on the front door of
 * an item database is worth a 500.
 */
import { getGroup, groupNames } from '$lib/server/catalogue';
import { dbConfigured } from '$lib/server/db';
import { listPublic } from '$lib/server/builds';
import { steamActivity, type SteamActivity } from '$lib/server/steam';
import type { PublishedBuild } from '$lib/calc/publish';

export const prerender = false;

/** Builds listed by the community widget. */
const BUILDS = 5;

export const load = async () => {
	// The two live reads run together and neither can sink the other: a rejected
	// promise here would take the whole page down for a third-party outage.
	const [activity, builds] = await Promise.all([
		steamActivity().catch(() => null) as Promise<SteamActivity | null>,
		dbConfigured()
			? listPublic({ sort: 'top', limit: BUILDS }).catch(() => [] as PublishedBuild[])
			: Promise.resolve([] as PublishedBuild[])
	]);

	return {
		// one icon per category, borrowed from the first item in it that has one
		// — the same trick the sidebar uses, so the two agree
		groups: groupNames().map((name) => {
			const rows = getGroup(name);
			return { name, count: rows.length, icon: rows.find((i) => i.icon)?.icon ?? null };
		}),
		activity,
		builds
	};
};
