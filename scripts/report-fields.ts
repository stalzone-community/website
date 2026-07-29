/**
 * Discovery pass over the vendored database. Walks every item and reports the
 * shapes actually present: infoBlock types, element types, the translation keys
 * used as stat labels, enum domains, and how many items carry each.
 *
 * This is what the normaliser is written against — run it after every upstream
 * sync to catch new stat keys before they silently vanish from the site.
 *
 *   node scripts/report-fields.ts            # summary to stdout
 *   node scripts/report-fields.ts --json     # machine-readable
 *   node scripts/report-fields.ts --realm ru
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const realm = argv.includes('--realm') ? argv[argv.indexOf('--realm') + 1] : 'global';
const asJson = argv.includes('--json');
const DB = join(ROOT, 'vendor', 'stalzone-database', realm);

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (name.endsWith('.json')) out.push(p);
	}
	return out;
}

class Tally<T> {
	private m = new Map<T, number>();
	add(k: T, n = 1) {
		this.m.set(k, (this.m.get(k) ?? 0) + n);
	}
	get size() {
		return this.m.size;
	}
	top(n = Infinity) {
		return [...this.m].sort((a, b) => b[1] - a[1]).slice(0, n);
	}
	entries() {
		return [...this.m];
	}
}

const blockTypes = new Tally<string>();
const elementTypes = new Tally<string>();
/** translation key of a stat label -> how many items carry it */
const statKeys = new Tally<string>();
/** stat key -> the element type carrying it, to spot inconsistencies */
const statKeyShapes = new Map<string, Set<string>>();
const statKeyLabels = new Map<string, string>();
const colors = new Tally<string>();
const statuses = new Tally<string>();
const categories = new Tally<string>();
const langs = new Tally<string>();
/** every distinct key seen on an element object, to catch fields we ignore */
const elementFields = new Tally<string>();
const valueTypes = new Tally<string>();

let itemCount = 0;
let noInfoBlocks = 0;

const files = walk(join(DB, 'items'));

for (const f of files) {
	const item = JSON.parse(readFileSync(f, 'utf8'));
	itemCount++;

	if (item.color) colors.add(item.color);
	if (item.status?.state) statuses.add(item.status.state);
	if (item.category) categories.add(item.category);
	if (item.name?.lines) for (const l of Object.keys(item.name.lines)) langs.add(l);

	const blocks = item.infoBlocks;
	if (!Array.isArray(blocks) || blocks.length === 0) {
		noInfoBlocks++;
		continue;
	}

	/** stat keys seen in THIS item, so counts are items-carrying not occurrences */
	const seen = new Set<string>();

	const visitElement = (el: any, blockType: string) => {
		if (!el || typeof el !== 'object') return;
		const t = el.type ?? '(none)';
		elementTypes.add(`${blockType} > ${t}`);
		for (const k of Object.keys(el)) elementFields.add(`${t}.${k}`);

		// the label lives under .key (key-value) or .name (numeric/text)
		const label = el.key ?? el.name;
		const tkey = label?.type === 'translation' ? label.key : undefined;
		if (tkey) {
			seen.add(tkey);
			if (!statKeyShapes.has(tkey)) statKeyShapes.set(tkey, new Set());
			statKeyShapes.get(tkey)!.add(t);
			if (label.lines?.en && !statKeyLabels.has(tkey)) statKeyLabels.set(tkey, label.lines.en);
			valueTypes.add(`${tkey} :: ${typeof el.value}`);
		}

		// nested containers
		for (const child of el.elements ?? []) visitElement(child, blockType);
	};

	for (const b of blocks) {
		const bt = b.type ?? '(none)';
		blockTypes.add(bt);
		for (const el of b.elements ?? []) visitElement(el, bt);
	}

	for (const k of seen) statKeys.add(k);
}

if (asJson) {
	console.log(
		JSON.stringify(
			{
				realm,
				itemCount,
				noInfoBlocks,
				blockTypes: blockTypes.entries(),
				elementTypes: elementTypes.entries(),
				statKeys: statKeys.top().map(([k, n]) => ({
					key: k,
					items: n,
					label: statKeyLabels.get(k) ?? null,
					shapes: [...(statKeyShapes.get(k) ?? [])]
				})),
				colors: colors.entries(),
				statuses: statuses.entries(),
				categories: categories.entries(),
				elementFields: elementFields.entries()
			},
			null,
			2
		)
	);
	process.exit(0);
}

const pct = (n: number) => `${((n / itemCount) * 100).toFixed(1)}%`;
const line = (s = '') => console.log(s);

line(`realm: ${realm}   items: ${itemCount}   without infoBlocks: ${noInfoBlocks} (${pct(noInfoBlocks)})`);
line(`languages: ${langs.entries().map(([l, n]) => `${l}(${n})`).join(' ')}`);

line();
line(`── infoBlock types (${blockTypes.size}) ──`);
for (const [k, n] of blockTypes.top()) line(`  ${String(n).padStart(6)}  ${k}`);

line();
line(`── element types by parent block (${elementTypes.size}) ──`);
for (const [k, n] of elementTypes.top()) line(`  ${String(n).padStart(6)}  ${k}`);

line();
line(`── color / rank (${colors.size}) ──`);
for (const [k, n] of colors.top()) line(`  ${String(n).padStart(6)}  ${k}`);

line();
line(`── status.state (${statuses.size}) ──`);
for (const [k, n] of statuses.top()) line(`  ${String(n).padStart(6)}  ${k}`);

line();
line(`── categories (${categories.size}) ──`);
for (const [k, n] of categories.top()) line(`  ${String(n).padStart(6)}  ${k}`);

line();
line(`── stat keys, by how many items carry them (${statKeys.size} distinct) ──`);
for (const [k, n] of statKeys.top()) {
	const shapes = [...(statKeyShapes.get(k) ?? [])].join('|');
	const label = statKeyLabels.get(k) ?? '';
	line(`  ${String(n).padStart(5)} ${pct(n).padStart(7)}  ${k.padEnd(44)} ${shapes.padEnd(11)} ${label}`);
}

line();
line(`── element object fields (${elementFields.size}) ──`);
for (const [k, n] of elementFields.top()) line(`  ${String(n).padStart(7)}  ${k}`);
