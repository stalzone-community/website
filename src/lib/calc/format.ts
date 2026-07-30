/**
 * Rendering a calculated number.
 *
 * `items.ts` has `formatStat` for catalogue values, but those are upstream's
 * own — already rounded, already signed the way the game shows them. These are
 * results of arithmetic, so they need rounding decided here, and a sign shown
 * whenever the direction is the point (a stat that reduces radiation reads
 * `-4.08`, not `4.08`).
 */
import type { CalcStatMeta } from './types.ts';

const LOCALE: Record<string, string> = { ko: 'ko-KR' };

/** Two decimals, except for values small enough that two would read as zero. */
export function roundForDisplay(value: number): number {
	if (value === 0) return 0;
	if (Math.abs(value) < 0.01) return Number(value.toPrecision(2));
	return Number(value.toFixed(2));
}

export function formatValue(
	value: number,
	meta: CalcStatMeta | undefined,
	lang = 'en',
	{ sign = false }: { sign?: boolean } = {}
): string {
	const rounded = roundForDisplay(value);
	const showSign = (sign || meta?.signed) && rounded > 0 ? '+' : '';
	const num = rounded.toLocaleString(LOCALE[lang] ?? lang, { maximumFractionDigits: 4 });
	if (!meta?.unit) return `${showSign}${num}`;
	// "%" and "°" sit tight against the number; word units get a space
	const tight = meta.unit === '%' || meta.unit === '°';
	return `${showSign}${num}${tight ? '' : ' '}${meta.unit}`;
}

/** `art_bullet_dmg_factor` with no metadata still has to render as something. */
export function statLabel(slug: string, meta: CalcStatMeta | undefined): string {
	return meta?.label ?? slug.replace(/^art_/, '').replace(/_/g, ' ');
}

/** Seconds as the game states buff durations: `30 min`, `4 min 30 s`, `45 s`. */
export function formatDuration(seconds: number): string {
	if (!seconds) return '—';
	const m = Math.floor(seconds / 60);
	const s = Math.round(seconds % 60);
	if (!m) return `${s} s`;
	return s ? `${m} min ${s} s` : `${m} min`;
}
