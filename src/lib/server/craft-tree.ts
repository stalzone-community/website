/**
 * Craft graphs, built on demand from the in-memory recipe table.
 *
 * Unlike the tech tree these are NOT built eagerly: there is one graph per
 * craftable item (337 of them), each a rooted walk, and only the page that
 * asks for one needs it. The index below is the part worth doing once.
 *
 * Server-only, and never a database read, for the same reason as the rest of
 * the catalogue — every craft page is prerendered.
 */
import { corridorGaps, routeGrid, type GridBox, type GridEdge } from 'grid-router';
import { getItem } from './catalogue.ts';
import { hideout } from './recipes.ts';
import { slugFor } from './slugs.ts';
import { buildCraftGraph, layoutCraft, type CraftGraph, type CraftRecipe } from '../craft-tree.ts';
import type { Localized, Rank } from '../types.ts';

const recipes: (CraftRecipe & { perks: Record<string, number> })[] = hideout.map((h) => ({
	bench: h.bench,
	result: h.result,
	ingredients: h.ingredients,
	perks: h.perks
}));

/** item id → the recipes that yield it, by index. */
const producedBy = new Map<string, number[]>();
recipes.forEach((r, i) => {
	for (const out of r.result) {
		const bucket = producedBy.get(out.item);
		if (bucket) bucket.push(i);
		else producedBy.set(out.item, [i]);
	}
});

export function isCraftable(id: string): boolean {
	return producedBy.has(id);
}

/** Every craftable item, for the prerender entry generator. */
export function craftableIds(): string[] {
	return [...producedBy.keys()].filter((id) => getItem(id)).sort();
}

export function craftGraph(root: string): CraftGraph | null {
	if (!producedBy.has(root)) return null;
	return buildCraftGraph(root, recipes, producedBy);
}

/** The bench a recipe is made at, and what it yields — the join card's content. */
/* `perks` rides along so a join card can wear its profession's mark: the tree
   is read at a glance and a tinted glyph says "the chain moves to the stove
   here" without anyone reading a bench name at 9px. */
export function recipeAt(index: number) {
	const r = recipes[Number(index)];
	return r && { bench: r.bench, result: r.result, ingredients: r.ingredients, perks: r.perks };
}

export interface CraftItem {
	id: string;
	slug: string;
	name: Localized;
	icon: string | null;
	rank: Rank;
	/** true when nothing crafts it — you gather or buy it */
	base: boolean;
}

export interface CraftSummary extends CraftItem {
	/** benches it can be made at — 24 items have more than one recipe */
	benches: string[];
	/** how many columns its graph runs to, i.e. how involved it is */
	tiers: number;
	/** distinct things you end up gathering for it */
	materials: number;
}

/**
 * Every craftable item with the shape of its graph — the index page's rows.
 *
 * This builds all 337 graphs, which sounds heavy and is not: the whole sweep is
 * about 150ms, it runs once at build time because the page is prerendered, and
 * the alternative is an index that can only say "craftable" without saying how
 * hard, which is the one thing worth sorting on.
 */
export function craftSummaries(): CraftSummary[] {
	const rows: CraftSummary[] = [];
	for (const id of craftableIds()) {
		const item = craftItems([id])[id];
		if (!item) continue;
		const graph = craftGraph(id)!;
		rows.push({
			...item,
			benches: [...new Set((producedBy.get(id) ?? []).map((i) => recipes[i].bench))].sort(),
			tiers: graph.tiers,
			materials: graph.materials.length
		});
	}
	return rows;
}

export function craftItems(ids: Iterable<string>): Record<string, CraftItem> {
	const out: Record<string, CraftItem> = {};
	for (const id of ids) {
		const item = getItem(id);
		if (!item) continue;
		out[id] = {
			id,
			slug: slugFor(id),
			name: item.name,
			icon: item.icon,
			rank: item.rank,
			base: !producedBy.has(id)
		};
	}
	return out;
}

/* ---------------------------------------------------------------------------
 * Drawing one craft graph.
 *
 * Two pages render this: /craft/[slug], the standalone diagram with its
 * materials list, and the entity page's own craft-tree tab. The geometry, the
 * routing and the failure mode belong to neither of them, so they live here and
 * both call `layoutCraftPage`. Duplicating it was the alternative, and a
 * routing pitch that drifts between two copies is a class of bug that shows up
 * as tangled wires on half the pages.
 * ------------------------------------------------------------------------- */

