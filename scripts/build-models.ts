/**
 * Extracts weapon 3D models from a STALZONE install into `static/models`.
 *
 * WHY THIS ONE IS DIFFERENT FROM EVERY OTHER db:* SCRIPT
 *
 * The rest of the data pipeline regenerates from `vendor/stalzone-database`,
 * which the Dockerfile clones during the image build — so `items.json` and
 * friends are gitignored and always fresh. This script's input is a 43 GB Steam
 * install that exists only on a developer's machine. Fly's builder has no copy
 * and never will, so the output is committed rather than derived, and this runs
 * by hand after a game patch instead of on every build.
 *
 *   node scripts/build-models.ts --game-dir ~/.steam/steam/steamapps/common/STALZONE
 *   node scripts/build-models.ts --game-dir <path> --only akm --force
 *   node scripts/build-models.ts --game-dir <path> --check
 *
 * External tools, both local-only and both checked before any work starts:
 *   pip install sc-file     decodes .mcsb -> .glb and .ol -> .dds
 *   ImageMagick (`magick`)  .dds -> .webp
 *
 * Exit codes: 0 = wrote or up to date, 10 = stale (--check only), 1 = error.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB = join(ROOT, 'vendor', 'stalzone-database', 'global', 'items');
const OUT = join(ROOT, 'static', 'models');
const MANIFEST = join(ROOT, 'src', 'lib', 'data', 'models.json');
/** scratch for the intermediate .dds, which is ~5 MB a map and never shipped */
const TMP = join(ROOT, '.models-tmp');

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
	const i = argv.indexOf(`--${name}`);
	return i === -1 ? undefined : argv[i + 1];
};
const has = (name: string) => argv.includes(`--${name}`);

const gameDir = flag('game-dir');
const only = flag('only');
const force = has('force');
const checkOnly = has('check');
/* 1024 halves the committed bytes against the native 2048 and is more than a
   360px viewer canvas can show. --max-texture 2048 if a model page ever goes
   full-bleed. */
const maxTexture = Number(flag('max-texture') ?? 1024);

if (!gameDir) {
	console.error('usage: node scripts/build-models.ts --game-dir <STALZONE install> [--only <code>] [--force] [--check] [--max-texture 1024]');
	process.exit(1);
}

const WEAPONS = join(gameDir, 'modassets', 'assets', 'weapons', 'models', 'weapons');
if (!existsSync(WEAPONS)) {
	console.error(`No weapon models under ${WEAPONS}\nIs --game-dir the STALZONE install root?`);
	process.exit(1);
}

/* Fail on a missing tool now rather than 200 models into a run. */
for (const [bin, args, hint] of [
	['scfile', ['--version'], 'pip install sc-file'],
	['magick', ['-version'], 'install ImageMagick']
] as const) {
	try {
		execFileSync(bin, args, { stdio: 'ignore' });
	} catch {
		console.error(`\`${bin}\` not found on PATH — ${hint}`);
		process.exit(1);
	}
}

// ---------------------------------------------------------------- matching

/**
 * The bridge between the two datasets is the DB's own name key. `item.wpn.
 * <code>.name` carries an internal codename that is far closer to the model
 * tree than the English display name is — `item.wpn.aks74.name` against the
 * folder `aks74`. Matching on display names alone reached 40%; on codenames
 * plus the rules below, 96%.
 */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** `-1`, `_mod`, `_a`, `_worn` — a skin or a worn variant of a base weapon. */
const stripVariant = (c: string) => c.replace(/[-_](\d+|mod|old|new|worn|damaged|main|[a-z])$/, '');

/**
 * Cases no string metric reaches, because the two names are different words
 * for the same gun. Real-world designations (an M1014 is a Benelli M4, an M1A
 * is a civilian M14), EXBO's transliterations (OTs-14 -> oc14), and two
 * misspellings in the game's own folder names.
 */
