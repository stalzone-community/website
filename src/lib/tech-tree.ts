/**
 * The gear tech tree — which piece of equipment barters into which.
 *
 * WHERE THIS COMES FROM
 *
 * The game shows an upgrade branch in the gear tooltip, and it is not a
 * separate data file: it falls out of `barter_recipes.json`. A trader offer
 * that *demands* a weapon and *hands over* a weapon is a step along the tree —
 * "AKS-74 + parts → AK-74M". Nothing has to be scraped from the client; the
 * Apache-2.0 database already carries every edge.
 *
 * WHY "SAME GROUP" IS THE RULE
 *
 * Of the 10 845 barter edges, only same-group ones are progression. The rest
 * are the materials you pay with — `other → weapon` (3 160 of them) is scrap
 * and blueprints, not an upgrade path. Restricting to `group(in) === group(out)`
 * leaves 316 edges over 328 items, which is the tree.
 *
 * `other` is excluded even though it has 65 same-group edges: they are
 * `Battle Token → Dusky growths Paint`, one currency fanning out to a rack of
 * cosmetics. A currency node is a star, not a tree, and it says nothing about
 * progression — see TECH_GROUPS.
 *
 * TWO-WAY TRADES
 *
 * Six edges close a cycle: Samson ⇄ Trump Exoarmor, the three Assault NVG
 * recolours, Reaper ⇄ Uranus. Those are genuine — you can trade back — so they
 * are side-grades at one tier rather than data errors. Condensing each strongly
 * connected component to a single tier handles them without deleting an edge,
 * which is why depth is computed over the condensation rather than by dropping
 * whichever back-edge a DFS happened to find last.
 *
 * Pure and dependency-free so node:test can load it, same rule as $lib/items
 * and $lib/entities. The data is passed in.
 */

import { layoutLayers, type TreeLayout } from './layered-layout.ts';
export type { PlacedNode, TreeLayout } from './layered-layout.ts';

/**
 * The item groups that form a progression. A domain fact, not a filter: these
 * are the things you wear and carry, and they are the only groups whose
 * same-group barter edges describe an upgrade rather than a purchase.
 */
export const TECH_GROUPS = ['weapon', 'armor', 'attachment', 'backpacks', 'containers'] as const;

export type TechGroup = (typeof TECH_GROUPS)[number];

export function isTechGroup(group: string): group is TechGroup {
	return (TECH_GROUPS as readonly string[]).includes(group);
}

/** A barter offer, reduced to what the graph reads. */
export interface TechOffer {
	item: string;
	requiredItems: { item: string }[];
	/** where the offer is made — the key, not the label. Drives the faction
	 *  split; see $lib/factions. */
	settlement?: string;
}

export interface TechEdge {
	from: string;
	to: string;
	/** the reverse trade exists too, so the pair are alternatives at one tier
	 *  rather than a step up */
	sidegrade: boolean;
	/** settlements where *this step* can be made */
	settlements: string[];
}

export interface TechNode {
	id: string;
	/** longest path from a root — the column this sits in */
	depth: number;
	/** index into `TechGraph.trees` */
	tree: number;
	/** mutual-trade cluster; unique per node unless it side-grades with another */
	cluster: number;
	parents: string[];
	children: string[];
	/** every settlement that hands this item over, however it is paid for —
	 *  wider than the union of the incoming edges, because an item can also be
	 *  bought outright for materials */
	settlements: string[];
}

/** Gear that is sold but sits on no tree — see `TechGraph.outright`. */
export interface OutrightItem {
	id: string;
	settlements: string[];
}

export interface TechGraph {
	group: string;
	nodes: TechNode[];
	edges: TechEdge[];
	/** node ids per connected tree, biggest first */
	trees: string[][];
	/**
	 * Gear of this group that a trader sells but that no barter upgrades into
	 * or out of — you pay materials and rubles, you do not trade a suit in.
	 *
	 * These are NOT tree nodes and must not be forced into one: a node with no
	 * edges has no tier, and 113 single-card "trees" would bury the real ones.
	 * They are still the point of the page, though — 36 of them are Master rank
	 * and 6 are Legend, including every faction-exclusive suit in the game
	 * (Apostle at Covenant, Chieftain at Rise, Granite and Vanguard at
	 * Frontier). A tech tree that omits the best armour in the game because it
	 * happens to be bought rather than upgraded is answering the wrong
	 * question, so they ship alongside the trees.
	 */
	outright: OutrightItem[];
}

/**
 * Tarjan's SCC. Two items that trade both ways land in one component;
 * everything else is a component of one.
 *
 * Recursive because the largest graph here is 139 nodes — the recursion is
 * bounded by the longest simple path, which no equipment line comes close to.
 */
