/**
 * The tech tree, built once at boot.
 *
 * Five graphs over 328 items — the whole thing is ~20 KB of objects and takes
 * a single pass over the 1 946 barter offers already in memory, so it is built
 * eagerly rather than cached per request. Nothing here touches Atlas, for the
 * same reason $lib/server/catalogue.ts does not: every tech-tree page is
 * prerendered, and a database read would put the build on the throttled path.
 *
 * The graph itself is in $lib/tech-tree, which is pure and tested; this module
 * only supplies the data and the item lookups.
 */
import { routeGrid, type GridBox, type GridEdge } from 'grid-router';
import { getItem } from './catalogue.ts';
import { barter } from './recipes.ts';
import { slugFor } from './slugs.ts';
import {
	buildTechGraph,
	layoutTree,
	placeOf,
	TECH_GROUPS,
	type TechGraph,
	type TechPlace,
	type TreeLayout
} from '../tech-tree.ts';
import { CARD_H, CARD_W, RES, canvasSize, cardLeft, cardTop } from '../tech-geometry.ts';
import type { Localized, Rank } from '../types.ts';

const groupOf = (id: string): string | undefined => getItem(id)?.group;

/** `settlement.id.covenant.title` → `covenant`, the key $lib/factions uses. */
const settlementKey = (i18n: string): string => i18n.split('.')[2] ?? i18n;

const offers = barter.map((b) => ({
	item: b.item,
	requiredItems: b.requiredItems,
	settlement: settlementKey(b.settlement)
}));

const graphs = new Map<string, TechGraph>(
	TECH_GROUPS.map((group) => [group, buildTechGraph(offers, groupOf, group)])
);

/** settlement key → its localised name, taken from the data rather than
 *  hardcoded: upstream ships all five languages on every barter row. */
const settlementNames = new Map<string, Localized>();
for (const b of barter) settlementNames.set(settlementKey(b.settlement), b.settlementName);

export function settlementLabels(): Record<string, Localized> {
	return Object.fromEntries(settlementNames);
}

/** id → the group whose tree contains it, for the O(1) check an entity page needs. */
const groupById = new Map<string, string>();
for (const [group, graph] of graphs) for (const n of graph.nodes) groupById.set(n.id, group);

export function graphFor(group: string): TechGraph | undefined {
	return graphs.get(group);
}

/** True when the item appears anywhere in a tree — drives the `techTree`
 *  capability, so it must not allocate. */
export function inTechTree(id: string): boolean {
	return groupById.has(id);
}

export function groupOfNode(id: string): string | undefined {
	return groupById.get(id);
}

/** Every group with a tree, biggest first — the overview page and the nav. */
export function techGroups(): { group: string; items: number; trees: number; steps: number }[] {
	return [...graphs.values()]
		.map((g) => ({
			group: g.group,
			items: g.nodes.length,
			trees: g.trees.length,
			steps: g.edges.length
		}))
		.sort((a, b) => b.items - a.items);
}

/**
 * The card a tree renders for one node. Resolved here rather than shipped as
 * raw ids so the component stays a renderer, and projected down to five fields
 * because a tree page draws 139 of these and a full `Item` carries 15 upgrade
 * variants each.
 */
export interface TechItem {
	id: string;
	slug: string;
	name: Localized;
	icon: string | null;
	rank: Rank;
	kind: string;
}

export function techItem(id: string): TechItem | null {
	const item = getItem(id);
	if (!item) return null;
	return {
		id,
		slug: slugFor(id),
		name: item.name,
		icon: item.icon,
		rank: item.rank,
		kind: item.kind
	};
}

export function techItems(ids: Iterable<string>): Record<string, TechItem> {
	const out: Record<string, TechItem> = {};
	for (const id of ids) {
		const row = techItem(id);
		if (row) out[id] = row;
	}
	return out;
}

/** id → the settlements that hand each item over, for the ids given. */
export function nodeSettlements(ids: Iterable<string>): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	for (const id of ids) {
		const group = groupById.get(id);
		const node = group && graphs.get(group)!.nodes.find((n) => n.id === id);
		if (node) out[id] = node.settlements;
	}
	return out;
}

/** An item's immediate neighbours in its tree, or null when it is not on one. */
export function placeFor(id: string): (TechPlace & { group: string }) | null {
	const group = groupById.get(id);
	if (!group) return null;
	const place = placeOf(graphs.get(group)!, id);
	return place && { ...place, group };
}

