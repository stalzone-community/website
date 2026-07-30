/**
 * Projects the built catalogue down to what the build calculator needs.
 *
 * Runs after build-items.ts and reads its output, not the vendor tree — the
 * normalising work is already done there and duplicating it would give the
 * calculator a second, drifting copy of the stat slugs.
 *
 * Emits static/calc/{gear,weapon}.<lang>.json, one pair per language, fetched by
 * the browser on demand. Static rather than a server load because the numbers
 * change only when EXBO patches the game: the CDN can hold them, and a page
 * view costs the origin nothing. Split gear/weapon because they are separate
 * tabs and most visitors open one.
 *
 *   node scripts/build-calc-index.ts
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { LANGS } from '../src/lib/types.ts';
import type { Item, ItemDatabase, Lang, StatRange } from '../src/lib/types.ts';
import type {
	AttachmentSlot,
	CalcArmor,
	CalcArtefact,
	CalcAttachment,
	CalcBuff,
	CalcContainer,
	CalcStatMeta,
	CalcWeapon,
	GearIndex,
	WeaponIndex
} from '../src/lib/calc/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'static', 'calc');

const db: ItemDatabase = JSON.parse(readFileSync(join(ROOT, 'src/lib/data/items.json'), 'utf8'));

/** Stats that describe the item rather than take part in the maths. */
const SKIP_STATS = new Set(['durability', 'max_durability', 'art_durability', 'art_max_durability']);

/** Pack stats are lifted onto named fields, so they must not also sum as effects. */
const PACK_STATS = new Set(['pack_size', 'pack_effectiveness', 'pack_inner_protection']);

const ATTACHMENT_SLOTS: readonly AttachmentSlot[] = [
	'barrel',
	'mag',
	'collimator_sights',
	'forend',
	'handgrips',
	'pistol_handle',
	'accessory',
	'other'
];

function name(i: Item, lang: Lang): string {
	return i.name[lang] ?? i.name.en ?? i.id;
}

/**
 * Upstream stores computed values at full float precision — `-4.1615996` for a
 * band the game shows as `-4.16`. Four decimals is two more than anything is
 * ever displayed with, and drops a third of the payload.
 */
function round(v: number): number {
	return Number(v.toFixed(4));
}

function roundRanges(o: Record<string, StatRange>): Record<string, StatRange> {
	const out: Record<string, StatRange> = {};
	for (const [k, r] of Object.entries(o)) out[k] = { min: round(r.min), max: round(r.max) };
	return out;
}

/** Numeric stats worth summing: no weight (tracked on its own), no descriptive fields. */
function effectStats(stats: Record<string, number>, extraSkip = PACK_STATS): Record<string, number> {
	const out: Record<string, number> = {};
	for (const [k, v] of Object.entries(stats)) {
		if (k === 'weight' || SKIP_STATS.has(k) || extraSkip.has(k)) continue;
		out[k] = round(v);
	}
	return out;
}

/** Every stat slug the emitted payload actually mentions, so only those ship metadata. */
class SlugSet {
	readonly slugs = new Set<string>();
	note(o: Record<string, unknown>): void {
		for (const k of Object.keys(o)) this.slugs.add(k);
	}
	meta(lang: Lang): Record<string, CalcStatMeta> {
		const out: Record<string, CalcStatMeta> = {};
		for (const slug of [...this.slugs].sort()) {
			const m = db.stats[slug];
			if (!m) continue;
			out[slug] = { label: m.label[lang] ?? m.label.en ?? slug, unit: m.unit, signed: m.signed };
		}
		return out;
	}
}

function levelStats(i: Item): Record<string, Record<string, number>> {
	const out: Record<string, Record<string, number>> = {};
	for (const v of i.variants) {
		const s = effectStats(v.stats);
		if (Object.keys(s).length) out[String(v.level)] = s;
	}
	return out;
}

function levelRanges(i: Item): Record<string, Record<string, StatRange>> {
	const out: Record<string, Record<string, StatRange>> = {};
	for (const v of i.variants) {
		if (Object.keys(v.ranges).length) out[String(v.level)] = roundRanges(v.ranges);
	}
	return out;
}

