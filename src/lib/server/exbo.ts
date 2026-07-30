/**
 * The EXBO API client.
 *
 * WHICH API THIS TALKS TO
 *
 * EXBO run two hosts with the same routes and the same response shapes:
 *
 *   dapi.stalzone.com   demo   — open, no approval, **synthetic data**
 *   eapi.stalzone.com   prod   — needs a manually approved application
 *
 * Production access is still pending (see ../../../api-application.md), so the
 * default here is the demo host, with the credentials EXBO publish in their own
 * documentation. That is a deliberate trade: the demo host returns a fixture —
 * ten sales, prices cycling 1000/2000/3000/4000/0 at fifteen-minute intervals,
 * identical for every item id — so the *numbers* are worth nothing, but the
 * *plumbing* is real. Auth, item-id validation, response shape, error codes,
 * timeouts and the aggregation on top of it are all exercised against the actual
 * API rather than against a generator of ours, which is the part that has to be
 * right on the day the production key arrives.
 *
 * Nothing about the demo tier is special-cased below except `tier()`, which the
 * page reads so the chart can label where its numbers came from. Approval is
 * then a matter of setting EXBO_API_BASE and the two credentials — no code.
 *
 * Config, all optional, all read from `process.env` for the same reason the rest
 * of `$lib/server` does (one module, SvelteKit server and plain-node scripts):
 *
 *   EXBO_API_BASE       host to call. Default: the demo host.
 *   EXBO_CLIENT_ID      \ sent as the documented `Client-Id` / `Client-Secret`
 *   EXBO_CLIENT_SECRET  / header pair. Default: EXBO's published demo pair.
 *   EXBO_REGION         region to price against. Default: EU.
 *
 * The credentials double as the sign-in app's (see routes/auth/exbo) — the same
 * application owns both — but sign-in deliberately refuses to run on the demo
 * pair, because a demo login is meaningless. Reading prices on it is not.
 */
import { isRegionId, type RegionId } from '../regions.ts';

const DEMO_BASE = 'https://dapi.stalzone.com';

/**
 * Published at https://eapi.stalcraft.net/overview.html under "Demo API", for
 * exactly this use. Not a secret and not ours: `client_id` 1 is EXBO's own demo
 * application, it only reaches the fixture host, and it is in their docs in
 * plain text. Kept inline rather than in `.env` so a fresh checkout renders the
 * auction page with no setup at all.
 */
const DEMO_CREDENTIALS = { id: '1', secret: 'E98cm6J9NNjTQopph0c2eIXNKafg4R1Cjz0TZh2D' };

/** Long enough for a slow round trip, short enough not to hold an SSR render. */
const TIMEOUT_MS = 4_000;

export type ApiTier = 'demo' | 'production';

export function apiBase(): string {
	return (process.env.EXBO_API_BASE || DEMO_BASE).replace(/\/+$/, '');
}

/**
 * Which host we are pointed at. Derived from the base URL rather than from a
 * flag of its own, so there is exactly one thing to change on approval and no
 * way to end up claiming live data while still calling the fixture.
 */
export function tier(): ApiTier {
	return apiBase() === DEMO_BASE ? 'demo' : 'production';
}

export function region(): RegionId {
	const configured = process.env.EXBO_REGION;
	return isRegionId(configured) ? configured : 'EU';
}

/**
 * The credentials are chosen by host, not by what happens to be in the
 * environment, and the two are not interchangeable: the demo host only knows the
 * demo application, and production answers the demo pair with a 401 (verified —
 * see RESEARCH.md).
 *
 * Keying off the host closes a trap that would otherwise be easy to walk into.
 * EXBO_CLIENT_ID / EXBO_CLIENT_SECRET are also the sign-in application's, so
 * filling them in for "Sign in with EXBO" would, on any other rule, start sending
 * production credentials to the demo host — and the only symptom would be the
 * price chart quietly going back to generated numbers.
 */