/**
 * Card geometry.
 *
 * The two node kinds are deliberately different widths. A craft graph runs to
 * 25 columns — far deeper than any tech tree — and half of those columns are
 * recipe joins, which carry a bench name and nothing else. Giving them the
 * item width would add roughly 1 800px of empty card to the widest page.
 *
 * Row and side gaps come from grid-router's `corridorGaps`, the same contract
 * the tech tree honours: the router can only use free cells, and the layout is
 * what decides how many exist.
 */
const RES = 6;
const gaps = corridorGaps(RES);
const ITEM_W = 200;
const JOIN_W = 64;
const CARD_H = 58;
const ROW = CARD_H + gaps.rowGap;
const COL_GAP = Math.max(gaps.chipGap, 56);
const PAD = Math.max(gaps.sidePad, 16);

/** Everything a page needs to draw one craft graph. Null when nothing crafts it. */
export function layoutCraftPage(id: string) {
	const graph = craftGraph(id);
	if (!graph) return null;

	const layout = layoutCraft(graph);
	const kind = new Map(graph.nodes.map((n) => [n.id, n.kind]));

	// A column holds one kind or the other, never both — the graph is bipartite
	// and every path alternates — so the column's width is its kind's width.
	const isItemColumn: boolean[] = [];
	for (const n of layout.nodes) if (kind.get(n.id) === 'item') isItemColumn[n.column] = true;

	/* Laid out from the deepest column to column 0, so the finished item is on
	   the LEFT and the chain runs outward from it to the raw materials on the
	   right. Depth still puts the root in the last column — this only mirrors
	   where that column is drawn.

	   Mirrored here rather than after routing, because the wires are routed
	   against these boxes: flipping the geometry afterwards would leave every
	   path pointing at where its target used to be. Arrowheads need no thought
	   either, since `marker-end` is the target end whichever way the path
	   runs. */
	const colW = (c: number) => (isItemColumn[c] ? ITEM_W : JOIN_W);
	const x: number[] = [];
	let cursor = PAD;
	for (let c = layout.columns - 1; c >= 0; c--) {
		x[c] = cursor;
		cursor += colW(c) + COL_GAP;
	}
	const width = cursor - COL_GAP + PAD;
	const height = PAD * 2 + (layout.rows - 1) * ROW + CARD_H;

	const placed = layout.nodes.map((n) => {
		const w = isItemColumn[n.column] ? ITEM_W : JOIN_W;
		return { id: n.id, x: x[n.column], y: PAD + n.row * ROW, w, h: CARD_H };
	});

	const boxes = new Map<string, GridBox>(
		placed.map((p) => [
			p.id,
			{ l: p.x, r: p.x + p.w, t: p.y, b: p.y + p.h, cx: p.x + p.w / 2, cy: p.y + p.h / 2 }
		])
	);

	// Default buses (grouped by source). Keying them by target was tried and is
	// worse than useless: grid-router merges on `(source, bus)`, so a bus named
	// after the target never merges anything, and the un-merged runs cost 32
	// lane-sharing violations across these graphs. Plain per-source buses route
	// all 337 clean.
	const edges: GridEdge[] = graph.edges.map((e, i) => ({
		id: `e${i}`,
		source: e.from,
		target: e.to
	}));

	const routed = routeGrid(boxes, edges, width, height, { res: RES });
	if (routed.violations) {
		throw new Error(
			`craft graph for "${id}": ${routed.violations} routing violations — ` +
				'the pitch above no longer satisfies corridorGaps()'
		);
	}

	const byId = new Map(graph.nodes.map((n) => [n.id, n]));
	const nodes = placed.map((p) => {
		const n = byId.get(p.id)!;
		return { ...p, kind: n.kind, ref: n.ref, amount: n.amount, base: n.base };
	});

	const itemIds = graph.nodes.filter((n) => n.kind === 'item').map((n) => n.ref);
	const recipes = Object.fromEntries(
		graph.nodes
			.filter((n) => n.kind === 'recipe')
			.map((n) => [n.ref, recipeAt(Number(n.ref))])
			.filter(([, r]) => r)
	);

	return {
		root: id,
		slug: slugFor(id),
		nodes,
		conns: routed.conns.map((c) => ({ id: c.id, source: c.source, target: c.target, d: c.d })),
		width,
		height,
		items: craftItems([...new Set([...itemIds, ...graph.materials.map((m) => m.item)])]),
		recipes,
		materials: graph.materials,
		tiers: graph.tiers,
		skipped: graph.skipped,
		cut: graph.cut
	};
}