function buildGear(lang: Lang): GearIndex {
	const seen = new SlugSet();

	const armor: CalcArmor[] = db.items
		.filter((i) => i.group === 'armor' && i.kind !== 'device')
		.map((i) => {
			const stats = effectStats(i.stats);
			const levels = levelStats(i);
			seen.note(stats);
			for (const l of Object.values(levels)) seen.note(l);
			return {
				id: i.id,
				name: name(i, lang),
				icon: i.icon,
				rank: i.rank,
				kind: i.kind,
				weight: round(i.stats.weight ?? 0),
				stats,
				levels
			};
		});

	const containers: CalcContainer[] = db.items
		.filter((i) => i.group === 'containers' || i.group === 'backpacks')
		.map((i) => {
			const stats = effectStats(i.stats);
			seen.note(stats);
			return {
				id: i.id,
				name: name(i, lang),
				icon: i.icon,
				rank: i.rank,
				kind: i.kind,
				weight: round(i.stats.weight ?? 0),
				group: i.group as 'containers' | 'backpacks',
				size: round(i.stats.pack_size ?? 0),
				// upstream stores these as computed floats — a container whose
				// protection reads "60.000004%" is upstream's arithmetic, not a
				// meaningful sixth decimal place
				effectiveness: round(i.stats.pack_effectiveness ?? 100),
				protection: round(i.stats.pack_inner_protection ?? 0),
				stats
			};
		});

	const artefacts: CalcArtefact[] = db.items
		.filter((i) => i.group === 'artefact')
		.map((i) => {
			// base_price is catalogue trivia, not an effect
			const stats = effectStats(i.stats, new Set([...PACK_STATS, 'base_price']));
			const levels = levelRanges(i);
			seen.note(stats);
			seen.note(i.ranges);
			for (const l of Object.values(levels)) seen.note(l);
			return {
				id: i.id,
				name: name(i, lang),
				icon: i.icon,
				rank: i.rank,
				kind: i.kind,
				weight: round(i.stats.weight ?? 0),
				ranges: roundRanges(i.ranges),
				stats,
				levels
			};
		});

	const buffs: CalcBuff[] = db.items
		.filter((i) => i.group === 'supply' || i.group === 'medicine')
		.map((i) => {
			const stats = effectStats(
				i.stats,
				new Set([...PACK_STATS, 'base_price', 'med_duration', 'med_cooldown', 'med_priority'])
			);
			seen.note(stats);
			return {
				id: i.id,
				name: name(i, lang),
				icon: i.icon,
				rank: i.rank,
				kind: i.kind,
				weight: round(i.stats.weight ?? 0),
				group: i.kind,
				duration: round(i.stats.med_duration ?? 0),
				cooldown: round(i.stats.med_cooldown ?? 0),
				stats
			};
		})
		// a consumable with no effect is a crafting ingredient, not a buff
		.filter((b) => Object.keys(b.stats).length > 0);

	return { lang, stats: seen.meta(lang), armor, containers, artefacts, buffs };
}

function buildWeapons(lang: Lang): WeaponIndex {
	const seen = new SlugSet();

	const attachments: CalcAttachment[] = db.items
		.filter((i) => i.group === 'attachment')
		.map((i) => {
			const stats = effectStats(i.stats);
			seen.note(stats);
			const slot = (ATTACHMENT_SLOTS as readonly string[]).includes(i.kind)
				? (i.kind as AttachmentSlot)
				: 'other';
			return {
				id: i.id,
				name: name(i, lang),
				icon: i.icon,
				rank: i.rank,
				kind: i.kind,
				weight: round(i.stats.weight ?? 0),
				slot,
				stats
			};
		});

	const attachmentIds = new Set(attachments.map((a) => a.id));

	const weapons: CalcWeapon[] = db.items
		.filter((i) => i.group === 'weapon')
		.map((i) => {
			const stats = effectStats(i.stats);
			const levels = levelStats(i);
			seen.note(stats);
			for (const l of Object.values(levels)) seen.note(l);

			const damageLevels: Record<string, CalcWeapon['damage']> = {};
			for (const v of i.variants) if (v.damage) damageLevels[String(v.level)] = v.damage;

			const ammoKey = i.enums.ammo_type;
			return {
				id: i.id,
				name: name(i, lang),
				icon: i.icon,
				rank: i.rank,
				kind: i.kind,
				weight: round(i.stats.weight ?? 0),
				stats,
				damage: i.damage,
				levels,
				damageLevels,
				// upstream records compatibility on the attachment; build-items mirrors
				// it, so this side is populated too. Skins and paints ride the same
				// list and are filtered out here.
				fits: i.compatible.filter((id) => attachmentIds.has(id)),
				ammo: ammoKey ? (db.enumLabels[ammoKey]?.[lang] ?? db.enumLabels[ammoKey]?.en ?? null) : null
			};
		});

	return { lang, stats: seen.meta(lang), weapons, attachments };
}

mkdirSync(OUT, { recursive: true });

const sizes: string[] = [];
for (const lang of LANGS) {
	const gear = buildGear(lang);
	const weapon = buildWeapons(lang);
	for (const [kind, payload] of [
		['gear', gear],
		['weapon', weapon]
	] as const) {
		const file = join(OUT, `${kind}.${lang}.json`);
		const json = JSON.stringify(payload);
		writeFileSync(file, json);
		if (lang === 'en') {
			const raw = (statSync(file).size / 1024).toFixed(0);
			const gz = (gzipSync(json).length / 1024).toFixed(0);
			sizes.push(`${kind} ${raw} KB (${gz} KB gzipped)`);
		}
	}
}

const gear = buildGear('en');
const weapon = buildWeapons('en');
const unreachable = weapon.weapons.filter((w) => w.fits.length === 0).length;

console.log(
	`[calc] gear: ${gear.armor.length} armour, ${gear.containers.length} containers, ` +
		`${gear.artefacts.length} artefacts, ${gear.buffs.length} buffs`
);
console.log(
	`[calc] weapons: ${weapon.weapons.length} (${unreachable} take no attachment), ` +
		`${weapon.attachments.length} attachments`
);
console.log(`[calc] ${LANGS.length} languages × 2 files — en ${sizes.join(', ')}`);
