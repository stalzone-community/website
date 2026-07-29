/**
 * Normalises the barter and hideout recipe files into a single static payload.
 *
 * Kept out of build-items.ts because it needs the item id set to validate
 * against, so it runs second — and because the two files are independent
 * concerns that happen to share a vendor directory.
 *
 * Emitted to src/lib/data/recipes.json and read server-side only. The item page
 * projects out just the recipes touching that item, which keeps all 2 311 pages
 * prerendered: reading these from Atlas would put every item page on the
 * byte-throttled M0 read path, which is the thing the whole architecture avoids.
 *
 *   node scripts/build-recipes.ts [--realm ru]
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGS } from '../src/lib/types.ts';
import type { BarterRecipe, HideoutRecipe, Localized, RecipeData } from '../src/lib/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const realm = argv.includes('--realm') ? argv[argv.indexOf('--realm') + 1] : 'global';
const DB = join(ROOT, 'vendor', 'stalzone-database', realm);
const OUT = join(ROOT, 'src', 'lib', 'data');

if (!existsSync(join(DB, 'barter_recipes.json'))) {
	console.error(`[recipes] no vendored database at ${DB} — run: npm run db:vendor`);
	process.exit(1);
}
if (!existsSync(join(OUT, 'items.json'))) {
	console.error('[recipes] items.json missing — run scripts/build-items.ts first');
	process.exit(1);
}

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

function localized(t: unknown): Localized {
	const lines = (t as { lines?: Record<string, string> })?.lines;
	if (!lines) return {};
	const out: Localized = {};
	for (const l of LANGS) if (lines[l]) out[l] = lines[l];
	return out;
}

const knownItems = new Set<string>(
	(read(join(OUT, 'items.json')).items as Array<{ id: string }>).map((i) => i.id)
);

/** Recipes may name an item this realm does not carry. Dropping the reference
 *  silently would make a recipe render with a missing ingredient, so they are
 *  counted and the whole recipe is skipped. */
let skipped = 0;
const known = (id: string) => knownItems.has(id);

// ── hideout ─────────────────────────────────────────────────────────────────
const hideoutRaw: {
	perks: Array<{ id: string; name: unknown; desc: unknown }>;
	recipes: Array<{
		bench: string;
		category?: unknown;
		subcategory?: unknown;
		result: Array<{ item: string; amount: number }>;
		ingredients: Array<{ item: string; amount: number }>;
		energy: number;
		requirements?: { perks?: Record<string, number>; features?: string[] };
	}>;
} = read(join(DB, 'hideout_recipes.json'));

const hideout: HideoutRecipe[] = [];
for (const r of hideoutRaw.recipes) {
	if (!r.result.every((x) => known(x.item)) || !r.ingredients.every((x) => known(x.item))) {
		skipped++;
		continue;
	}
	hideout.push({
		bench: r.bench,
		category: localized(r.category),
		subcategory: localized(r.subcategory),
		result: r.result,
		ingredients: r.ingredients,
		energy: r.energy,
		perks: r.requirements?.perks ?? {},
		features: r.requirements?.features ?? []
	});
}

// ── barter ──────────────────────────────────────────────────────────────────
const barterRaw: Array<{
	settlementTitle: { key: string; lines?: Record<string, string> };
	recipes: Array<{
		settlementRequiredLevel: number;
		item: string;
		offers: Array<{
			currency: string;
			cost: number;
			requiredItems: Array<{ item: string; amount: number }>;
		}>;
	}>;
}> = read(join(DB, 'barter_recipes.json'));

const barter: BarterRecipe[] = [];
/** Upstream ships "The Bar" and "Factions of the North" twice under one title
 *  key; identical offers would otherwise appear twice on an item page. */
const seen = new Set<string>();

for (const s of barterRaw) {
	for (const r of s.recipes) {
		if (!known(r.item)) {
			skipped++;
			continue;
		}
		for (const offer of r.offers) {
			if (!offer.requiredItems.every((x) => known(x.item))) {
				skipped++;
				continue;
			}
			const key = [
				s.settlementTitle.key,
				r.item,
				r.settlementRequiredLevel,
				offer.currency,
				offer.cost,
				...offer.requiredItems.map((x) => `${x.item}x${x.amount}`)
			].join('|');
			if (seen.has(key)) continue;
			seen.add(key);

			barter.push({
				settlement: s.settlementTitle.key,
				settlementName: localized(s.settlementTitle),
				level: r.settlementRequiredLevel,
				item: r.item,
				currency: offer.currency,
				cost: offer.cost,
				requiredItems: offer.requiredItems
			});
		}
	}
}

const perks = Object.fromEntries(
	hideoutRaw.perks.map((p) => [p.id, { name: localized(p.name), desc: localized(p.desc) }])
);

const data: RecipeData = { hideout, barter, perks };
writeFileSync(join(OUT, 'recipes.json'), JSON.stringify(data));

const kb = (statSync(join(OUT, 'recipes.json')).size / 1024).toFixed(0);
const craftable = new Set(hideout.flatMap((r) => r.result.map((x) => x.item))).size;
const barterable = new Set(barter.map((b) => b.item)).size;

console.log(`[recipes] ${hideout.length} hideout recipes → ${craftable} craftable items`);
console.log(`[recipes] ${barter.length} barter offers → ${barterable} obtainable items`);
console.log(`[recipes] ${Object.keys(perks).length} perks, ${new Set(barter.map((b) => b.settlement)).size} settlements`);
if (skipped) console.log(`[recipes] ${skipped} recipes skipped — reference an item not in realm "${realm}"`);
console.log(`[recipes] recipes.json ${kb} KB`);