const ALIASES: Record<string, string> = {
	l85: 'l862', 'l85-1': 'l862', l85_mod: 'l862', // SA80 family; holds l86_*.ol
	ots14a1: 'oc14-a1',
	tact: 'sa20_takt',
	a762: 'aek762', // A-762 is the AEK-973
	a545: 'aek_545', // bare `a545` only ever appears on event skins
	valm: 'asm_val',
	g36c: 'g36',
	dp: 'dp27',
	akmb: 'akm', // AKM Tishina, a suppressed AKM
	fal_a: 'fnfal',
	mcmillan: 'mcmilan', // sic — the folder is misspelled
	grizzly: 'grizly58', // sic
	m1014: 'benelli',
	m1014_breacher: 'benelli_shorty',
	protecta: 'dao12', // Protecta/Striker = DAO-12
	mk12_a: 'deria_mk_12',
	m1a: 'm14', 'm1a-1': 'm14',
	mosinkar: 'mosinka_korotkoya' // korotkaya = short = the Carbine
};

/** Confirmed to ship no .mcsb anywhere under the weapon tree. */
const NO_MODEL = new Set(['smesson', 'highest_power', 'ak74m']);

/** style_/motif_/skins/colors hold reskins of a neighbouring base model. */
const SKIN_PATH = /(^|\/)(style_|motif_|skins?|colors?)\//i;

function walk(dir: string, out: string[] = []): string[] {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) walk(p, out);
		else out.push(p);
	}
	return out;
}

const allFiles = walk(WEAPONS);

/**
 * Candidate keys are folder names AND file stems, because one folder can hold
 * several distinct models: `m16/` has both m16a2.mcsb and m16a3.mcsb, and they
 * belong to two different items. Folder-only matching silently merges them.
 */
const candidates = new Map<string, string[]>();
for (const p of allFiles) {
	if (!p.endsWith('.mcsb')) continue;
	const rel = relative(WEAPONS, p);
	if (/lod/i.test(rel)) continue; // the low-poly distance meshes
	for (const key of [norm(basename(p, '.mcsb')), norm(rel.split('/')[0])]) {
		const list = candidates.get(key) ?? [];
		list.push(rel);
		candidates.set(key, list);
	}
}
/* Base models before reskins, then shallow paths before deep — `a545` was
   otherwise resolving to aek545/style_ravent23/, a limited event skin. */
const rank = (rel: string) => [SKIN_PATH.test(rel) ? 1 : 0, rel.split('/').length, rel.length];
for (const [k, v] of candidates) {
	const uniq = [...new Set(v)].sort((a, b) => {
		const [ra, rb] = [rank(a), rank(b)];
		return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
	});
	candidates.set(k, uniq);
}

interface Weapon {
	id: string;
	code: string;
	en: string;
	model?: string;
	rule?: string;
}

function loadWeapons(): Weapon[] {
	const out: Weapon[] = [];
	for (const cat of readdirSync(join(DB, 'weapon'))) {
		const dir = join(DB, 'weapon', cat);
		if (!statSync(dir).isDirectory()) continue;
		for (const f of readdirSync(dir)) {
			if (!f.endsWith('.json')) continue; // a few categories nest further
			const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
			const m = /^item\.wpn\.(.+)\.name$/.exec(d.name.key);
			if (!m) continue; // melee, devices, and the numeric-key handful
			out.push({ id: d.id, code: m[1], en: d.name.lines?.en ?? '' });
		}
	}
	return out;
}

