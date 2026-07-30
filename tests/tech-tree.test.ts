/**
 * Tech-tree graph and layout (node:test, `npm test`).
 *
 * The graph is pure and takes its data as an argument, so every case here is a
 * hand-written barter table — no catalogue, no JSON, no Vite.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	buildTechGraph,
	isTechGroup,
	layoutTree,
	longestChain,
	placeOf,
	TECH_GROUPS,
	type TechOffer
} from '../src/lib/tech-tree.ts';

/** `buy` is handed over in exchange for `pay` — the shape of one barter offer. */
const offer = (buy: string, ...pay: string[]): TechOffer => ({
	item: buy,
	requiredItems: pay.map((item) => ({ item }))
});

/** The same, made at a named settlement. */
const at = (settlement: string, buy: string, ...pay: string[]): TechOffer => ({
	...offer(buy, ...pay),
	settlement
});

/** Everything is a weapon unless the id says otherwise: `mat:` is a material. */
const groups = (id: string) => (id.startsWith('mat:') ? 'other' : 'weapon');

const build = (offers: TechOffer[]) => buildTechGraph(offers, groups, 'weapon');

const node = (g: ReturnType<typeof build>, id: string) => g.nodes.find((n) => n.id === id)!;

test('an offer that demands and hands over the same group is a step', () => {
	const g = build([offer('b', 'a', 'mat:scrap')]);
	assert.deepEqual(
		g.edges.map((e) => [e.from, e.to]),
		[['a', 'b']]
	);
	assert.equal(node(g, 'a').depth, 0);
	assert.equal(node(g, 'b').depth, 1);
});

test('materials are not steps', () => {
	// the real shape of most offers: pay in scrap, get a weapon
	const g = build([offer('b', 'mat:scrap', 'mat:parts')]);
	assert.deepEqual(g.edges, []);
	assert.deepEqual(g.nodes, []);
});

test('the same step offered by several traders is one edge', () => {
	const g = build([offer('b', 'a'), offer('b', 'a', 'mat:scrap'), offer('b', 'a')]);
	assert.equal(g.edges.length, 1);
});

test('a self-loop is a repair, not a step', () => {
	const g = build([offer('a', 'a', 'mat:scrap')]);
	assert.deepEqual(g.edges, []);
});

test('depth is the longest path, so a shortcut does not pull an item forward', () => {
	// a → b → c → d, plus a direct a → d
	const g = build([offer('b', 'a'), offer('c', 'b'), offer('d', 'c'), offer('d', 'a')]);
	assert.equal(node(g, 'd').depth, 3, 'd sits past c, not next to its shortcut parent');
});

test('a two-way trade is a side-grade at one tier', () => {
	const g = build([offer('b', 'a'), offer('c', 'b'), offer('b', 'c')]);

	assert.equal(node(g, 'b').depth, node(g, 'c').depth, 'mutual partners share a column');
	assert.equal(node(g, 'b').cluster, node(g, 'c').cluster);

	const sides = g.edges.filter((e) => e.sidegrade).map((e) => [e.from, e.to].sort().join(''));
	assert.deepEqual(new Set(sides), new Set(['bc']));
	assert.equal(g.edges.filter((e) => !e.sidegrade).length, 1, 'a → b survives as a real step');
});

test('a cycle does not stall the depth pass', () => {
	// three items that trade round in a ring, reachable from a root
	const g = build([offer('b', 'a'), offer('c', 'b'), offer('d', 'c'), offer('b', 'd')]);
	assert.equal(g.nodes.length, 4);
	for (const n of g.nodes) assert.equal(Number.isFinite(n.depth), true);
	assert.equal(node(g, 'b').depth, node(g, 'd').depth);
});

test('unconnected lines are separate trees, biggest first', () => {
	const g = build([offer('b', 'a'), offer('c', 'b'), offer('z', 'y')]);
	assert.deepEqual(g.trees, [['a', 'b', 'c'], ['y', 'z']]);
	assert.equal(node(g, 'y').tree, 1);
});

test('an item the realm does not carry drops out of the graph', () => {
	const g = buildTechGraph([offer('b', 'a')], (id) => (id === 'a' ? undefined : 'weapon'), 'weapon');
	assert.deepEqual(g.edges, []);
});

test('the build is deterministic regardless of offer order', () => {
	const rows = [offer('b', 'a'), offer('c', 'b'), offer('d', 'b'), offer('e', 'c')];
	const forward = JSON.stringify(build(rows));
	const backward = JSON.stringify(build([...rows].reverse()));
	assert.equal(forward, backward);
});

test('layout puts a chain in one straight row', () => {
	const g = build([offer('b', 'a'), offer('c', 'b'), offer('d', 'c')]);
	const l = layoutTree(g, 0);

	assert.equal(l.columns, 4);
	assert.deepEqual(
		l.nodes.map((n) => n.column).sort(),
		[0, 1, 2, 3]
	);
	const rows = new Set(l.nodes.map((n) => n.row));
	assert.equal(rows.size, 1, 'a straight line must not stair-step');
});

test('layout keeps siblings apart and never overlaps a column', () => {
	const g = build([offer('b', 'a'), offer('c', 'a'), offer('d', 'a')]);
	const l = layoutTree(g, 0);

	const byColumn = new Map<number, number[]>();
	for (const n of l.nodes) (byColumn.get(n.column) ?? byColumn.set(n.column, []).get(n.column)!).push(n.row);
	for (const [, rows] of byColumn) {
		assert.equal(new Set(rows).size, rows.length, 'two cards would be drawn on top of each other');
	}
	assert.equal(byColumn.get(1)!.length, 3);
});

