/**
 * Steam player numbers for the overview page.
 *
 * Two upstreams, because neither one answers both questions:
 *
 *   SteamCharts   `/app/<id>/chart-data.json`   ~30 days of hourly samples,
 *                                               which is the chart's history.
 *   Steam Web API `GetNumberOfCurrentPlayers`   the number right now, official
 *                                               and keyless.
 *
 * The last SteamCharts point can be the better part of an hour old, so the
 * headline "in game now" comes from Steam itself rather than from the tail of
 * the series. Two cheap GETs, both cached, and the page renders whichever of
 * them came back — see `steamActivity()` at the bottom.
 *
 * WHY THIS FAILS QUIETLY
 *
 * Every path here returns null instead of throwing. The overview page is the
 * item database's front door; a third-party chart host having a bad afternoon
 * must cost it a widget, not a 500. The loader treats null as "no chart".
 *
 * CACHING
 *
 * `cacheState` from commons, with a stale window: past the TTL a visitor is
 * served the old value immediately while a refresh runs behind them, and only a
 * genuinely expired entry makes anyone wait. The alternative — every visitor
 * after minute 20 blocking on a cross-internet fetch — is the whole reason that
 * helper exists.
 *
 * In-memory and per-process on purpose, same as the EXBO client: this is a
 * throttle in front of someone else's host, not a store. Two machines meaning
 * two callers is fine at this volume.
 */
import { cacheState } from 'sveltekit-commons/cache';
import {
	ACTIVITY_DAYS,
	parseChartData,
	series,
	STEAM_APPID,
	summarise,
	type ActivityTimeline,
	type SteamSample
} from '../steam.ts';

const CHART_URL = `https://steamcharts.com/app/${STEAM_APPID}/chart-data.json`;
const LIVE_URL =
	`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${STEAM_APPID}`;

/**
 * SteamCharts publishes no rate limit, so the polite reading is a low one: the
 * series only moves hourly, and 20 minutes means three requests an hour for the
 * whole site however many people are reading it.
 */
const HISTORY_TTL_MS = 20 * 60 * 1000;
/** The live count is the one number that should feel live. */
const LIVE_TTL_MS = 60 * 1000;
/**
 * How long a stale value keeps being served while the refresh runs. Generous on
 * purpose: an hour-old point on a seven-day chart is invisible, and an outage
 * that lasts a few hours should degrade the chart's freshness, not remove it.
 */
const STALE_MS = 6 * 60 * 60 * 1000;

/** Short — this runs inside an SSR render that a visitor is waiting on. */
const TIMEOUT_MS = 4_000;

interface Entry<T> {
	at: number;
	value: T;
}

const store = new Map<string, Entry<unknown>>();
/** Refreshes already in flight, so a burst of renders makes one request. */
const inflight = new Map<string, Promise<unknown>>();

/** For tests and for scripts that want a fresh read. */
export function clearSteamCache(): void {
	store.clear();
	inflight.clear();
}

/**
 * Stale-while-revalidate around one upstream call.
 *
 * A failed refresh does NOT evict: the old value keeps being served and the
 * next visitor retries. Dropping a good-enough series because one request timed
 * out is how a widget disappears for an hour over a blip.
 */
async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T | null> {
	const hit = store.get(key) as Entry<T> | undefined;
	const state = hit ? cacheState(Date.now() - hit.at, ttl, STALE_MS) : 'expired';
	if (hit && state === 'fresh') return hit.value;

	const refresh = (inflight.get(key) ??
		load()
			.then((value) => {
				store.set(key, { at: Date.now(), value });
				return value;
			})
			.finally(() => inflight.delete(key))) as Promise<T>;
	inflight.set(key, refresh);

	// stale: hand back what we have and let the refresh land behind the render
	if (hit && state === 'stale') {
		void refresh.catch(() => {});
		return hit.value;
	}
	try {
		return await refresh;
	} catch {
		// expired but present beats nothing at all
		return hit ? hit.value : null;
	}
}

async function getJson(url: string): Promise<unknown> {
	const response = await fetch(url, {
		headers: { accept: 'application/json' },
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	if (!response.ok) throw new Error(`${url} returned ${response.status}`);
	return response.json();
}

/** The trailing history, oldest first. Null when it could not be read at all. */
export async function playerHistory(): Promise<SteamSample[] | null> {
	return cached('steam:history', HISTORY_TTL_MS, async () => {
		const samples = parseChartData(await getJson(CHART_URL));
		// An empty parse is a broken payload, not a game with no history — throw,
		// so a previously good series is kept rather than overwritten with [].
		if (!samples.length) throw new Error('steamcharts returned no usable points');
		return samples;
	});
}

/** Concurrent players right now, from Steam. Null when unavailable. */
export async function playersNow(): Promise<number | null> {
	return cached('steam:live', LIVE_TTL_MS, async () => {
		const body = await getJson(LIVE_URL);
		const response = (body as { response?: { player_count?: unknown; result?: unknown } })?.response;
		// result 1 is Steam's own "this appid has a count"; anything else is a
		// valid response saying it does not, which must not be cached as 0
		if (response?.result !== 1) throw new Error('steam returned no player count');
		const count = Number(response.player_count);
		if (!Number.isFinite(count) || count < 0) throw new Error('steam returned a bad player count');
		return Math.round(count);
	});
}

export interface SteamActivity {
	timeline: ActivityTimeline;
	/** Concurrent players right now, or null if only the history came back. */
	now: number | null;
	peak: number;
	average: number;
	days: number;
}

/**
 * Everything the overview widget needs, or null when there is no history to
 * draw. The live count is allowed to be missing on its own — a chart with no
 * headline number still says something; a headline number with no chart does
 * not justify the section.
 */
export async function steamActivity(now = Date.now()): Promise<SteamActivity | null> {
	const [samples, live] = await Promise.all([playerHistory(), playersNow()]);
	if (!samples) return null;

	const timeline = series(samples, now, ACTIVITY_DAYS);
	if (!timeline.values.length) return null;

	return { timeline, now: live, ...summarise(timeline), days: ACTIVITY_DAYS };
}