function match(w: Weapon): { model?: string; rule?: string } {
	if (NO_MODEL.has(w.code)) return { rule: 'no-model' };
	if (ALIASES[w.code]) {
		const hit = candidates.get(norm(ALIASES[w.code]));
		if (hit) return { model: hit[0], rule: 'alias' };
	}
	const nc = norm(w.code);
	for (const [key, rule] of [
		[nc, 'code'],
		[norm(stripVariant(w.code)), 'code-base'],
		[norm(stripVariant(stripVariant(w.code))), 'code-base2']
	] as const) {
		const hit = candidates.get(key);
		if (hit) return { model: hit[0], rule };
	}
	/* Anchored to a word start in the display name — "AN-94M Abakan" is how
	   `abakan` reaches the folder `an94`. One-letter tokens are dropped first:
	   the possessive in "Mosin's Carbine" glued into "s"+"carbine" and matched
	   the FN SCAR. */
	const tokens = w.en.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
	const starts = tokens.map((_, i) => norm(tokens.slice(i).join('')));
	for (const [sources, rule] of [
		[starts, 'key-at-word'],
		[[nc], 'key-in-code']
	] as const) {
		const hits = [...candidates.keys()].filter(
			(k) => k.length >= 4 && sources.some((s) => s.startsWith(k))
		);
		if (hits.length) {
			const best = hits.reduce((a, b) => (b.length > a.length ? b : a));
			return { model: candidates.get(best)![0], rule };
		}
	}
	const inKey = [...candidates.keys()].filter((k) => nc.length >= 4 && k.includes(nc));
	if (inKey.length) {
		const best = inKey.reduce((a, b) => (b.length < a.length ? b : a));
		return { model: candidates.get(best)![0], rule: 'code-in-key' };
	}
	return {};
}

// ---------------------------------------------------------------- textures

/** A reskin, not the weapon's own map — `mp5_diff_golden.ol`, `svd_cobra_diff.ol`. */
const SKIN_TEX = /(golden|stalker|cobra|saraevo|winter|summer|autumn|spring|newyear|ravent|camo|reich)/i;

/**
 * The diffuse and normal maps for one model, by convention `<stem>_diff.ol`
 * and `<stem>_nrm.ol` beside it. Prefers a map named for the model or its
 * folder, so `svd_diff.ol` wins over the `svd_cobra_diff.ol` sitting next to it.
 */
function texturesFor(modelRel: string): { diff?: string; nrm?: string } {
	const dir = join(WEAPONS, dirname(modelRel));
	const stem = norm(basename(modelRel, '.mcsb'));
	const folder = norm(dirname(modelRel).split('/').pop() ?? '');
	const pick = (suffix: string) => {
		const found = readdirSync(dir)
			.filter((f) => f.toLowerCase().endsWith(`_${suffix}.ol`) && !SKIN_TEX.test(f))
			.sort((a, b) => {
				const score = (f: string) => {
					const s = norm(f.replace(new RegExp(`_${suffix}\\.ol$`, 'i'), ''));
					return s === stem ? 0 : s === folder ? 1 : 2;
				};
				return score(a) - score(b) || a.length - b.length;
			});
		return found[0] ? join(dir, found[0]) : undefined;
	};
	return { diff: pick('diff'), nrm: pick('nrm') };
}

/** .ol -> .dds (sc-file) -> resized .webp (ImageMagick). Returns bytes written. */
function convertTexture(src: string, dest: string): number {
	mkdirSync(TMP, { recursive: true });
	execFileSync('scfile', ['convert', src, '-O', TMP], { stdio: 'ignore' });
	const dds = join(TMP, `${basename(src, '.ol')}.dds`);
	if (!existsSync(dds)) throw new Error(`sc-file produced no .dds for ${src}`);
	execFileSync('magick', [
		dds,
		'-resize', `${maxTexture}x${maxTexture}>`, // `>` = only ever shrink
		'-quality', '85',
		dest
	]);
	rmSync(dds, { force: true });
	return statSync(dest).size;
}

// ---------------------------------------------------------------- glTF

interface Gltf {
	images?: { uri: string }[];
	samplers?: object[];
	textures?: { sampler: number; source: number }[];
	materials?: Record<string, unknown>[];
	[k: string]: unknown;
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;

/**
 * Point every material at the weapon's maps.
 *
 * The images are referenced by relative URI rather than embedded, so the JSON
 * chunk can be rewritten without touching — or even parsing — the binary one,
 * and a browser fetches the .webp in parallel with the geometry. A per-material
 * map wins when one exists (`rail_diff.ol` beside a material named `rail`);
 * otherwise every material takes the weapon-wide pair, which is right because
 * these models are authored against a single atlas.
 */
function wireTextures(glbPath: string, diffUri?: string, nrmUri?: string): void {
	if (!diffUri && !nrmUri) return;
	const buf = readFileSync(glbPath);
	if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`not a GLB: ${glbPath}`);

