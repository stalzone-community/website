/**
 * Layered graph layout — column by depth, row by crossing reduction.
 *
 * Shared by the two graphs on this site, which look nothing alike but lay out
 * identically: the gear tech tree (items barter into items) and the craft graph
 * (ingredients and recipe joins feed a result). Both are layered DAGs whose
 * depth is already computed by the time they get here, and both would otherwise
 * carry their own copy of the barycentre sweep — the part that is fiddly and
 * worth having exactly once.
 *
 * The caller supplies structure only. It knows nothing about items, recipes,
 * ranks or benches, which is why it can serve both.
 *
 * Pure and dependency-free, same rule as $lib/items and $lib/entities.
 */

/** The minimum a node must carry to be laid out. */
export interface LayoutNode {
	id: string;
	/** column; the caller decides what depth means */
	depth: number;
	/**
	 * Nodes that must not be separated within a column. Give every node its own
	 * value when there is nothing to group — the tech tree uses it to keep
	 * mutual-trade partners adjacent so their connector stays short.
	 */
	cluster: number;
	parents: string[];
	children: string[];
}

export interface PlacedNode {
	id: string;
	column: number;
	/** fractional — whole columns slide to line a chain up, see below */
	row: number;
}

export interface TreeLayout {
	nodes: PlacedNode[];
	/** number of columns */
	columns: number;
	/** highest row plus one, i.e. the span to size the canvas from */
	rows: number;
}

const SWEEPS = 4;

/**
 * Place a connected set of nodes on a grid.
 *
 * Two passes, in the order that matters:
 *
 *  1. Barycentre sweeps — the standard layered heuristic. Each column is
 *     re-sorted by where its neighbours in the adjacent column already sit,
 *     alternating direction, which is what stops edges crossing.
 *  2. A column slide — every column moves as a block to where its parents are.
 *     Without it a straight chain stair-steps down the page, because dense
 *     packing puts every column's single node at row 0..n in isolation. Moving
 *     a whole column preserves the order inside it, so nothing can collide.
 *
 * `ids` is the subset to place; nodes outside it are ignored even when a node
 * inside names them as a parent or child.
 */
export function layoutLayers(all: LayoutNode[], ids: string[]): TreeLayout {
	const inside = new Set(ids);
	const node = new Map(all.filter((n) => inside.has(n.id)).map((n) => [n.id, n]));

	if (!ids.length) return { nodes: [], columns: 0, rows: 0 };

	// Depth-first from the roots gives siblings adjacent rows before any
	// sweeping, which is a much better starting order than sorting by id.
	const order = new Map<string, number>();
	const walk = (id: string) => {
		if (order.has(id)) return;
		order.set(id, order.size);
		for (const child of node.get(id)!.children) if (inside.has(child)) walk(child);
	};
	for (const id of ids) if (!node.get(id)!.parents.some((p) => inside.has(p))) walk(id);
	// a set that is nothing but a cycle has no root
	for (const id of ids) walk(id);

	const columns: string[][] = [];
	for (const id of ids) (columns[node.get(id)!.depth] ??= []).push(id);
	// a caller whose depths are sparse would otherwise leave holes in the array
	for (let c = 0; c < columns.length; c++) columns[c] ??= [];
	for (const column of columns) column.sort((a, b) => order.get(a)! - order.get(b)!);

	const row = new Map<string, number>();
	const reindex = () => columns.forEach((c) => c.forEach((id, i) => row.set(id, i)));
	reindex();

	const barycentre = (id: string, side: 'parents' | 'children') => {
		const near = node.get(id)![side].filter((x) => inside.has(x));
		if (!near.length) return row.get(id)!;
		return near.reduce((sum, x) => sum + (row.get(x) ?? 0), 0) / near.length;
	};

	for (let sweep = 0; sweep < SWEEPS; sweep++) {
		const down = sweep % 2 === 0;
		const side = down ? 'parents' : 'children';
		const seq = columns.map((_, i) => i);
		for (const c of down ? seq : seq.reverse()) {
			// a cluster shares one key so a sweep never splits it across the column
			const key = new Map<string, number>();
			const byCluster = new Map<number, string[]>();
			for (const id of columns[c]) {
				const k = node.get(id)!.cluster;
				(byCluster.get(k) ?? byCluster.set(k, []).get(k)!).push(id);
			}
			for (const members of byCluster.values()) {
				const mean = members.reduce((s, id) => s + barycentre(id, side), 0) / members.length;
				for (const id of members) key.set(id, mean);
			}
			columns[c] = [...columns[c]].sort(
				(a, b) => key.get(a)! - key.get(b)! || row.get(a)! - row.get(b)!
			);
			reindex();
		}
	}

	const slide = new Array(columns.length).fill(0);
	for (let c = 1; c < columns.length; c++) {
		const deltas = columns[c].flatMap((id) => {
			const near = node.get(id)!.parents.filter((p) => inside.has(p));
			if (!near.length) return [];
			const at = near.reduce((s, p) => s + row.get(p)! + slide[node.get(p)!.depth], 0) / near.length;
			return [at - row.get(id)!];
		});
		slide[c] = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
	}

	const placed: PlacedNode[] = columns.flatMap((column, c) =>
		column.map((id) => ({ id, column: c, row: row.get(id)! + slide[c] }))
	);
	const top = Math.min(...placed.map((p) => p.row));
	for (const p of placed) p.row -= top;

	return {
		nodes: placed,
		columns: columns.length,
		rows: Math.max(...placed.map((p) => p.row)) + 1
	};
}
