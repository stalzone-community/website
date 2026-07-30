import { error } from '@sveltejs/kit';
import { layoutTree } from '$lib/tech-tree';
import { rankOrder } from '$lib/items';
import {
	graphFor,
	routeTree,
	settlementLabels,
	techGroups,
	techItem,
	techItems
} from '$lib/server/tech-tree';
import type { EntryGenerator } from './$types.ts';

/** One prerendered page per group with a tree. */
export const entries: EntryGenerator = () => techGroups().map(({ group }) => ({ group }));

export function load({ params }) {
	const graph = graphFor(params.group);
	if (!graph) error(404, `No tech tree for "${params.group}"`);

	const trees = graph.trees.map((_, i) => {
		const layout = layoutTree(graph, i);
		return { layout, ...routeTree(graph, layout) };
	});

	const labels = settlementLabels();

	// Gear sold outright — no trade-in, so no tier and no wires. Best rank
	// first: the whole reason this section exists is that 36 of them are Master
	// and 6 are Legend, including every single-faction suit in the game.
	const outright = graph.outright
		.map((o) => ({ ...techItem(o.id)!, settlements: o.settlements }))
		.filter((o) => o.id)
		.sort(
			(a, b) =>
				rankOrder(b.rank) - rankOrder(a.rank) || (a.name.en ?? '').localeCompare(b.name.en ?? '')
		);

	const settlements: Record<string, string[]> = {};
	for (const n of graph.nodes) settlements[n.id] = n.settlements;
	for (const o of graph.outright) settlements[o.id] = o.settlements;

	return {
		group: params.group,
		trees,
		outright,
		// one lookup for the whole page: a node appears in exactly one tree, so
		// per-tree maps would just be this map split up
		items: techItems(graph.nodes.map((n) => n.id)),
		settlements,
		// only the settlements this group actually trades in — the labels map
		// covers all fourteen, and the legend should not list the empty ones
		labels: Object.fromEntries(
			[...new Set(Object.values(settlements).flat())]
				.filter((k) => labels[k])
				.map((k) => [k, labels[k]])
		),
		counts: {
			items: graph.nodes.length,
			steps: graph.edges.length,
			trees: graph.trees.length,
			outright: outright.length
		}
	};
}