	let offset = 12;
	let jsonStart = -1;
	let jsonLen = 0;
	while (offset < buf.length) {
		const len = buf.readUInt32LE(offset);
		const type = buf.readUInt32LE(offset + 4);
		if (type === CHUNK_JSON) {
			jsonStart = offset + 8;
			jsonLen = len;
			break;
		}
		offset += 8 + len;
	}
	if (jsonStart === -1) throw new Error(`no JSON chunk in ${glbPath}`);

	const gltf: Gltf = JSON.parse(buf.subarray(jsonStart, jsonStart + jsonLen).toString('utf8'));
	gltf.images ??= [];
	gltf.textures ??= [];
	gltf.samplers ??= [{ wrapS: 10497, wrapT: 10497 }];

	const addTexture = (uri: string): number => {
		const img = gltf.images!.push({ uri }) - 1;
		return gltf.textures!.push({ sampler: 0, source: img }) - 1;
	};
	const diffTex = diffUri ? addTexture(diffUri) : undefined;
	const nrmTex = nrmUri ? addTexture(nrmUri) : undefined;

	for (const mat of gltf.materials ?? []) {
		const pbr = (mat.pbrMetallicRoughness ??= {}) as Record<string, unknown>;
		if (diffTex !== undefined) {
			pbr.baseColorTexture = { index: diffTex };
			/* sc-file writes a flat grey baseColorFactor; left in place it
			   multiplies the texture down to half brightness. */
			pbr.baseColorFactor = [1, 1, 1, 1];
		}
		if (nrmTex !== undefined) mat.normalTexture = { index: nrmTex };
	}

	const json = Buffer.from(JSON.stringify(gltf), 'utf8');
	/* The JSON chunk must be 4-byte aligned and padded with spaces (0x20), per
	   the GLB spec — zero-padding here makes strict parsers reject the file. */
	const pad = (4 - (json.length % 4)) % 4;
	const jsonChunk = Buffer.concat([json, Buffer.alloc(pad, 0x20)]);
	const rest = buf.subarray(jsonStart + jsonLen);
	const header = Buffer.alloc(12);
	header.writeUInt32LE(GLB_MAGIC, 0);
	header.writeUInt32LE(2, 4);
	header.writeUInt32LE(12 + 8 + jsonChunk.length + rest.length, 8);
	const chunkHeader = Buffer.alloc(8);
	chunkHeader.writeUInt32LE(jsonChunk.length, 0);
	chunkHeader.writeUInt32LE(CHUNK_JSON, 4);
	writeFileSync(glbPath, Buffer.concat([header, chunkHeader, jsonChunk, rest]));
}

// ---------------------------------------------------------------- run

const weapons = loadWeapons();
for (const w of weapons) Object.assign(w, match(w));

const matched = weapons.filter((w) => w.model);
const unresolved = weapons.filter((w) => !w.model && w.rule !== 'no-model');

/* Several items share one model — 264 items resolve to 215 distinct files, so
   output is keyed by model and the manifest maps each item id onto it. Writing
   per-id would commit the same megabyte a dozen times over. */
const bySlug = new Map<string, string>(); // slug -> model rel path
const idToSlug: Record<string, string> = {};
for (const w of matched) {
	const slug = norm(basename(w.model!, '.mcsb')) || norm(dirname(w.model!));
	bySlug.set(slug, w.model!);
	idToSlug[w.id] = slug;
}

console.log(`weapons with a codename : ${weapons.length}`);
console.log(`matched to a model      : ${matched.length} (${Math.round((100 * matched.length) / weapons.length)}%)`);
console.log(`distinct models to write: ${bySlug.size}`);
if (unresolved.length) {
	console.log(`\nunresolved (${unresolved.length}) — add to ALIASES once identified:`);
	for (const w of unresolved) console.log(`  ${w.code.padEnd(20)}${w.en}`);
}

