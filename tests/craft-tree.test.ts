/**
 * Craft graph (node:test, `npm test`).
 *
 * Hand-written recipe tables — the module takes its data as an argument, so
 * none of this needs the catalogue or Vite.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCraftGraph, layoutCraft, type CraftRecipe } from '../src/lib/craft-tree.ts';

/** `make('b', ['a', 2], ['c', 1])` — b from 2 a and 1 c. */
const make = (out: string, ...ins: [string, number][]): CraftRecipe => ({
	bench: 'workbench',
	result: [{ item: out, amount: 1 }],
	ingredients: ins.map(([item, amount]) => ({ item, amount }))
});

function index(recipes: CraftRecipe[]) {
	const by = new Map<string, number[]>();
	recipes.forEach((r, i) => {
		for (const o of r.result) (by.get(o.item) ?? by.set(o.item, []).get(o.item)!).push(i);
	});
	return by;
}

const build = (root: string, recipes: CraftRecipe[]) =>
	buildCraftGraph(root, recipes, index(recipes));

const items = (g: ReturnType<typeof build>) => g.nodes.filter((n) => n.kind === 'item');
const joins = (g: ReturnType<typeof build>) => g.nodes.filter((n) => n.kind === 'recipe');
const node = (g: ReturnType<typeof build>, ref: string) =>
	items(g).find((n) => n.ref === ref)!;

test('a recipe becomes a join between its ingredients and its result', () => {
	const g = build('b', [make('b', ['x', 2], ['y', 1])]);

	assert.deepEqual(
		items(g)
			.map((n) => n.ref)
			.sort(),
		['b', 'x', 'y']
	);
	assert.equal(joins(g).length, 1, 'the recipe is a node, not three loose edges');
	// every edge joins an item to a join, never item to item
	const kind = new Map(g.nodes.map((n) => [n.id, n.kind]));
	for (const e of g.edges) assert.notEqual(kind.get(e.from), kind.get(e.to));
});

test('the root ends up in the last column', () => {
	const g = build('c', [make('c', ['b', 1]), make('b', ['a', 1])]);
	assert.equal(node(g, 'c').depth, g.tiers - 1);
	assert.equal(node(g, 'a').depth, 0);
});

test('an ingredient reached twice is one node, not two', () => {
	// iron feeds both halves; it is the same iron
	const g = build('top', [
		make('top', ['left', 1], ['right', 1]),
		make('left', ['iron', 3]),
		make('right', ['iron', 2])
	]);
	assert.equal(items(g).filter((n) => n.ref === 'iron').length, 1);
	// and it keeps the larger requirement
	assert.equal(node(g, 'iron').amount, 3);
});

test('base materials are the ones nothing crafts', () => {
	const g = build('b', [make('b', ['ore', 2])]);
	assert.equal(node(g, 'ore').base, true);
	assert.equal(node(g, 'b').base, false);
	assert.deepEqual(g.materials, [{ item: 'ore', amount: 2 }]);
});

test('a recipe that needs the thing it makes is refused', () => {
	// scrap → plate → scrap would recurse forever
	const g = build('plate', [make('plate', ['scrap', 1]), make('scrap', ['plate', 1])]);
	assert.equal(g.skipped > 0, true);
	assert.equal(Number.isFinite(g.tiers), true);
	assert.equal(node(g, 'plate').depth, g.tiers - 1);
});

test('a loop formed only by merging two paths is cut', () => {
	// Each walk on its own is acyclic; deduplicating merges them into a cycle,
	// which is what broke the depth pass before the condensation was added.
	const g = build('goal', [
		make('goal', ['a', 1], ['b', 1]),
		make('a', ['b', 1]),
		make('b', ['a', 1])
	]);
	for (const n of g.nodes) assert.equal(Number.isFinite(n.depth), true);
	assert.equal(node(g, 'goal').depth, g.tiers - 1, 'the goal must still be last');
});

test('every node still reaches the root after loops are cut', () => {
	const g = build('goal', [
		make('goal', ['a', 1]),
		make('a', ['b', 1]),
		make('b', ['a', 1], ['deep', 1]),
		make('deep', ['ore', 1])
	]);
	const children = new Map(g.nodes.map((n) => [n.id, n.children]));
	const rootId = node(g, 'goal').id;
	for (const n of g.nodes) {
		// walk down from n; it must arrive at the root
		const seen = new Set<string>();
		const stack = [n.id];
		let found = false;
		while (stack.length) {
			const id = stack.pop()!;
			if (id === rootId) { found = true; break; }
			if (seen.has(id)) continue;
			seen.add(id);
			stack.push(...(children.get(id) ?? []));
		}
		assert.equal(found, true, `${n.ref} leads nowhere`);
	}
});

test('every edge advances exactly toward the root', () => {
	const g = build('c', [make('c', ['b', 1], ['x', 1]), make('b', ['a', 2])]);
	const depth = new Map(g.nodes.map((n) => [n.id, n.depth]));
	for (const e of g.edges) assert.equal(depth.get(e.to)! > depth.get(e.from)!, true);
});

test('an item with two recipes shows both', () => {
	const g = build('b', [make('b', ['x', 1]), make('b', ['y', 1])]);
	assert.equal(joins(g).length, 2, 'choosing between recipes is half the point');
	assert.deepEqual(
		items(g)
			.map((n) => n.ref)
			.sort(),
		['b', 'x', 'y']
	);
});

test('layout places every node without overlap', () => {
	const g = build('c', [make('c', ['b', 1], ['z', 1]), make('b', ['a', 1], ['y', 1])]);
	const l = layoutCraft(g);
	assert.equal(l.nodes.length, g.nodes.length);
	const seen = new Set<string>();
	for (const n of l.nodes) {
		const key = `${n.column}|${n.row.toFixed(4)}`;
		assert.equal(seen.has(key), false, 'two cards on one cell');
		seen.add(key);
	}
});

test('an uncraftable root still builds, as a graph of one', () => {
	const g = build('ore', []);
	assert.deepEqual(items(g).map((n) => n.ref), ['ore']);
	assert.deepEqual(g.edges, []);
	assert.equal(g.tiers, 1);
});