function clusters(ids: string[], children: Map<string, string[]>): Map<string, number> {
	const index = new Map<string, number>();
	const low = new Map<string, number>();
	const onStack = new Set<string>();
	const stack: string[] = [];
	const of = new Map<string, number>();
	let next = 0;
	let found = 0;

	const visit = (v: string) => {
		index.set(v, next);
		low.set(v, next);
		next++;
		stack.push(v);
		onStack.add(v);

		for (const w of children.get(v) ?? []) {
			if (!index.has(w)) {
				visit(w);
				low.set(v, Math.min(low.get(v)!, low.get(w)!));
			} else if (onStack.has(w)) {
				low.set(v, Math.min(low.get(v)!, index.get(w)!));
			}
		}

		if (low.get(v) === index.get(v)) {
			for (;;) {
				const w = stack.pop()!;
				onStack.delete(w);
				of.set(w, found);
				if (w === v) break;
			}
			found++;
		}
	};

	for (const id of ids) if (!index.has(id)) visit(id);
	return of;
}

/**
 * Longest-path depth over the cluster condensation: a node sits one column
 * right of its deepest parent, and mutual-trade partners share a column.
 *
 * Longest rather than shortest path because a tree renders wrong otherwise —
 * when an item is reachable both directly and through two intermediate tiers,
 * the direct edge is a shortcut, and drawing the item next to its shortcut
 * parent would put a late-game suit in the second column.
 */
function depths(edges: TechEdge[], cluster: Map<string, number>): Map<number, number> {
	const ids = new Set(cluster.values());
	const next = new Map<number, Set<number>>();
	const waiting = new Map<number, number>();
	for (const c of ids) {
		next.set(c, new Set());
		waiting.set(c, 0);
	}
	for (const e of edges) {
		const a = cluster.get(e.from)!;
		const b = cluster.get(e.to)!;
		if (a === b || next.get(a)!.has(b)) continue;
		next.get(a)!.add(b);
		waiting.set(b, waiting.get(b)! + 1);
	}

	const depth = new Map<number, number>();
	const queue = [...ids].filter((c) => waiting.get(c) === 0).sort((a, b) => a - b);
	for (const c of queue) depth.set(c, 0);

	for (let head = 0; head < queue.length; head++) {
		const c = queue[head];
		for (const d of next.get(c)!) {
			depth.set(d, Math.max(depth.get(d) ?? 0, depth.get(c)! + 1));
			waiting.set(d, waiting.get(d)! - 1);
			if (waiting.get(d) === 0) queue.push(d);
		}
	}
	return depth;
}