function credentials(): { id: string; secret: string } {
	if (tier() === 'demo') return DEMO_CREDENTIALS;

	const id = process.env.EXBO_CLIENT_ID;
	const secret = process.env.EXBO_CLIENT_SECRET;
	if (!id || !secret) {
		throw new ExboError('EXBO_CLIENT_ID / EXBO_CLIENT_SECRET are not set', 'unconfigured');
	}
	return { id, secret };
}

export type ExboFailure =
	/** no usable credentials for the configured host */
	| 'unconfigured'
	/** the API rejected our credentials */
	| 'unauthorized'
	/** the API does not know this item id */
	| 'unknown-item'
	/** timed out, DNS, connection reset */
	| 'unreachable'
	/** reached it, got something we cannot use */
	| 'bad-response';

export class ExboError extends Error {
	readonly failure: ExboFailure;
	readonly status?: number;

	constructor(message: string, failure: ExboFailure, status?: number) {
		super(message);
		this.name = 'ExboError';
		this.failure = failure;
		this.status = status;
	}
}

/** `GET /{region}/auction/{item}/history` — one completed sale per entry. */
export interface SaleEntry {
	/** items in the lot that sold */
	amount: number;
	/** what the lot went for; see `unitPrice` in $lib/auction */
	price: number;
	/** ISO-8601, UTC */
	time: string;
}

export interface SaleHistory {
	/** sales the API holds for this item, which can exceed `sales.length` */
	total: number;
	sales: SaleEntry[];
}

/**
 * A short-lived response cache.
 *
 * The auction page is server-rendered per request, so without this a held-down
 * reload key is one upstream call per keypress. Sixty seconds is well under the
 * rate at which a market moves and takes the common case — a visitor opening
 * the tab, reading it, and switching item level — down to one call.
 *
 * In-memory and per-process on purpose. The durable copy of this data belongs in
 * the `auction` collection (see db.ts), written by a poller on a schedule; this
 * is only a throttle in front of the upstream host, so losing it on deploy or
 * having two of them behind two machines costs nothing.
 */
const TTL_MS = 60_000;
const MAX_ENTRIES = 500;
const cache = new Map<string, { at: number; value: unknown }>();

/** For tests and for `db:seed`-style scripts that want a fresh read. */
export function clearCache(): void {
	cache.clear();
}

async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;

	const value = await fetcher();

	// Cheapest possible eviction: the keys are item ids, so there is no hot set
	// worth protecting and a crawl would otherwise grow this without bound.
	if (cache.size >= MAX_ENTRIES) cache.clear();
	cache.set(key, { at: Date.now(), value });

	return value;
}

async function get(path: string, signal?: AbortSignal): Promise<unknown> {
	const { id, secret } = credentials();
	let response: Response;
	try {
		response = await fetch(`${apiBase()}${path}`, {
			headers: { 'Client-Id': id, 'Client-Secret': secret, accept: 'application/json' },
			signal: signal ?? AbortSignal.timeout(TIMEOUT_MS)
		});
	} catch {
		throw new ExboError(`${apiBase()}${path} could not be reached`, 'unreachable');
	}

	if (!response.ok) {
		// 400 here means "no such item", not "bad request from us": the API
		// validates the id against its own catalogue, which is a different
		// snapshot from the one we vendored. Worth telling apart from a real
		// failure — one is data drift, the other is broken.
		const failure: ExboFailure =
			response.status === 400
				? 'unknown-item'
				: response.status === 401 || response.status === 403
					? 'unauthorized'
					: 'bad-response';
		throw new ExboError(`${path} returned ${response.status}`, failure, response.status);
	}

	try {
		return await response.json();
	} catch {
		throw new ExboError(`${path} did not return JSON`, 'bad-response', response.status);
	}
}

function isEntry(value: unknown): value is SaleEntry {
	if (!value || typeof value !== 'object') return false;
	const e = value as Record<string, unknown>;
	return typeof e.price === 'number' && typeof e.time === 'string';
}

/**
 * Completed sales for one item, newest first (the order the API returns).
 *
 * `limit` is the API's own cap on entries. 200 is a fortnight or so of a busy
 * item and a single response; the demo host ignores it and always returns its
 * ten fixture rows.
 */
