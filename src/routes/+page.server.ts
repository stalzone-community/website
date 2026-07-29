import { groupNames, getGroup, items, source, realm } from '$lib/server/catalogue';

export function load() {
	return {
		realm,
		source,
		total: items.length,
		groups: groupNames().map((g) => ({ name: g, count: getGroup(g).length }))
	};
}