test('layout is normalised to the origin', () => {
	const g = build([offer('b', 'a'), offer('c', 'a'), offer('d', 'c'), offer('e', 'd')]);
	const l = layoutTree(g, 0);
	assert.equal(Math.min(...l.nodes.map((n) => n.row)), 0);
	assert.equal(Math.min(...l.nodes.map((n) => n.column)), 0);
	assert.equal(l.rows, Math.max(...l.nodes.map((n) => n.row)) + 1);
});

test('layout places a tree that is nothing but a cycle', () => {
	// no root to walk from — the fallback pass has to pick it up
	const g = build([offer('b', 'a'), offer('a', 'b')]);
	const l = layoutTree(g, 0);
	assert.equal(l.nodes.length, 2);
});

test('longestChain follows the deepest line', () => {
	// a → b → c → d, and a short spur off a
	const g = build([offer('b', 'a'), offer('c', 'b'), offer('d', 'c'), offer('spur', 'a')]);
	assert.deepEqual(longestChain(g), ['a', 'b', 'c', 'd']);
});

test('longestChain walks past a side-grade instead of stopping on it', () => {
	// a → b → c, with c ⇄ d a mutual trade and d → e continuing the line.
	// d's deepest parent is c, its own side-grade partner at the same tier —
	// taking it would end the walk at ['d', 'e'] and report a five-tier line
	// as two, which is what the armor tree did.
	const g = build([offer('b', 'a'), offer('c', 'b'), offer('d', 'c'), offer('c', 'd'), offer('e', 'd')]);

	const chain = longestChain(g);
	assert.equal(chain[0], 'a', 'the walk must reach the root');
	assert.equal(chain.length, Math.max(...g.nodes.map((n) => n.depth)) + 1);
	// consecutive links must each be a real step up
	const depth = new Map(g.nodes.map((n) => [n.id, n.depth]));
	for (let i = 1; i < chain.length; i++) {
		assert.equal(depth.get(chain[i])! > depth.get(chain[i - 1])!, true);
	}
});

test('longestChain is empty for an empty graph', () => {
	assert.deepEqual(longestChain(build([])), []);
});

test('placeOf splits a side-grade out of the parents and children', () => {
	const g = build([offer('b', 'a'), offer('c', 'b'), offer('b', 'c'), offer('d', 'b')]);
	const place = placeOf(g, 'b')!;

	assert.deepEqual(place.parents, ['a']);
	assert.deepEqual(place.children, ['d']);
	assert.deepEqual(place.sidegrades, ['c'], 'c is neither above nor below b');
});

test('placeOf answers null off the tree', () => {
	assert.equal(placeOf(build([offer('b', 'a')]), 'zzz'), null);
});

test('a node records every settlement that hands it over', () => {
	const g = build([at('duty', 'b', 'a'), at('freedom', 'b', 'a'), at('merc', 'c', 'b')]);
	assert.deepEqual(node(g, 'b').settlements, ['duty', 'freedom']);
	assert.deepEqual(node(g, 'c').settlements, ['merc']);
	assert.deepEqual(node(g, 'a').settlements, [], 'a is only ever paid with, never sold');
});

test('an item bought for materials alone still records where it is sold', () => {
	// the offer yields no edge — the payment is not gear — but the card still
	// has to say the item is available there
	const g = build([at('duty', 'b', 'a'), at('covenant', 'b', 'mat:scrap')]);
	assert.deepEqual(node(g, 'b').settlements, ['covenant', 'duty']);
});

test('a step records the settlements offering that step, not its endpoints', () => {
	const g = build([at('covenant', 'b', 'a'), at('merc', 'b', 'a'), at('duty', 'c', 'b')]);
	const step = (from: string, to: string) => g.edges.find((e) => e.from === from && e.to === to)!;
	assert.deepEqual(step('a', 'b').settlements, ['covenant', 'merc']);
	assert.deepEqual(step('b', 'c').settlements, ['duty']);
});

test('gear sold with no trade-in is kept aside, not forced onto a tree', () => {
	// `solo` is sold for materials only: nothing upgrades into it and it
	// upgrades into nothing. A node with no edges has no tier, so it must not
	// become a one-card tree — but it must not vanish either, because this is
	// exactly how the game sells its Master and Legend gear.
	const g = build([at('duty', 'b', 'a'), at('covenant', 'solo', 'mat:scrap')]);

	assert.deepEqual(
		g.nodes.map((n) => n.id).sort(),
		['a', 'b'],
		'solo is not a tree node'
	);
	assert.deepEqual(g.trees, [['a', 'b']], 'and does not become a tree of its own');
	assert.deepEqual(g.outright, [{ id: 'solo', settlements: ['covenant'] }]);
});

test('an item on a tree is never also listed as sold outright', () => {
	// b is bought outright at Covenant AND traded up for at Frontier — it has a
	// tier, so the tree is where it belongs
	const g = build([at('duty', 'b', 'a'), at('covenant', 'b', 'mat:scrap')]);
	assert.deepEqual(g.outright, []);
	assert.deepEqual(node(g, 'b').settlements, ['covenant', 'duty']);
});

test('outright is deterministic and carries every base', () => {
	const g = build([at('merc', 'z', 'mat:x'), at('duty', 'y', 'mat:x'), at('covenant', 'y', 'mat:x')]);
	assert.deepEqual(g.outright, [
		{ id: 'y', settlements: ['covenant', 'duty'] },
		{ id: 'z', settlements: ['merc'] }
	]);
});

test('TECH_GROUPS excludes the groups whose same-group edges are not progression', () => {
	assert.equal(isTechGroup('weapon'), true);
	// `other` has 65 same-group edges upstream, all Battle Token → cosmetic
	assert.equal(isTechGroup('other'), false);
	assert.equal(isTechGroup('artefact'), false);
	assert.equal(new Set(TECH_GROUPS).size, TECH_GROUPS.length);
});
