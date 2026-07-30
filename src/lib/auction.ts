/**
 * Auction price history: the series the chart draws, and how it is built.
 *
 * WHERE THE NUMBERS COME FROM
 *
 * `GET /{region}/auction/{item}/history` returns completed sales, one entry per
 * sale. `aggregate` turns that list into the chart's series. Which host answered
 * decides how much the numbers mean, and `PriceHistory.source` carries that all
 * the way to the caption:
 *
 *   'live'    production API. Real market.
 *   'demo'    EXBO's demo host. Real endpoint, real shape, fixture numbers —
 *             the same ten sales for every item in the game.
 *   'sample'  no API at all: `samplePriceHistory` below. Only reached when the
 *             endpoint is unreachable, unconfigured, or does not know the item.
 *
 * The chart must never present the last two as a market, and the component is
 * given no way to guess — it is told.
 *
 * Pure and dependency-free so node:test can load it, same rule as $lib/items.
 * Everything that touches the network lives in $lib/server/exbo.
 */

/** One completed sale, as the API reports it. Mirrors exbo's `SaleEntry`. */
export interface Sale {
	amount: number;
	price: number;
	time: string;
}

export interface PricePoint {
	/** epoch ms at the start of the bucket */
	at: number;
	low: number;
	median: number;
	high: number;
	/** sales in the bucket — the confidence behind the median */
	sales: number;
}

export type PriceSource = 'live' | 'demo' | 'sample';

