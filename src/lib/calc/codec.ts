/**
 * A build, in a URL.
 *
 * Sharing must not require saving. A build that lives in its own link can be
 * pasted into Discord before the account system exists, survives the database
 * being empty, and costs the server nothing to serve — so the URL is the
 * canonical representation and the database, when it arrives, stores this same
 * string.
 *
 * Not base64: item ids are already four or five URL-safe characters, so the
 * encoded form is both shorter and legible without it. A full six-artefact
 * build with a weapon fits in about 150 characters.
 *
 *   ?a=0r429-7&c=0nok&f=04yr-137.5-2-5_0abc-85-o-0&u=1r6z_9k2l&r=tb&d=2b&w=0r211-10-5f2a.91kk
 *
 * Separators are chosen so no field can swallow another: `-` between the fields
 * of one entry, `_` between entries, `.` only ever inside a number or a list of
 * ids. Quality is the reason — it is the one decimal value here, and an earlier
 * cut that used `.` between fields parsed `art1.137.5.2.5` into five fields.
 * All four are unreserved characters, so `URLSearchParams` leaves them alone
 * and the link stays readable.
 *
 * Decoding is total: anything malformed is dropped rather than thrown, because
 * a hand-edited link should lose the bad part and still open.
 */
import type { BuildState } from './build.ts';
import { clampLevel, clampQuality, RARITY_INDEX, type ArtefactSlot, type Rarity } from './artefact.ts';
import { MAX_BLEEDING } from './build.ts';
import { REACTION_STATS } from './keys.ts';
import type { WeaponState } from './weapon.ts';

/** Single letters for the four reactions, so `r=tb` means tear + burn. */
const REACTION_CODES: Readonly<Record<string, string>> = {
	art_reaction_to_tear: 't',
	art_reaction_to_electroshock: 'e',
	art_reaction_to_chemical_burn: 'c',
	art_reaction_to_burn: 'b'
};

const REACTION_BY_CODE = new Map(Object.entries(REACTION_CODES).map(([k, v]) => [v, k]));

const RARITY_BY_INDEX = new Map<string, Rarity>(
	Object.entries(RARITY_INDEX).map(([rarity, index]) => [
		index === null ? 'o' : String(index),
		rarity as Rarity
	])
);

function rarityCode(r: Rarity): string {
	const i = RARITY_INDEX[r];
	return i === null ? 'o' : String(i);
}

/** Ids are upstream's: lowercase alphanumeric. Anything else is not an id. */
const ID = /^[a-z0-9]+$/;

function isId(s: string): boolean {
	return ID.test(s);
}

/** Trailing zeros make links noisier without making them more precise. */
function num(n: number): string {
	return String(Number(n.toFixed(2)));
}

function toNumber(s: string | undefined, fallback: number): number {
	if (!s) return fallback;
	const n = Number(s);
	return Number.isFinite(n) ? n : fallback;
}

export interface EncodedBuild {
	build: BuildState;
	weapon: WeaponState | null;
}

export function encodeBuild(state: BuildState, weapon: WeaponState | null): URLSearchParams {
	const p = new URLSearchParams();

	if (state.armor && isId(state.armor.id)) {
		p.set('a', `${state.armor.id}-${clampLevel(state.armor.level)}`);
	}
	if (state.container && isId(state.container)) p.set('c', state.container);

	const artefacts = state.artefacts.filter((a) => isId(a.id));
	if (artefacts.length) {
		p.set(
			'f',
			artefacts
				.map(
					(a) =>
						`${a.id}-${num(clampQuality(a.quality))}-${rarityCode(a.rarity)}-${clampLevel(a.level)}`
				)
				.join('_')
		);
	}

	const buffs = state.buffs.filter(isId);
	if (buffs.length) p.set('u', buffs.join('_'));

	const reactions = state.reactions
		.filter((r) => r in REACTION_CODES)
		.map((r) => REACTION_CODES[r])
		.join('');
	if (reactions) p.set('r', reactions);

	const bleeding = Math.min(Math.max(Math.round(state.bleeding), 0), MAX_BLEEDING);
	if (bleeding || state.burning) p.set('d', `${bleeding}${state.burning ? 'b' : ''}`);

	if (weapon && isId(weapon.id)) {
		const attachments = weapon.attachments.filter(isId);
		p.set(
			'w',
			`${weapon.id}-${clampLevel(weapon.level)}${attachments.length ? `-${attachments.join('.')}` : ''}`
		);
	}

	return p;
}

export function decodeBuild(params: URLSearchParams): EncodedBuild {
	const build: BuildState = {
		armor: null,
		container: null,
		artefacts: [],
		buffs: [],
		reactions: [],
		bleeding: 0,
		burning: false
	};

	const a = params.get('a');
	if (a) {
		const [id, level] = a.split('-');
		if (isId(id)) build.armor = { id, level: clampLevel(toNumber(level, 0)) };
	}

	const c = params.get('c');
	if (c && isId(c)) build.container = c;

	const f = params.get('f');
	if (f) {
		for (const entry of f.split('_')) {
			const [id, quality, rarity, level] = entry.split('-');
			if (!id || !isId(id)) continue;
			const slot: ArtefactSlot = {
				id,
				quality: clampQuality(toNumber(quality, 100)),
				rarity: RARITY_BY_INDEX.get(rarity ?? 'o') ?? 'ordinary',
				level: clampLevel(toNumber(level, 0))
			};
			build.artefacts.push(slot);
		}
	}

	const u = params.get('u');
	if (u) build.buffs = u.split('_').filter(isId);

	const r = params.get('r');
	if (r) {
		const seen = new Set<string>();
		for (const code of r) {
			const slug = REACTION_BY_CODE.get(code);
			if (slug && REACTION_STATS.includes(slug)) seen.add(slug);
		}
		build.reactions = [...seen];
	}

	const d = params.get('d');
	if (d) {
		build.burning = d.includes('b');
		build.bleeding = Math.min(Math.max(toNumber(d.replace(/b/g, ''), 0), 0), MAX_BLEEDING);
	}

	let weapon: WeaponState | null = null;
	const w = params.get('w');
	if (w) {
		const [id, level, attachments] = w.split('-');
		if (isId(id)) {
			weapon = {
				id,
				level: clampLevel(toNumber(level, 0)),
				attachments: attachments ? attachments.split('.').filter(isId) : []
			};
		}
	}

	return { build, weapon };
}

/** The share link for a build, relative so it works on any host. */
export function buildHref(state: BuildState, weapon: WeaponState | null, path = '/builds/create'): string {
	const p = encodeBuild(state, weapon);
	const q = p.toString();
	return q ? `${path}?${q}` : path;
}
