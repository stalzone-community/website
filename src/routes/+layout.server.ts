import { getGroup, groupNames } from '$lib/server/catalogue';

/**
 * The sidebar's group list. Prerendered with everything else, so this runs at
 * build time and costs a page view nothing.
 *
 * One icon per group, borrowed from the first item in it that has one — the
 * rail is icons only when collapsed, and a row of identical glyphs would say
 * nothing about which group is which.
 */
export function load() {
	return {
		groups: groupNames().map((name) => {
			const rows = getGroup(name);
			return {
				name,
				count: rows.length,
				icon: rows.find((i) => i.icon)?.icon ?? null
			};
		})
	};
}
