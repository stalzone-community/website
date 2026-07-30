import { error } from '@sveltejs/kit';
import { resolve } from '$lib/server/entities';
import {
	aggregate,
	latestMedian,
	samplePriceHistory,
	summariseLots,
	type Market,
	type PriceHistory
} from '$lib/auction';
import {
	activeLots,
	ExboError,
	region,
	saleHistory,
	tier,
	type ExboFailure
} from '$lib/server/exbo';
import { isRegionId, type RegionId } from '$lib/regions';

/**
 * The one route in the site that is not static.
 *
 * Everything else is prerendered from the vendored catalogue; prices are fetched
 * per request from the EXBO API. That is the reason the chart is a tab of its own
 * rather than a band on the overview — a live series cannot be baked at build
 * time, and it must not drag the other 2 310 stat pages off the static path with
 * it. The sublayout still prerenders, so only this tab costs a render.
 *
 * Which API answers depends on config, and today it is the demo host, whose
 * numbers are a fixture (see $lib/server/exbo). The shape, the auth, the item-id
 * check and the aggregation are real either way; `source` tells the page which it
 * got, and the caption says so.
 */
export const prerender = false;

/** Why the page is showing invented numbers, in words a visitor can read. */
const EXPLANATION: Record<ExboFailure, string> = {
	unconfigured: 'the auction API is not configured on this server',
	unauthorized: 'the auction API rejected this site’s credentials',
	'unknown-item': 'the auction API does not list this item',
	unreachable: 'the auction API did not respond',
	'bad-response': 'the auction API returned something unreadable'
};

export async function load({ params, setHeaders, cookies }) {
	const found = resolve(params.slug);
	if (!found) error(404, `Unknown entity "${params.slug}"`);

	// Bound-on-acquire items never reach the auction, so the sublayout does not
	// render this tab for them and nothing links here.
	if (!found.capabilities.auction) error(404, 'This item cannot be traded on the auction');

	const { item } = found;
	const now = Date.now();
	const source = tier() === 'production' ? 'live' : 'demo';

	/* The visitor's region, from the cookie the top-bar switcher writes. The
	   regions are separate markets with separate prices and very different depth
	   — RU carries several times EU's listings — so this is the difference
	   between a real answer and an empty table, not a formatting preference.
	   Falls back to the server's configured default when unset or tampered with;
	   `region()` validates against the known ids. */
	const stored = cookies.get('sz:region');
	const chosen: RegionId = isRegionId(stored) ? stored : region();

	/**
	 * Why the page is short of something, in words a visitor can read. A price
	 * chart is not worth a 500: every failure below degrades to what can still be
	 * shown, with the reason printed, because the endpoint being down must not
	 * take an item's page down with it.
	 */
	function explain(cause: unknown, what: string): string {
		if (cause instanceof ExboError) {
			// An id the API does not share with our catalogue is data drift, not a
			// fault, and there are 2 232 chances for it — not worth a log line each.
			if (cause.failure !== 'unknown-item') console.warn(`[auction] ${cause.message}`);
			return EXPLANATION[cause.failure];
		}
		console.warn(`[auction] unexpected failure fetching ${what}`, cause);
		return EXPLANATION['bad-response'];
	}

	// Both halves at once. They are independent — a thin item with no listings
	// still has a price history, and a dead lots endpoint should not cost us the
	// chart — so each settles on its own and neither can reject the other.
	const [historyResult, lotsResult] = await Promise.allSettled([
		saleHistory(item.id, { region: chosen }),
		activeLots(item.id, { region: chosen })
	]);

	let auction: PriceHistory | null = null;
	let reason: string | null = null;

	if (historyResult.status === 'fulfilled') {
		const { total, sales } = historyResult.value;
		auction = aggregate(sales, { source, fetchedAt: now, totalSales: total });
		if (!auction) reason = 'the auction API reported no completed sales for this item';
	} else {
		reason = explain(historyResult.reason, 'history');
	}

	if (!auction) {
		auction = samplePriceHistory(item.id, {
			basePrice: item.stats.base_price,
			rank: item.rank,
			now
		});
	}

	let market: Market | null = null;
	let marketReason: string | null = null;

	if (lotsResult.status === 'fulfilled') {
		const { total, lots } = lotsResult.value;
		market = summariseLots(lots, { source, fetchedAt: now, total });
		// Nothing listed is a real answer for a thin item, not a failure — and it
		// gets no generated stand-in, because inventing listings that cannot be
		// bought would be a worse lie than inventing a curve.
		if (!market) marketReason = 'nothing is listed for this item right now';
	} else {
		marketReason = explain(lotsResult.reason, 'lots');
	}

	/* Matches the client's TTL in exbo.ts: a reload inside the minute is served
	   without a round trip either way, so the page never looks fresher than the
	   cache behind it.

	   PRIVATE, not public: this response now varies by the sz:region cookie, and
	   a shared cache told it was public would hand one visitor's region to the
	   next — RU prices under an EU heading, from a cache we do not control and
	   cannot purge. `private` keeps the minute of browser caching and takes the
	   shared hop away. */
	setHeaders({ 'cache-control': 'private, max-age=60' });

	return {
		auction,
		reason,
		market,
		marketReason,
		// What the asks are compared against. Null when the chart is generated, so
		// the spread is never computed against invented numbers.
		recentMedian: auction.source === 'sample' ? null : latestMedian(auction),
		region: chosen
	};
}
