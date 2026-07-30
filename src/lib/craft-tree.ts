/**
 * The craft graph — what a hideout recipe turns into what.
 *
 * WHY THIS IS NOT THE TECH TREE
 *
 * Both come out of the same recipes file, and they still need separate models,
 * for two reasons the data is emphatic about:
 *
 *  1. CRAFTING IS MANY-TO-ONE. 339 of the 368 hideout recipes take between two
 *     and five ingredients (one takes eight). An `ingredient → result` edge
 *     silently drops "all of these together, in these amounts", which is the
 *     entire content of a recipe. Barter did not have this problem: you trade
 *     one item in, and the rest is materials. So a recipe is a NODE here, and
 *     the graph is bipartite — items feed a join, the join yields items.
 *
 *  2. IT IS ONE ECONOMY, NOT MANY LINES. As a flat item graph the whole thing
 *     is a single connected component of 422 nodes, 13 tiers deep, containing a
 *     24-item cycle (Ethylene ⇄ Iodine Solution ⇄ Caustic Sodium ⇄ …). There is
 *     no "the craft tree" to draw. There is only "how do I make X", which is
 *     why every graph here is ROOTED at one item.
 *
 * WHY IT IS DEDUPLICATED
 *
 * Expanded as a true tree — one node per occurrence — a rooted craft graph has
 * a median of 4 026 nodes and a maximum of 81 615. That is the combinatorial
 * blow-up of a deep bill of materials, and it is not renderable. Collapsing
 * each distinct item to one node, so shared materials converge instead of
 * repeating, gives a median of 69 nodes and a maximum of 144 — the same order
 * as the gear trees, which top out at 40. Converging edges are also the honest
 * picture: iron really is the same iron, used in four places.
 *
 * CYCLES
 *
 * The base-material economy converts things into each other, so a naive walk
 * never terminates. Expansion refuses any recipe that needs an item already on
 * the path from the root — you cannot craft a thing out of itself — which
 * bounds the walk without deleting a recipe from the data.
 *
 * Pure and dependency-free, same rule as $lib/items and $lib/entities.
 */
import { layoutLayers, type LayoutNode, type TreeLayout } from './layered-layout.ts';
export type { PlacedNode, TreeLayout } from './layered-layout.ts';

/** A hideout recipe, reduced to what the graph reads. */
export interface CraftRecipe {
	bench: string;
	result: { item: string; amount: number }[];
	ingredients: { item: string; amount: number }[];
}

export type CraftKind = 'item' | 'recipe';

export interface CraftNode extends LayoutNode {
	kind: CraftKind;
	/** item id for an item node; the recipe's index for a join */
	ref: string;
	/** how many the parent recipe asks for; 0 on joins and on the root */
	amount: number;
	/** nothing makes this — a base material you gather or buy */
	base: boolean;
}

export interface CraftEdge {
	from: string;
	to: string;
}

export interface CraftGraph {
	/** the item the whole graph is rooted at */
	root: string;
	nodes: CraftNode[];
	edges: CraftEdge[];
	/** deepest column, i.e. how many crafting steps down it goes */
	tiers: number;
	/** base materials and how many of each one unit of the root needs */
	materials: { item: string; amount: number }[];
	/** recipes refused because they need something already above them */
	skipped: number;
	/** links cut because two merged paths formed a circular conversion */
	cut: number;
}

const itemId = (id: string) => `i:${id}`;
const recipeId = (index: number) => `r:${index}`;

/**
 * Build the rooted craft graph for one item.
 *
 * `recipes` is the whole hideout table; `producedBy` maps an item to the
 * indexes of the recipes that yield it. Both are passed in so this stays pure
 * and so the server can index once at boot rather than per page.
 */