export async function saleHistory(
	itemId: string,
	opts: { region?: RegionId; limit?: number; signal?: AbortSignal } = {}
): Promise<SaleHistory> {
	const r = opts.region ?? region();
	const limit = opts.limit ?? 200;

	return cached(`history|${apiBase()}|${r}|${itemId}|${limit}`, async () => {
		const body = await get(
			`/${r}/auction/${encodeURIComponent(itemId)}/history?limit=${limit}`,
			opts.signal
		);

		if (!body || typeof body !== 'object') {
			throw new ExboError('history response was not an object', 'bad-response');
		}
		const { total, prices } = body as { total?: unknown; prices?: unknown };
		if (!Array.isArray(prices)) {
			throw new ExboError('history response had no `prices` array', 'bad-response');
		}

		return {
			total: typeof total === 'number' ? total : prices.length,
			sales: prices.filter(isEntry)
		};
	});
}

/**
 * `GET /{region}/auction/{item}/lots` — one currently listed lot per entry.
 *
 * The other half of the auction, and the half a player can act on: completed
 * sales say what the thing has been worth, active lots say what it costs right
 * now.
 */
export interface Lot {
	itemId: string;
	/** items in this lot; the prices below are for the lot, not for one item */
	amount: number;
	/** opening bid */
	startPrice: number;
	/** highest bid so far. Absent until someone bids. */
	currentPrice?: number;
	/** buy-it-now. Absent when the seller listed it as an auction only. */
	buyoutPrice?: number;
	/** ISO-8601, UTC */
	startTime: string;
	/** ISO-8601, UTC — when the listing expires */
	endTime: string;
	/**
	 * Per-item extras the API attaches to a lot (quality, upgrade level). Empty
	 * on the demo host for every item, so its real shape is unknown until
	 * production access — hence `unknown`, not a guessed interface.
	 */
	additional?: Record<string, unknown>;
}

export interface ActiveLots {
	/** lots currently listed, which can exceed `lots.length` */
	total: number;
	lots: Lot[];
}

/**
 * The sort keys the API accepts, discovered by handing it an invalid one — it
 * answers with the enum. They are documented nowhere else I could find, so this
 * list is the record of it.
 */
export type LotSort = 'buyout_price' | 'time_left' | 'time_created' | 'current_price';

function isLot(value: unknown): value is Lot {
	if (!value || typeof value !== 'object') return false;
	const l = value as Record<string, unknown>;
	return typeof l.startPrice === 'number' && typeof l.endTime === 'string';
}

/**
 * Currently listed lots for one item.
 *
 * Sorted by cheapest buyout by default, because the first row then answers the
 * question people actually arrive with: what does one cost right now. `limit` is
 * kept small for the same reason — nobody reads the 40th most expensive lot, and
 * `total` already carries how many exist.
 */
export async function activeLots(
	itemId: string,
	opts: {
		region?: RegionId;
		limit?: number;
		sort?: LotSort;
		order?: 'asc' | 'desc';
		signal?: AbortSignal;
	} = {}
): Promise<ActiveLots> {
	const r = opts.region ?? region();
	const limit = opts.limit ?? 20;
	const sort = opts.sort ?? 'buyout_price';
	const order = opts.order ?? 'asc';

	return cached(`lots|${apiBase()}|${r}|${itemId}|${limit}|${sort}|${order}`, async () => {
		const body = await get(
			`/${r}/auction/${encodeURIComponent(itemId)}/lots` +
				`?limit=${limit}&sort=${sort}&order=${order}&additional=true`,
			opts.signal
		);

		if (!body || typeof body !== 'object') {
			throw new ExboError('lots response was not an object', 'bad-response');
		}
		const { total, lots } = body as { total?: unknown; lots?: unknown };
		if (!Array.isArray(lots)) {
			throw new ExboError('lots response had no `lots` array', 'bad-response');
		}

		return {
			total: typeof total === 'number' ? total : lots.length,
			lots: lots.filter(isLot)
		};
	});
}