/** Connected trees, ignoring edge direction, biggest first. */
function connected(ids: string[], edges: TechEdge[]): string[][] {
	const near = new Map<string, string[]>(ids.map((id) => [id, []]));
	for (const e of edges) {
		near.get(e.from)!.push(e.to);
		near.get(e.to)!.push(e.from);
	}

	const seen = new Set<string>();
	const trees: string[][] = [];
	for (const id of ids) {
		if (seen.has(id)) continue;
		const tree: string[] = [];
		const stack = [id];
		while (stack.length) {
			const x = stack.pop()!;
			if (seen.has(x)) continue;
			seen.add(x);
			tree.push(x);
			stack.push(...near.get(x)!);
		}
		trees.push(tree.sort());
	}
	// size first, then the smallest id, so the order never depends on which
	// node the sweep happened to start from
	return trees.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

/**
 * Build one group's tech tree from the barter table.
 *
 * `groupOf` returns undefined for an id the realm does not carry, which drops
 * the edge — the same rule build-recipes.ts applies when a recipe names a
 * missing item.
 */
export function buildTechGraph(
	offers: TechOffer[],
	groupOf: (id: string) => string | undefined,
	group: string
): TechGraph {
	const pairs = new Map<string, Set<string>>();
	const soldAt = new Map<string, Set<string>>();
	const note = (map: Map<string, Set<string>>, key: string, settlement?: string) => {
		const at = map.get(key) ?? map.set(key, new Set()).get(key)!;
		if (settlement) at.add(settlement);
	};

	for (const offer of offers) {
		if (groupOf(offer.item) !== group) continue;
		// recorded even when the offer yields no edge: an item bought outright
		// for materials is still sold there, and the card says where it is sold
		note(soldAt, offer.item, offer.settlement);
		for (const required of offer.requiredItems) {
			if (groupOf(required.item) !== group) continue;
			// a self-loop is a repair or a re-roll, not a step
			if (required.item === offer.item) continue;
			note(pairs, `${required.item} ${offer.item}`, offer.settlement);
		}
	}

	const edges: TechEdge[] = [...pairs.keys()].sort().map((p) => {
		const [from, to] = p.split(' ');
		return { from, to, sidegrade: false, settlements: [...pairs.get(p)!].sort() };
	});

	const ids = [...new Set(edges.flatMap((e) => [e.from, e.to]))].sort();
	const children = new Map<string, string[]>(ids.map((id) => [id, []]));
	const parents = new Map<string, string[]>(ids.map((id) => [id, []]));
	for (const e of edges) {
		children.get(e.from)!.push(e.to);
		parents.get(e.to)!.push(e.from);
	}

	const cluster = clusters(ids, children);
	for (const e of edges) e.sidegrade = cluster.get(e.from) === cluster.get(e.to);

	const depth = depths(edges, cluster);
	const trees = connected(ids, edges);
	const treeOf = new Map<string, number>();
	trees.forEach((tree, i) => tree.forEach((id) => treeOf.set(id, i)));

	const onTree = new Set(ids);
	const outright: OutrightItem[] = [...soldAt.keys()]
		.filter((id) => !onTree.has(id))
		.sort()
		.map((id) => ({ id, settlements: [...soldAt.get(id)!].sort() }));

	const nodes: TechNode[] = ids.map((id) => ({
		id,
		depth: depth.get(cluster.get(id)!) ?? 0,
		tree: treeOf.get(id)!,
		cluster: cluster.get(id)!,
		parents: parents.get(id)!.sort(),
		children: children.get(id)!.sort(),
		settlements: [...(soldAt.get(id) ?? [])].sort()
	}));

	return { group, nodes, edges, trees, outright };
}

/**
 * The longest unbroken run of upgrades in the graph — a group's headline line,
 * and what the overview page shows as its sample.
 *
 * Walks back from the deepest node, taking the deepest parent each time — but
 * over clusters, not nodes. Uranus Jumpsuit's only parent is Reaper Jumpsuit,
 * its own mutual-trade partner at the same tier; stepping there is not a step
 * up, and refusing to step there at all dead-ends the walk. The way out is the
 * cluster's parents, which is where Reaper's own parent is found. Getting this
 * wrong reports the eight-tier armor line as two items.
 */
export function longestChain(graph: TechGraph): string[] {
	if (!graph.nodes.length) return [];
	const byId = new Map(graph.nodes.map((n) => [n.id, n]));

	const cluster = new Map<number, TechNode[]>();
	for (const n of graph.nodes) {
		const bucket = cluster.get(n.cluster);
		if (bucket) bucket.push(n);
		else cluster.set(n.cluster, [n]);
	}

	// ties break on id so adding an item in a patch cannot silently reshuffle
	// which line the page leads with
	const deeper = (a: TechNode, b: TechNode) =>
		b.depth > a.depth || (b.depth === a.depth && b.id < a.id) ? b : a;

	const deepest = graph.nodes.reduce(deeper);
	const chain = [deepest.id];

	for (let n = deepest; ; ) {
		const up = cluster
			.get(n.cluster)!
			.flatMap((m) => m.parents)
			.map((p) => byId.get(p)!)
			.filter((p) => p.depth < n.depth)
			.reduce<TechNode | null>((a, b) => (a ? deeper(a, b) : b), null);
		if (!up) break;
		chain.unshift(up.id);
		n = up;
	}
	return chain;
}

/**
 * Place one tree on the grid. The crossing reduction itself lives in
 * $lib/layered-layout, which the craft graph uses too — this only names which
 * subset to lay out.
 */
export function layoutTree(graph: TechGraph, tree: number): TreeLayout {
	return layoutLayers(graph.nodes, graph.trees[tree] ?? []);
}

/**
 * One item's immediate place in the tree — what it comes from and what it leads
 * to. This is what an entity page shows; the whole tree is a page of its own.
 */
export interface TechPlace {
	tree: number;
	depth: number;
	parents: string[];
	children: string[];
	sidegrades: string[];
}

export function placeOf(graph: TechGraph, id: string): TechPlace | null {
	const node = graph.nodes.find((n) => n.id === id);
	if (!node) return null;

	// a side-grade is listed both ways round, so it would otherwise show up as
	// both a parent and a child of the same item
	const sidegrades = new Set(
		graph.edges.filter((e) => e.sidegrade && (e.from === id || e.to === id)).flatMap((e) => [e.from, e.to])
	);
	sidegrades.delete(id);

	return {
		tree: node.tree,
		depth: node.depth,
		parents: node.parents.filter((p) => !sidegrades.has(p)),
		children: node.children.filter((c) => !sidegrades.has(c)),
		sidegrades: [...sidegrades].sort()
	};
}