/* ---------------------------------------------------------------------------
 * Drawing a tree.
 *
 * Two pages render this: /tech-tree/[group], which draws every tree in a group,
 * and the entity page's own tech-tree tab, which draws the one tree its item
 * sits on. The geometry, the routing and the failure mode belong to neither, so
 * they live here and both call in — the same arrangement `layoutCraftPage` has
 * in $lib/server/craft-tree, and for the same reason: a routing pitch that
 * drifts between two copies shows up as tangled wires on half the pages.
 * ------------------------------------------------------------------------- */

/**
 * Route one tree's wires with grid-router.
 *
 * At BUILD time, not in the browser. grid-router ships a Svelte canvas that
 * measures itself, but these pages are prerendered static documents: the card
 * positions are a pure function of data that only changes on a game patch, so
 * routing here means the wires are baked into the HTML, render with JavaScript
 * off, and cost a visitor nothing. Routing all 316 edges across all five groups
 * takes ~30ms, which is noise in a build that prerenders 2 311 item pages.
 *
 * Every forward step shares one bus, so a fan-out leaves its parent as a single
 * trunk that branches — the org-chart shape, and the shape a tech tree is
 * expected to have. Side-grades get a bus each: they are the only wires that
 * route backwards into the left gutter, and merging them with the forward
 * trunk would drag it there too.
 */
export function routeTree(graph: TechGraph, layout: TreeLayout) {
	const inTree = new Set(layout.nodes.map((n) => n.id));

	const boxes = new Map<string, GridBox>();
	for (const n of layout.nodes) {
		const l = cardLeft(n.column, layout.columns);
		const t = cardTop(n.row);
		boxes.set(n.id, {
			l,
			r: l + CARD_W,
			t,
			b: t + CARD_H,
			cx: l + CARD_W / 2,
			cy: t + CARD_H / 2
		});
	}

	const edges: GridEdge[] = graph.edges
		.filter((e) => inTree.has(e.from) && inTree.has(e.to))
		.map((e) => ({
			id: `${e.from}-${e.to}`,
			source: e.from,
			target: e.to,
			bus: e.sidegrade ? `side:${e.from}` : 'up'
		}));

	const { width, height } = canvasSize(layout.columns, layout.rows);
	const routed = routeGrid(boxes, edges, width, height, { res: RES });

	// A violation means the layout did not leave the router enough corridor, and
	// the page would render overlapping wires. That is a build-time fact, so it
	// fails the build rather than shipping — see $lib/tech-geometry.
	if (routed.violations) {
		throw new Error(
			`tech tree: ${routed.violations} routing violations on a ${layout.columns}×${layout.rows} tree — ` +
				'the pitch in $lib/tech-geometry no longer satisfies corridorGaps()'
		);
	}

	const settlementsOf = new Map(graph.edges.map((e) => [`${e.from}-${e.to}`, e.settlements]));
	const sidegrades = new Set(graph.edges.filter((e) => e.sidegrade).map((e) => `${e.from}-${e.to}`));

	return {
		width,
		height,
		conns: routed.conns.map((c) => ({
			id: c.id,
			source: c.source,
			target: c.target,
			d: c.d,
			sidegrade: sidegrades.has(c.id),
			settlements: settlementsOf.get(c.id) ?? []
		}))
	};
}

/**
 * The one tree an item sits on, drawn — everything the entity tab needs.
 *
 * The group page draws all of a group's trees; an item belongs to exactly one,
 * so this finds that one and routes it alone. A weapon's line is a handful of
 * cards where its group's page is a wall of them, and the reader came here
 * about the weapon.
 *
 * Null when the item is on no tree at all, which is most of the catalogue.
 */
export function treeAround(id: string) {
	const group = groupById.get(id);
	if (!group) return null;
	const graph = graphs.get(group)!;
	const index = graph.trees.findIndex((t) => t.includes(id));
	if (index < 0) return null;

	const layout = layoutTree(graph, index);
	const ids = layout.nodes.map((n) => n.id);
	const labels = settlementLabels();

	const settlements: Record<string, string[]> = {};
	for (const n of graph.nodes) if (ids.includes(n.id)) settlements[n.id] = n.settlements;

	return {
		group,
		layout,
		...routeTree(graph, layout),
		items: techItems(ids),
		settlements,
		// only the settlements this tree actually trades in — the labels map covers
		// all fourteen, and a legend should not list the empty ones
		labels: Object.fromEntries(
			[...new Set(Object.values(settlements).flat())].filter((k) => labels[k]).map((k) => [k, labels[k]])
		),
		counts: { items: ids.length, steps: layout.nodes.length }
	};
}
