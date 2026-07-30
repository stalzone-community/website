import { error } from '@sveltejs/kit';
import { getGroup, groupNames } from '$lib/server/catalogue';
import { slugFor } from '$lib/server/entities';
import { compareItems, facetsOf } from '$lib/items';
import { toListItem } from '$lib/types';
import type { EntryGenerator } from './$types.ts';

/** One prerendered page per top-level category. */
export const entries: EntryGenerator = () => groupNames().map((group) => ({ group }));

export function load({ params }) {
	const rows = getGroup(params.group);
	if (!rows.length) error(404, `No items in category "${params.group}"`);

	return {
		group: params.group,
		// projected, not the full items: this page renders a name and an icon,
		// and the payload is embedded in the prerendered HTML. Sending whole
		// items (variants, compatibility, stats) made this document 2.4 MB.
		items: [...rows]
			.sort((a, b) => compareItems(a, b, 'name', 1, 'en'))
			.map((i) => toListItem(i, slugFor(i.id))),
		facets: facetsOf(rows)
	};
}
