import { groupNames, getGroup } from '$lib/server/catalogue';

export function load() {
	return {
		groups: groupNames().map((g) => {
			const rows = getGroup(g);
			return {
				name: g,
				count: rows.length,
				// a few icons as a visual sample of the group
				sample: rows.filter((i) => i.icon).slice(0, 6).map((i) => ({ id: i.id, icon: i.icon }))
			};
		})
	};
}