export function buildCraftGraph(
	root: string,
	recipes: CraftRecipe[],
	producedBy: Map<string, number[]>
): CraftGraph {
	const nodes = new Map<string, CraftNode>();
	const edges = new Set<string>();
	let skipped = 0;
	let cut = 0;

	const item = (id: string, amount: number): CraftNode => {
		const key = itemId(id);
		const found = nodes.get(key);
		if (found) {
			// the same material reached twice: keep the larger requirement, which
			// is the one that governs whether you have enough
			found.amount = Math.max(found.amount, amount);
			return found;
		}
		const made: CraftNode = {
			id: key,
			kind: 'item',
			ref: id,
			amount,
			base: !(producedBy.get(id) ?? []).length,
			depth: 0,
			cluster: nodes.size,
			parents: [],
			children: []
		};
		nodes.set(key, made);
		return made;
	};

	const link = (from: string, to: string) => {
		const key = `${from} ${to}`;
		if (edges.has(key)) return;
		edges.add(key);
		nodes.get(from)!.children.push(to);
		nodes.get(to)!.parents.push(from);
	};

	/** Walk from the target down into what it is made of. */
	const expand = (id: string, path: Set<string>) => {
		for (const index of producedBy.get(id) ?? []) {
			const recipe = recipes[index];
			// a recipe that needs something already above it would loop forever
			if (recipe.ingredients.some((x) => path.has(x.item))) {
				skipped++;
				continue;
			}
			const key = recipeId(index);
			const fresh = !nodes.has(key);
			if (fresh) {
				nodes.set(key, {
					id: key,
					kind: 'recipe',
					ref: String(index),
					amount: 0,
					base: false,
					depth: 0,
					cluster: nodes.size,
					parents: [],
					children: []
				});
			}
			link(key, itemId(id));
			if (!fresh) continue;

			for (const ing of recipe.ingredients) {
				const child = item(ing.item, ing.amount);
				link(child.id, key);
				if (!path.has(ing.item)) expand(ing.item, new Set([...path, ing.item]));
			}
		}
	};

	item(root, 1);
	expand(root, new Set([root]));

	const list = [...nodes.values()];

	/*
	 * The per-path guard above is not enough on its own.
	 *
	 * It refuses a recipe needing something already ABOVE IT ON ONE PATH, which
	 * is what stops the walk recursing forever. But nodes are deduplicated, so
	 * two acyclic paths can merge into a cycle that neither of them contained —
	 * the base-material economy really does convert Ethylene into Iodine
	 * Solution and back. Left in, those edges make the longest-path pass below
	 * unrunnable: Kahn never reaches a node inside a loop, every one of them
	 * keeps depth 0, and the root lands in the first column instead of the last.
	 *
	 * So the merged graph is condensed and the edges inside a loop are cut.
	 * A two-way conversion is not a step toward making anything, which is why it
	 * can go. Counted separately from `skipped`: that one is "this recipe is not
	 * a way of making the thing", this one is "these two convert into each
	 * other", and a page that calls both "recipes left out" is lying about one.
	 */
	const cluster = stronglyConnected(list);
	const kept = [...edges]
		.map((e) => {
			const [from, to] = e.split(' ');
			return { from, to };
		})
		.filter((e) => {
			if (cluster.get(e.from) !== cluster.get(e.to)) return true;
			cut++;
			return false;
		});

	for (const n of list) {
		n.parents = [];
		n.children = [];
	}
	for (const e of kept) {
		nodes.get(e.from)!.children.push(e.to);
		nodes.get(e.to)!.parents.push(e.from);
	}

	/*
	 * Cutting a loop can strand a branch: a node whose only route down to the
	 * root ran through a cut edge is still in the map, still has its own long
	 * chain behind it, and now leads nowhere. Drawn, it is a second diagram
	 * floating beside the answer — and it lands deeper than the root, because
	 * its chain no longer has to pass through it. So anything that cannot still
	 * reach the root goes.
	 */
	const reaches = new Set<string>();
	const back = [itemId(root)];
	while (back.length) {
		const id = back.pop()!;
		if (reaches.has(id)) continue;
		reaches.add(id);
		back.push(...nodes.get(id)!.parents);
	}

	const live = list.filter((n) => reaches.has(n.id));
	for (const n of live) {
		n.parents = n.parents.filter((p) => reaches.has(p));
		n.children = n.children.filter((c) => reaches.has(c));
	}
	const liveEdges = kept.filter((e) => reaches.has(e.from) && reaches.has(e.to));

	// Depth is the longest path from a base material, so the root always ends up
	// in the last column and nothing sits to the right of what it is made from.
	const depth = longestPaths(live);
	for (const n of live) n.depth = depth.get(n.id)!;

	return {
		root,
		nodes: live,
		edges: liveEdges,
		tiers: Math.max(...live.map((n) => n.depth)) + 1,
		materials: rollUp(live),
		skipped,
		cut
	};
}

