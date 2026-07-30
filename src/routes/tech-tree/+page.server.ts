import { longestChain } from '$lib/tech-tree';
import { graphFor, techGroups, techItem } from '$lib/server/tech-tree';

/**
 * The overview: one card per group, sampled by its longest line.
 *
 * "Longest" rather than "biggest tree" on purpose — the depth of a line is what
 * the page is promising, and the widest tree is often wide only because one
 * root fans out to eight recolours.
 */
export function load() {
	return {
		groups: techGroups().map((g) => {
			const graph = graphFor(g.group)!;
			return {
				...g,
				tiers: Math.max(...graph.nodes.map((n) => n.depth)) + 1,
				chain: longestChain(graph)
					.map(techItem)
					.filter((i) => i !== null)
			};
		})
	};
}