if (checkOnly) {
	const missing = [...bySlug.keys()].filter((s) => !existsSync(join(OUT, `${s}.glb`)));
	console.log(`\n${missing.length ? `stale: ${missing.length} model(s) not built` : 'up to date'}`);
	process.exit(missing.length ? 10 : 0);
}

mkdirSync(OUT, { recursive: true });
let written = 0;
let skipped = 0;
let bytes = 0;
const failures: string[] = [];

for (const [slug, rel] of bySlug) {
	if (only && !slug.includes(norm(only))) continue;
	const glb = join(OUT, `${slug}.glb`);
	if (!force && existsSync(glb)) {
		skipped++;
		bytes += statSync(glb).size;
		continue;
	}
	try {
		execFileSync('scfile', ['convert', join(WEAPONS, rel), '-O', OUT, '-F', 'glb'], { stdio: 'ignore' });
		/* sc-file names the output after the source stem, which is not the slug
		   whenever the match came from a folder rather than a file name. */
		const produced = join(OUT, `${basename(rel, '.mcsb')}.glb`);
		if (produced !== glb) {
			if (!existsSync(produced)) throw new Error('sc-file produced no .glb');
			writeFileSync(glb, readFileSync(produced));
			rmSync(produced, { force: true });
		}

		const { diff, nrm } = texturesFor(rel);
		let diffUri: string | undefined;
		let nrmUri: string | undefined;
		if (diff) {
			diffUri = `${slug}_diff.webp`;
			bytes += convertTexture(diff, join(OUT, diffUri));
		}
		if (nrm) {
			nrmUri = `${slug}_nrm.webp`;
			bytes += convertTexture(nrm, join(OUT, nrmUri));
		}
		wireTextures(glb, diffUri, nrmUri);

		bytes += statSync(glb).size;
		written++;
		if (written % 25 === 0) console.log(`  … ${written} written`);
	} catch (err) {
		failures.push(`${slug} (${rel}): ${(err as Error).message}`);
	}
}

rmSync(TMP, { recursive: true, force: true });

/* Which texture maps are genuinely on disk — recorded as EXCEPTIONS, so a slug
   absent from this object has both.

   A weapon whose maps use a naming variant texturesFor() does not match keeps
   its mesh and gets the flat grey material wireTextures leaves in place; that
   is a deliberate degradation, not a failure, which is why the loop above does
   not throw on it. What it must not do is let the model page link a .webp that
   was never written: the prerenderer follows that preload, 404s, and takes the
   whole build down with it — 9 of 215 models did exactly that (an94_dif.ol,
   diff_Material.ol, l96_diffuse_body.ol, dif_korpus.ol and friends).

   Read back from OUT rather than accumulated during the loop so it stays true
   on an incremental run, where most models are skipped and never converted. */
const missingMaps: Record<string, string[]> = {};
for (const slug of bySlug.keys()) {
	const gaps = (['diff', 'nrm'] as const).filter(
		(map) => !existsSync(join(OUT, `${slug}_${map}.webp`))
	);
	if (gaps.length) missingMaps[slug] = [...gaps];
}

writeFileSync(
	MANIFEST,
	`${JSON.stringify({ models: idToSlug, count: bySlug.size, missingMaps }, null, '\t')}\n`
);
if (Object.keys(missingMaps).length) {
	console.log(
		`\n${Object.keys(missingMaps).length} model(s) missing a texture map (mesh still ships, untextured):`
	);
	for (const [slug, gaps] of Object.entries(missingMaps)) console.log(`  ${slug}: ${gaps.join(', ')}`);
}

console.log(`\nwritten ${written}, skipped ${skipped} (use --force to rebuild)`);
console.log(`static/models: ${(bytes / 1e6).toFixed(0)} MB`);
console.log(`manifest: ${relative(ROOT, MANIFEST)} (${Object.keys(idToSlug).length} items)`);
if (failures.length) {
	console.log(`\n${failures.length} failed:`);
	for (const f of failures) console.log(`  ${f}`);
	process.exit(1);
}