/** Tarjan. Anything that converts back into itself lands in one component. */
function stronglyConnected(nodes: CraftNode[]): Map<string, number> {
	const by = new Map(nodes.map((n) => [n.id, n]));
	const index = new Map<string, number>();
	const low = new Map<string, number>();
	const onStack = new Set<string>();
	const stack: string[] = [];
	const of = new Map<string, number>();
	let next = 0;
	let found = 0;

	// iterative: a craft graph runs to 159 nodes but its longest path is long
	// enough that recursion is not worth the risk
	for (const start of nodes) {
		if (index.has(start.id)) continue;
		const work: { id: string; i: number }[] = [{ id: start.id, i: 0 }];
		index.set(start.id, next);
		low.set(start.id, next);
		next++;
		stack.push(start.id);
		onStack.add(start.id);

		while (work.length) {
			const frame = work[work.length - 1];
			const children = by.get(frame.id)!.children;
			if (frame.i < children.length) {
				const child = children[frame.i++];
				if (!index.has(child)) {
					index.set(child, next);
					low.set(child, next);
					next++;
					stack.push(child);
					onStack.add(child);
					work.push({ id: child, i: 0 });
				} else if (onStack.has(child)) {
					low.set(frame.id, Math.min(low.get(frame.id)!, index.get(child)!));
				}
				continue;
			}
			work.pop();
			if (work.length) {
				const parent = work[work.length - 1].id;
				low.set(parent, Math.min(low.get(parent)!, low.get(frame.id)!));
			}
			if (low.get(frame.id) === index.get(frame.id)) {
				for (;;) {
					const w = stack.pop()!;
					onStack.delete(w);
					of.set(w, found);
					if (w === frame.id) break;
				}
				found++;
			}
		}
	}
	return of;
}

/** Longest path from any source — Kahn over a graph already known acyclic. */
function longestPaths(nodes: CraftNode[]): Map<string, number> {
	const by = new Map(nodes.map((n) => [n.id, n]));
	const waiting = new Map(nodes.map((n) => [n.id, n.parents.length]));
	const depth = new Map(nodes.map((n) => [n.id, 0]));
	const queue = nodes.filter((n) => !n.parents.length).map((n) => n.id);

	for (let head = 0; head < queue.length; head++) {
		const id = queue[head];
		for (const child of by.get(id)!.children) {
			depth.set(child, Math.max(depth.get(child)!, depth.get(id)! + 1));
			const left = waiting.get(child)! - 1;
			waiting.set(child, left);
			if (left === 0) queue.push(child);
		}
	}
	return depth;
}

/**
 * The base materials the whole graph bottoms out in.
 *
 * Deliberately NOT a multiplied bill of materials. Amounts here would have to
 * be multiplied down every path and then summed, and the deduplicated graph has
 * lost how many times each path is taken — the honest number needs the true
 * tree this module refuses to build. So this answers "what do I end up
 * gathering", which is a real question, and leaves "how many" to the per-recipe
 * amounts shown on each edge.
 */
function rollUp(nodes: CraftNode[]): { item: string; amount: number }[] {
	return nodes
		.filter((n) => n.kind === 'item' && n.base)
		.map((n) => ({ item: n.ref, amount: n.amount }))
		.sort((a, b) => b.amount - a.amount || a.item.localeCompare(b.item));
}

/** Lay the graph out; every node is connected to the root by construction. */
export function layoutCraft(graph: CraftGraph): TreeLayout {
	return layoutLayers(
		graph.nodes,
		graph.nodes.map((n) => n.id)
	);
}