export interface PriceHistory {
	/** oldest first; the chart maps `at` to x, so gaps stay gaps */
	points: PricePoint[];
	currency: string;
	source: PriceSource;
	/** bucket width in ms, so the chart can say what a point is */
	bucketMs: number;
	/**
	 * epoch ms the series was built at. Sent from the server rather than read
	 * from the client clock: every label in the chart is relative ("3 h ago"),
	 * and a value computed twice — once in SSR, once at hydration — would render
	 * two different strings for the same point.
	 */
	fetchedAt: number;
	/** sales the API holds for the item, which can exceed what it returned */
	totalSales?: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Bucket widths, coarsest last. The demo host's ten sales span two hours, a busy
 * item's 200 sales can span a month, and both have to draw as something legible
 * — so the width is chosen from the window rather than fixed at "one day".
 */
const BUCKETS = [MINUTE, 15 * MINUTE, HOUR, 6 * HOUR, DAY, 7 * DAY] as const;

/** Most points we will draw; the narrowest width that fits the window wins. */
const MAX_POINTS = 40;

export function bucketFor(spanMs: number): number {
	for (const width of BUCKETS) if (spanMs / width <= MAX_POINTS) return width;
	return BUCKETS[BUCKETS.length - 1];
}

/**
 * Price per item, not per lot.
 *
 * `price` is the lot's price and `amount` the items in it, so a sale of four
 * plotted raw is a fourfold spike that never happened. Dividing makes sales
 * comparable, which is the only thing a price chart is for.
 *
 * This is the one field semantic taken on inference rather than from the docs —
 * EXBO document neither field, and the demo fixture cycles the two values
 * independently, so it cannot settle the question either. Confirm against a real
 * market on approval; if `price` turns out to be per item already, this becomes
 * the identity function and nothing else moves.
 */
export function unitPrice(sale: Sale): number {
	const amount = Number.isFinite(sale.amount) && sale.amount > 0 ? sale.amount : 1;
	return sale.price / amount;
}

function median(sorted: readonly number[]): number {
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface AggregateOptions {
	source: PriceSource;
	fetchedAt: number;
	currency?: string;
	totalSales?: number;
}

/**
 * Sales → chart series. Returns null when nothing usable survives, which the
 * caller treats the same as a failed request: there is no such thing as an empty
 * price chart, only a page that has to say it has no prices.
 */
export function aggregate(sales: readonly Sale[], opts: AggregateOptions): PriceHistory | null {
	const observations: { at: number; price: number }[] = [];
	for (const sale of sales) {
		const at = Date.parse(sale.time);
		const price = unitPrice(sale);
		// A sale at zero is not a price. The demo fixture emits them on a cycle,
		// and a real feed will eventually emit something equally unhelpful — in
		// either case one bad row must not drag a whole day's low down to nothing.
		if (Number.isFinite(at) && Number.isFinite(price) && price > 0) {
			observations.push({ at, price });
		}
	}
	if (!observations.length) return null;

	observations.sort((a, b) => a.at - b.at);
	const span = observations[observations.length - 1].at - observations[0].at;
	const bucketMs = bucketFor(span);

	const buckets = new Map<number, number[]>();
	for (const { at, price } of observations) {
		const key = Math.floor(at / bucketMs) * bucketMs;
		const bucket = buckets.get(key);
		if (bucket) bucket.push(price);
		else buckets.set(key, [price]);
	}

	const points: PricePoint[] = [...buckets.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([at, prices]) => {
			prices.sort((a, b) => a - b);
			return {
				at,
				low: Math.round(prices[0]),
				median: Math.round(median(prices)),
				high: Math.round(prices[prices.length - 1]),
				sales: prices.length
			};
		});

	return {
		points,
		currency: opts.currency ?? 'rub',
		source: opts.source,
		bucketMs,
		fetchedAt: opts.fetchedAt,
		totalSales: opts.totalSales
	};
}

/* ------------------------------------------------------------------------- *
 * Active lots
 *
 * The other half of the auction. History says what the item has been worth;
 * lots say what it costs right now, which is the question people arrive with.
 * ------------------------------------------------------------------------- */

/** One currently listed lot, as the API reports it. Mirrors exbo's `Lot`. */
export interface RawLot {
	amount: number;
	startPrice: number;
	currentPrice?: number;
	buyoutPrice?: number;
	startTime: string;
	endTime: string;
	/**
	 * Per-lot item state, returned because we ask with `additional=true`. Keys
	 * vary by item kind and by lot — a plain crafted item carries almost nothing,
	 * a rolled artefact carries most of them. Untyped here on purpose: this is
	 * whatever the API sent, and `lotAttributes` decides what we are willing to
	 * claim about it.
	 */
	additional?: Record<string, unknown>;
}

/**
 * The part of a lot's `additional` block we are prepared to put on screen.
 *
 * Deliberately a subset. The block also carries `ndmg`, `md_k`, `ptn` and
 * `stats_random`, whose meanings are not documented and which we would be
 * guessing at — an unlabelled number next to a price is worse than no number,
 * so they are parsed by nobody until somebody knows what they are.
 */
export interface LotAttributes {
	/** `qlt` — quality tier. 0 is the ordinary roll. */
	quality: number | null;
	/** `upgrade_bonus` — 0 on an un-upgraded item; a small fraction otherwise */
	upgradeBonus: number | null;
	/** `bonus_properties` — named rolls, e.g. MAX_WEIGHT_BONUS */
	bonuses: string[];
	/** `it_transf_count` — how many times this item has changed hands */
	transfers: number | null;
}

function whole(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * `additional` → what the table shows, or null when the lot says nothing worth
 * a column. Two artefacts of the same name can differ several-fold in price
 * purely on these, so a price list without them is comparing unlike things.
 */
export function lotAttributes(additional: unknown): LotAttributes | null {
	if (!additional || typeof additional !== 'object') return null;
	const a = additional as Record<string, unknown>;

	const bonuses = Array.isArray(a.bonus_properties)
		? a.bonus_properties.filter((b): b is string => typeof b === 'string')
		: [];
	const attrs: LotAttributes = {
		quality: whole(a.qlt),
		upgradeBonus: whole(a.upgrade_bonus),
		bonuses,
		transfers: whole(a.it_transf_count)
	};

	// A lot whose every attribute is the boring default earns no column. Quality
	// 0 with no upgrade and no bonuses is simply "an ordinary one of these", and
	// saying so on every row would bury the rows where it is not true.
	const interesting =
		(attrs.quality ?? 0) > 0 || (attrs.upgradeBonus ?? 0) > 0 || attrs.bonuses.length > 0;
	return interesting ? attrs : null;
}

/**
 * `MAX_WEIGHT_BONUS` → `Max weight bonus`.
 *
 * The vocabulary is the API's own and is not in the item database, so there is
 * nothing to look these up in. Expanding the two suffixes that recur keeps it
 * readable without inventing meanings for the names themselves.
 */
export function bonusLabel(name: string): string {
	const words = name
		.toLowerCase()
		.split('_')
		.map((w) => (w === 'acc' ? 'accumulation' : w));
	const text = words.join(' ');
	return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface LotRow {
	/** items in the lot */
	amount: number;
	/** buy-it-now for the whole lot, null when it is bid-only */
	buyout: number | null;
	/** the same per item — what you are actually paying */
	buyoutEach: number | null;
	/**
	 * Highest bid, or the opening price when nobody has bid yet. Null on a
	 * buy-it-now listing, which has no bidding side at all.
	 */
	bid: number | null;
	bidEach: number | null;
	/** true while `bid` is still just the seller's asking price */
	unbid: boolean;
	/** ms until the listing expires; already expired if negative */
	endsIn: number;
	/** quality, upgrade and rolled bonuses; null when this one is ordinary */
	attrs: LotAttributes | null;
}

export interface Market {
	/** cheapest per-item buyout first — the order the API was asked for */
	rows: LotRow[];
	/** lots listed for this item, which can exceed `rows.length` */
	total: number;
	/** items on offer across the returned rows */
	items: number;
	/** cheapest per-item buyout available now */
	cheapest: number | null;
	/** median per-item buyout across the returned rows */
	median: number | null;
	/** how many of the returned rows are bid-only, with no buyout */
	bidOnly: number;
	/**
	 * Whether any row has attributes worth showing. The table adds its item
	 * column only when this is true, so a page of plain ammunition does not grow
	 * a column of empty cells to accommodate the one item kind that rolls.
	 */
	hasAttrs: boolean;
	source: PriceSource;
	fetchedAt: number;
}

export interface MarketOptions {
	source: PriceSource;
	fetchedAt: number;
	total?: number;
}

/**
 * Lots → the panel's model. Returns null when there is nothing listed, which is
 * a real and common answer for a thin item and reads better as "nothing on sale"
 * than as an empty table.
 *
 * Rows are kept in the order the API returned them (cheapest buyout first) rather
 * than re-sorted here: the API sorts across *all* lots, so re-sorting the first
 * twenty would only reorder an already-truncated slice.
 */
/**
 * A price the API is actually quoting, or null.
 *
 * The auction endpoint uses 0 to mean "this listing has no such price" instead
 * of leaving the field out, so a plain `typeof === 'number'` check reads an
 * absent buyout as a free item.
 */
function price(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function summariseLots(lots: readonly RawLot[], opts: MarketOptions): Market | null {
	const rows: LotRow[] = [];
	for (const lot of lots) {
		const amount = Number.isFinite(lot.amount) && lot.amount > 0 ? lot.amount : 1;
		const end = Date.parse(lot.endTime);

		const buyout = price(lot.buyoutPrice);
		const opening = price(lot.startPrice);
		const highest = price(lot.currentPrice);

		/* A lot needs ONE of the two prices, not an opening price specifically.
		   The API signals "this listing has no such price" with a 0 rather than by
		   omitting the field, and either side may be the missing one:

		     startPrice 0, buyoutPrice 125000   buy it now, no bidding
		     startPrice 1, buyoutPrice 0        bidding, no buy it now

		   Requiring `startPrice > 0` dropped every buy-it-now listing. Where an
		   item is listed that way exclusively — common on the thinner regions —
		   every row was filtered out, summariseLots returned null, and the panel
		   reported "nothing is listed for this item right now" over dozens of real
		   lots the API had just returned. */
		if (buyout === null && opening === null) continue;

		const bid = highest ?? opening;

		rows.push({
			amount,
			buyout,
			buyoutEach: buyout === null ? null : Math.round(buyout / amount),
			bid,
			bidEach: bid === null ? null : Math.round(bid / amount),
			// only claims "nobody has bid yet"; a buy-it-now lot is not unbid, it
			// has nothing to bid on
			unbid: bid !== null && highest === null,
			endsIn: Number.isFinite(end) ? end - opts.fetchedAt : 0,
			attrs: lotAttributes(lot.additional)
		});
	}
	if (!rows.length) return null;

	const buyouts = rows
		.map((r) => r.buyoutEach)
		.filter((p): p is number => p !== null)
		.sort((a, b) => a - b);

	return {
		rows,
		total: opts.total ?? rows.length,
		items: rows.reduce((n, r) => n + r.amount, 0),
		cheapest: buyouts.length ? buyouts[0] : null,
		median: buyouts.length ? Math.round(median(buyouts)) : null,
		bidOnly: rows.filter((r) => r.buyout === null).length,
		hasAttrs: rows.some((r) => r.attrs !== null),
		source: opts.source,
		fetchedAt: opts.fetchedAt
	};
}

/**
 * How far the cheapest thing on sale sits above what the item has recently been
 * selling for, as a percentage.
 *
 * The one number worth deriving from having both endpoints, and the reason it was
 * worth fetching both: a chart alone cannot say whether today's asks are a bargain
 * or a markup, and a lot list alone has nothing to compare against. Positive means
 * sellers are asking above the recent median.
 */
export function askSpread(cheapest: number | null, recentMedian: number | null): number | null {
	if (cheapest === null || !recentMedian) return null;
	return ((cheapest - recentMedian) / recentMedian) * 100;
}

/** The most recent bucket's median — what "recently sold for" means above. */
export function latestMedian(history: PriceHistory | null): number | null {
	if (!history?.points.length) return null;
	return history.points[history.points.length - 1].median;
}

/* ------------------------------------------------------------------------- *
 * Fallback series
 *
 * Reached only when the API cannot answer — unconfigured, unreachable, or an
 * item id its catalogue does not share with ours. It exists so the tab renders
 * something laid out correctly rather than an error, and the caption says
 * outright that the numbers are invented.
 *
 * Deterministic per item: a given id always draws the same curve, so a reload
 * does not redraw the page and a screenshot stays reproducible.
 * ------------------------------------------------------------------------- */

/** FNV-1a over the id, so the seed is spread rather than clustered by prefix. */
function seedFrom(text: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/** mulberry32 — small, fast, and good enough for a placeholder curve. */
function rng(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Rough market level when the catalogue has no `base_price` for the item. */
const RANK_LEVEL: Record<string, number> = {
	RANK_NEWBIE: 900,
	RANK_STALKER: 4_000,
	RANK_VETERAN: 18_000,
	RANK_MASTER: 70_000,
	RANK_LEGEND: 260_000
};

export interface SampleOptions {
	/** catalogue `base_price` when the item has one — anchors the curve */
	basePrice?: number;
	rank?: string;
	days?: number;
	/** epoch ms the newest point sits on. Passed in, never read off the clock. */
	now: number;
}

export function samplePriceHistory(id: string, opts: SampleOptions): PriceHistory {
	const { basePrice, rank, days = 30, now } = opts;
	const next = rng(seedFrom(id));

	// Auction prices run well above the vendor price; the multiplier is itself
	// per-item so every chart does not sit at the same ratio.
	const anchor = basePrice ?? RANK_LEVEL[rank ?? ''] ?? 2_500;
	let level = anchor * (2.2 + next() * 1.8);

	// Drift gives the series a direction so it does not read as pure noise, and
	// mean reversion keeps a 30-step walk from wandering an order of magnitude.
	const drift = (next() - 0.45) * 0.012;
	const volatility = 0.03 + next() * 0.05;
	const start = level;

	const points: PricePoint[] = [];
	for (let i = days - 1; i >= 0; i--) {
		level *= 1 + drift + (next() - 0.5) * volatility;
		level += (start - level) * 0.05;

		// The spread widens on thin days: fewer sales, less agreement on price.
		const sales = Math.max(1, Math.round(4 + next() * 26));
		const spread = (0.06 + 0.5 / sales) * level;
		const median = Math.round(level);
		points.push({
			at: now - i * DAY,
			median,
			low: Math.round(median - spread * (0.6 + next() * 0.5)),
			high: Math.round(median + spread * (0.6 + next() * 0.5)),
			sales
		});
	}

	return { points, currency: 'rub', source: 'sample', bucketMs: DAY, fetchedAt: now };
}

/** Percentage change across the window, for the headline beside the chart. */
export function priceChange(points: readonly PricePoint[]): number | null {
	if (points.length < 2) return null;
	const first = points[0].median;
	const last = points[points.length - 1].median;
	if (!first) return null;
	return ((last - first) / first) * 100;
}
