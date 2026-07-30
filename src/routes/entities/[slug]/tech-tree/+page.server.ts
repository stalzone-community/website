import { error } from '@sveltejs/kit';
import { resolve } from '$lib/server/entities';
import { treeAround } from '$lib/server/tech-tree';

/**
 * The barter progression this entity sits on, drawn.
 *
 * The whole tree, routed by grid-router exactly as `/tech-tree/[group]` draws
 * it — same layout, same wires, same cards — rather than the three columns of
 * immediate neighbours this tab used to show. An upgrade path is a shape, and
 * neighbours tell you a step where the shape tells you the line you are
 * standing in.
 *
 * One tree, not the group's. An item belongs to exactly one, and a weapon's
 * line is a handful of cards where the weapon group's page is a wall of 139 —
 * the reader came here about this weapon. The group page is one click away for
 * the rest.
 */
export function load({ params }) {
	const found = resolve(params.slug);
	if (!found) error(404, `Unknown entity "${params.slug}"`);

	const tree = treeAround(found.item.id);
	if (!tree) error(404, 'This item is not on a tech tree');

	// the card the reader arrived from, so the tree can mark it
	return { techTree: { ...tree, focus: found.item.id } };
}
