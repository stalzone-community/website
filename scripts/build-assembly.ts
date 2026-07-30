/**
 * Links assembly parts to the gear they build, and records which gear therefore
 * cannot reach the auction.
 *
 * WHY THIS EXISTS
 *
 * Some gear is not looted or bought — it is assembled from numbered "parts"
 * gathered over an event. You assemble it yourself, the result is personal, and
 * it can never be listed. FN SCAR SSR is the case that prompted this: `status`
 * says `PERSONAL_ON_USE`, same as all 338 weapons in the game, so the
 * catalogue's own field cannot tell it apart from a freely traded rifle like FN
 * Five-seveN. Being assembled at all is the only signal that separates them,
 * which is what this file recovers.
 *
 * UPSTREAM RECORDS NO LINK, SO THIS IS NAME MATCHING
 *
 * "FN SCAR SSR Part" carries no reference to `qj26k`. Its `compatible` array is
 * empty, `usedInCrafts` is false, and nothing in the catalogue points either way
 * — the only thing joining them is the English name. So this script matches on
 * names, which is fragile in three ways worth stating plainly:
 *
 *  1. **English only.** The other four languages translate both sides, and not
 *     always consistently, so `name.en` is the single join key.
 *  2. **Part names are abbreviations, not prefixes.** "ACOG 2x40 Part" belongs
 *     to "Trijicon ACOG 2x40 Optical Sight" — the stem sits mid-name. A prefix
 *     rule silently drops those, so a substring pass follows the exact pass.
 *  3. **A rename upstream breaks it.** Which is the reason this runs at build
 *     time and commits its output: the link becomes a reviewable diff, and an
 *     unresolved stem fails the build instead of quietly un-hiding a tab.
 *
 * Anything the two passes cannot resolve has to be listed in
 * `assembly-overrides.json` or this exits non-zero. There is deliberately no
 * "skip what we could not match" path — that is how a silent regression ships.
 *
 *   node scripts/build-assembly.ts
 *   node scripts/build-assembly.ts --check    # exit 10 if the output is stale
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Item, ItemDatabase } from '../src/lib/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'src', 'lib', 'data');
const ITEMS = join(DATA, 'items.json');
const OVERRIDES = join(DATA, 'assembly-overrides.json');
const OUT = join(DATA, 'assembly.json');

const checkOnly = process.argv.includes('--check');

/** `X Part`, `X Part #2` — the two shapes upstream uses. */
const PART_SUFFIX = / Part(?:\s*#\d+)?$/;

/**
 * Assembly binds, whatever the parts say.
 *
 * This rule started narrower: only gear built from a bind-on-pickup part
 * counted as bound, on the reasoning that a bind has to come from somewhere.
 * That left 14 of the 39 assembled items auctionable — Scorpion EVO III among
 * them — and in game they are not.
 *
 * Those 14 split off cleanly: each is built entirely from `NON_DROP` parts, and
 * no other group is. But `NON_DROP` cannot be read as a bind — it means "kept on
 * death", and all 103 artefacts carry it while being the busiest market in the
 * game — so no mechanism in the catalogue predicts this. The rule is now the
 * plain one it should have been: assembled from parts means bound.
 *
 * `boundOnAssembly` is therefore true for every group. The flag stays rather
 * than being dropped so consumers keep one explicit field to read, and so
 * narrowing the rule again is a change here instead of at every call site.
 *
 * These two states survive only for the build log below. `PERSONAL_ON_GET` is
 * the common one; `PERSONAL_DROP_ON_GET` is the same bind plus dropped on death,
 * used by two attachment parts (Apogee, Azimut). If upstream ever files an
 * assembled item whose parts genuinely bind, the printed counts move and the
 * blanket rule is worth re-examining.
 */
const BOUND_PART_STATES = new Set(['PERSONAL_ON_GET', 'PERSONAL_DROP_ON_GET']);

/** Parts and gear disagree on spacing, hyphens and case: "MG3" vs "MG 3". */
const norm = (s: string | undefined): string => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const nameOf = (item: Item): string => item.name?.en ?? '';

export interface AssemblyGroup {
	/** the assembled item's id */
	gear: string;
	/** its English name, so a diff of this file is readable */
	gearName: string;
	/** how the link was made — `override` entries are hand-maintained */
	via: 'exact' | 'substring' | 'override';
	/** ids of the parts that build it */
	parts: string[];
	/**
	 * Assembled gear is personal and can never be listed. The whole point of the
	 * file — and true for every group, see `BOUND_PART_STATES` for why it is a
	 * field rather than something the reader is expected to infer.
	 */
	boundOnAssembly: boolean;
}

export interface AssemblyData {
	/** upstream commit this was derived from, mirroring db-source.json */
	source: string;
	groups: AssemblyGroup[];
}

interface Override {
	gear: string;
	/** why name matching could not get there — this file is read by humans */
	why: string;
}

interface Overrides {
	/** part-name stem → gear, for what name matching cannot reach */
	resolve: Record<string, Override>;
	/** stems that intentionally have no gear (a part for something uncatalogued) */
	ignore: string[];
}

function loadOverrides(): Overrides {
	if (!existsSync(OVERRIDES)) return { resolve: {}, ignore: [] };
	const raw = JSON.parse(readFileSync(OVERRIDES, 'utf8')) as Partial<Overrides>;
	return { resolve: raw.resolve ?? {}, ignore: raw.ignore ?? [] };
}

function main(): void {
	if (!existsSync(ITEMS)) {
		console.error(`${ITEMS} is missing — run \`npm run db:build\` first.`);
		process.exit(1);
	}

	const db = JSON.parse(readFileSync(ITEMS, 'utf8')) as ItemDatabase;
	const items: Item[] = Array.isArray(db) ? (db as unknown as Item[]) : db.items;
	const overrides = loadOverrides();

	const parts = items.filter((i) => PART_SUFFIX.test(nameOf(i)));

	/*
	 * Candidates exclude parts themselves, and exclude `misc` — every part lives
	 * in `misc`, and every piece of assembled gear found so far is a weapon,
	 * armor, attachment, backpack or `other`. Without that filter a stem like
	 * "MG3" happily matches another part.
	 */
	const candidates = items.filter((i) => !PART_SUFFIX.test(nameOf(i)) && i.category !== 'misc');

	// stem → the parts that name it
	const stems = new Map<string, Item[]>();
	for (const part of parts) {
		const stem = nameOf(part).replace(PART_SUFFIX, '').trim();
		if (!stem) continue;
		const list = stems.get(stem);
		if (list) list.push(part);
		else stems.set(stem, [part]);
	}

	const groups: AssemblyGroup[] = [];
	const unresolved: string[] = [];
	const ambiguous: string[] = [];
	/** gear whose parts bind on pickup — reported, no longer decisive */
	const withBindingPart = new Set<string>();

	for (const [stem, group] of [...stems.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
		if (overrides.ignore.includes(stem)) continue;

		let gear: Item | undefined;
		let via: AssemblyGroup['via'] = 'exact';

		const forced = overrides.resolve[stem];
		if (forced) {
			gear = items.find((i) => i.id === forced.gear);
			via = 'override';
			if (!gear) {
				console.error(`override for "${stem}" points at unknown item id "${forced.gear}"`);
				process.exitCode = 1;
				continue;
			}
		} else {
			const target = norm(stem);
			gear = candidates.find((i) => norm(nameOf(i)) === target);

			if (!gear) {
				// "ACOG 2x40" inside "Trijicon ACOG 2x40 Optical Sight". Only accept a
				// single hit: two hits means the stem is too short to be a join key,
				// and guessing between them is how the wrong tab gets hidden.
				const hits = candidates.filter((i) => norm(nameOf(i)).includes(target));
				if (hits.length === 1) {
					gear = hits[0];
					via = 'substring';
				} else if (hits.length > 1) {
					ambiguous.push(`${stem} -> ${hits.map((h) => `${nameOf(h)} (${h.id})`).join(', ')}`);
					continue;
				}
			}
		}

		if (!gear) {
			unresolved.push(stem);
			continue;
		}

		if (group.some((p) => BOUND_PART_STATES.has(String(p.status)))) withBindingPart.add(gear.id);

		groups.push({
			gear: gear.id,
			gearName: nameOf(gear),
			via,
			/* Ordered by name, not by id: the page lists these and "Part, Part #1,
			   Part #2" is the order a player reads them in, where id order is
			   arbitrary. `numeric` so #10 sorts after #9 rather than after #1. */
			parts: group
				.slice()
				.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'en', { numeric: true }))
				.map((p) => p.id),
			boundOnAssembly: true
		});
	}

	groups.sort((a, b) => a.gear.localeCompare(b.gear));

	for (const stem of unresolved) {
		console.error(`unresolved part stem: "${stem}" — add it to assembly-overrides.json`);
	}
	for (const line of ambiguous) {
		console.error(`ambiguous part stem: ${line} — pin it in assembly-overrides.json`);
	}
	if (unresolved.length || ambiguous.length) process.exitCode = 1;

	const source = (() => {
		const lock = join(DATA, 'db-source.json');
		if (!existsSync(lock)) return 'unknown';
		return (JSON.parse(readFileSync(lock, 'utf8')) as { sha?: string }).sha ?? 'unknown';
	})();

	// No timestamp: this file is committed, so a rebuild that changed nothing
	// should produce no diff at all.
	const next = JSON.stringify({ source, groups } satisfies AssemblyData, null, '\t') + '\n';

	const loose = groups.filter((g) => g.via !== 'exact');
	console.log(
		`${groups.length} assembled items, all bound on assembly ` +
			`(${withBindingPart.size} of them also have a part that binds on pickup, ` +
			`${loose.length} matched loosely)`
	);

	if (checkOnly) {
		const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
		if (current !== next) {
			console.error(`${OUT} is stale — run \`npm run db:assembly\``);
			process.exit(10);
		}
		console.log('assembly.json is up to date');
		return;
	}

	writeFileSync(OUT, next);
	console.log(`wrote ${OUT}`);
	// Every group is bound now, so listing those says nothing. The loose matches
	// are the lines worth an eye — they are the ones a rename upstream will move.
	for (const g of loose) console.log(`  ${g.via}: ${g.gearName} (${g.gear})`);
}

main();
