/**
 * Steam concurrent players, as the overview chart needs it.
 *
 * WHERE THE HISTORY COMES FROM, AND WHY NOT FROM STEAM
 *
 * Steam's own API (`ISteamUserStats/GetNumberOfCurrentPlayers`) answers exactly
 * one question — how many people are in the game right now — and keeps no
 * history at all. A seven-day chart from that endpoint would mean polling it on
 * a schedule and storing every sample ourselves: a cron, a collection, an index,
 * and a chart that stays empty for a week after the first deploy.
 *
 * SteamCharts already does that polling, publicly, at
 * `https://steamcharts.com/app/<appid>/chart-data.json`. It returns
 * `[[epochMs, players], …]` — monthly averages for the old history, then roughly
 * hourly samples for the last ~30 days. The trailing window this chart draws
 * fits entirely inside the hourly stretch, so one cached GET replaces the whole
 * poller. `series()` below is what turns those pairs into fixed slots.
 *
 * SteamCharts is a third party with no documented API and no stated rate limit,
 * so the fetcher in `$lib/server/steam.ts` reads it once every 20 minutes for
 * the whole site and credits it on the page. If it ever goes away, the shape
 * that has to be replaced is `SteamSample[]` — everything below is arithmetic.
 *
 * Dependency-free (pattern: `$lib/items`) so node:test can load it directly and
 * the chart component can import the constants without pulling in server code.
 */

/** STALZONE on Steam. Confirmed against the store API — see RESEARCH.md. */
export const STEAM_APPID = 1818450;

/**
 * Chart resolution. One hour, because that is what the upstream samples are:
 * asking for half-hour slots the way UAR's replay chart does would interpolate
 * detail the source does not have.
 */
export const SLOT_MINUTES = 60;

/** How much of the trailing history the overview draws. */
export const ACTIVITY_DAYS = 7;

/** One upstream reading: when it was taken, and how many were in game. */
export interface SteamSample {
	/** epoch ms */
	at: number;
	players: number;
}

export interface ActivityTimeline {
	/** Epoch ms of the first slot's start; slot i covers start + i·SLOT_MINUTES. */
	start: number;
	/**
	 * Players in game per slot, oldest first. A slot the source never sampled
	 * carries the last known value rather than a zero — see `series()`.
	 */
	values: number[];
}

const SLOT_MS = SLOT_MINUTES * 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/**
 * Parse the SteamCharts payload defensively.
 *
 * It is untyped third-party JSON, so every pair is checked and anything that is
 * not two finite numbers is dropped. Negative counts and NaN would both survive
 * a naive `map`, and either one silently rescales the whole chart.
 */
export function parseChartData(raw: unknown): SteamSample[] {
	if (!Array.isArray(raw)) return [];
	const out: SteamSample[] = [];
	for (const row of raw) {
		if (!Array.isArray(row) || row.length < 2) continue;
		const at = Number(row[0]);
		const players = Number(row[1]);
		if (!Number.isFinite(at) || !Number.isFinite(players) || players < 0) continue;
		out.push({ at, players: Math.round(players) });
	}
	return out.sort((a, b) => a.at - b.at);
}

/**
 * Samples → one value per slot over the `days` before `now`.
 *
 * Three things happen here, and each is a decision:
 *
 * 1. **Slots are absolute**, keyed off the epoch rather than off `now`, so the
 *    same slot boundaries fall in the same places between two renders a minute
 *    apart. The chart labels them in the viewer's timezone client-side.
 *
 * 2. **Several samples in one slot average**, rather than the last winning. The
 *    upstream cadence drifts (samples land ~59–61 minutes apart), so two
 *    occasionally fall in the same hour and none in the next.
 *
 * 3. **An empty slot carries the previous value forward**, and the value before
 *    the first sample is carried backward from it. A gap in third-party polling
 *    is missing information, not a game with nobody in it — drawing it as zero
 *    puts a spike to the floor in the middle of an ordinary Tuesday. Slots are
 *    an hour wide and the source is hourly, so in practice this fills the odd
 *    single hole rather than inventing a shape.
 *
 * Returns an empty `values` when there is nothing in the window at all; the
 * page checks that and shows no chart rather than a flat line at zero.
 */
export function series(samples: SteamSample[], now: number, days = ACTIVITY_DAYS): ActivityTimeline {
	const endSlot = Math.ceil(now / SLOT_MS);
	const slots = Math.round((days * DAY_MS) / SLOT_MS);
	const start = (endSlot - slots) * SLOT_MS;

	const sums = new Array<number>(slots).fill(0);
	const counts = new Array<number>(slots).fill(0);
	let seen = 0;
	for (const s of samples) {
		const i = Math.floor((s.at - start) / SLOT_MS);
		if (i < 0 || i >= slots) continue;
		sums[i] += s.players;
		counts[i]++;
		seen++;
	}
	if (!seen) return { start, values: [] };

	const values = new Array<number>(slots);
	let last = -1;
	for (let i = 0; i < slots; i++) {
		if (counts[i]) last = values[i] = Math.round(sums[i] / counts[i]);
		else values[i] = last;
	}
	// backfill the head, which had no previous value to carry
	const first = values.findIndex((v) => v >= 0);
	for (let i = 0; i < first; i++) values[i] = values[first];

	return { start, values };
}

/** Peak and mean over a timeline, for the caption above the chart. */
export function summarise(t: ActivityTimeline): { peak: number; average: number } {
	if (!t.values.length) return { peak: 0, average: 0 };
	const peak = Math.max(...t.values);
	const average = Math.round(t.values.reduce((a, b) => a + b, 0) / t.values.length);
	return { peak, average };
}
