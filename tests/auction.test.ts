import test from 'node:test';
import assert from 'node:assert/strict';
import { capabilitiesOf, isAuctionable } from '../src/lib/entities.ts';
import {
	aggregate,
	askSpread,
	bucketFor,
	latestMedian,
	priceChange,
	samplePriceHistory,
	bonusLabel,
	lotAttributes,
	summariseLots,
	unitPrice,
	type RawLot,
	type Sale
} from '../src/lib/auction.ts';
import assembly from '../src/lib/data/assembly.json' with { type: 'json' };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A fixed clock: nothing under test may read the real one. */
const NOW = Date.UTC(2026, 6, 30, 12, 0, 0);

/** The demo host's actual response, which is what the site talks to today. */
function demoFixture(): Sale[] {
	const amounts = [1, 2, 3, 4];
	const prices = [1000, 2000, 3000, 4000, 0];
	return Array.from({ length: 10 }, (_, i) => ({
		amount: amounts[i % 4],
		price: prices[i % 5],
		time: new Date(NOW - i * 15 * MINUTE).toISOString()
	}));
}

test('only the bound-on-acquire statuses are untradeable', () => {
	assert.equal(isAuctionable('NONE'), true);
	assert.equal(isAuctionable('PERSONAL_ON_USE'), true);
	// The one worth pinning: NON_DROP means "kept on death", not "untradeable".
	// Every artefact carries it, and artefacts are the busiest market in game.
	assert.equal(isAuctionable('NON_DROP'), true);

	assert.equal(isAuctionable('PERSONAL_ON_GET'), false);
	assert.equal(isAuctionable('PERSONAL_DROP_ON_GET'), false);

	// Unknown status is not a licence to claim a market exists.
	assert.equal(isAuctionable(undefined), false);
	assert.equal(isAuctionable(null), false);
});

test('the auction capability follows status', () => {
	assert.equal(capabilitiesOf({ status: 'NON_DROP' }).auction, true);
	assert.equal(capabilitiesOf({ status: 'PERSONAL_ON_GET' }).auction, false);
	assert.equal(capabilitiesOf({}).auction, false);
});

test('gear bound on assembly is not auctionable, whatever its status says', () => {
	// The FN SCAR SSR case. Its status is PERSONAL_ON_USE, exactly like every
	// other weapon in the game, so status alone cannot exclude it — being
	// assembled from parts is the only thing that can.
	assert.equal(capabilitiesOf({ status: 'PERSONAL_ON_USE' }).auction, true);
	assert.equal(
		capabilitiesOf({ status: 'PERSONAL_ON_USE', boundOnAssembly: true }).auction,
		false
	);

	// Not assembled at all leaves status to decide, as it does for every other
	// weapon in the catalogue.
	assert.equal(
		capabilitiesOf({ status: 'PERSONAL_ON_USE', boundOnAssembly: false }).auction,
		true
	);

	// And it cannot resurrect something status already ruled out.
	assert.equal(
		capabilitiesOf({ status: 'PERSONAL_ON_GET', boundOnAssembly: false }).auction,
		false
	);
});

test('every assembled item is bound, not just those with a binding part', () => {
	// Scorpion EVO III is the case that widened the rule: its four parts are all
	// NON_DROP, which is not a bind — artefacts carry it and trade freely — yet
	// the assembled SMG is personal in game. Nothing in `status` predicts that, so
	// assembly itself is the signal and the generated flag has to say so for all
	// 39 groups. A regression here reads as "auction tab is back on Scorpion".
	const groups = (
		assembly as { groups: { gear: string; parts: string[]; boundOnAssembly: boolean }[] }
	).groups;

	const unbound = groups.filter((g) => !g.boundOnAssembly);
	assert.deepEqual(unbound, [], 'assembled from parts means bound');

	const scorpion = groups.find((g) => g.gear === '2od90');
	assert.ok(scorpion, 'Scorpion EVO III (2od90) must still resolve from its parts');
	assert.equal(scorpion.parts.length, 4);
	assert.equal(capabilitiesOf({ status: 'PERSONAL_ON_USE', boundOnAssembly: true }).auction, false);
});

test('assembly counts as crafting, so the parts link both ways', () => {
	// Upstream files no recipe for assembled gear, so `hasCrafting` is false for
	// both the rifle and its parts — without this the Crafting tab 404s and the
	// part→gear link we recovered is invisible.
	assert.equal(capabilitiesOf({ hasAssembly: true }).crafting, true);
	assert.equal(capabilitiesOf({ hasCrafting: true }).crafting, true);
	assert.equal(capabilitiesOf({}).crafting, false);
});

test('price is per item, not per lot', () => {
	assert.equal(unitPrice({ amount: 4, price: 4000, time: '' }), 1000);
	// A missing or nonsensical amount must not divide the price away.
	assert.equal(unitPrice({ amount: 0, price: 900, time: '' }), 900);
	assert.equal(unitPrice({ amount: NaN, price: 900, time: '' }), 900);
});

test('bucket width follows the window, so both a 2h and a 30d span stay legible', () => {
	// The demo fixture: ten sales over two and a quarter hours.
	assert.equal(bucketFor(9 * 15 * MINUTE), 15 * MINUTE);
	assert.equal(bucketFor(30 * DAY), DAY);
	// A single instant still yields the narrowest width rather than dividing by 0.
	assert.equal(bucketFor(0), MINUTE);
	// Nothing wider than the coarsest bucket, however long the window.
	assert.equal(bucketFor(10 * 365 * DAY), 7 * DAY);
});

test('aggregate turns the demo fixture into a chartable series', () => {
	const history = aggregate(demoFixture(), { source: 'demo', fetchedAt: NOW, totalSales: 10 });
	assert.ok(history);

	// Two of the ten fixture rows are priced 0, which is not a price.
	assert.equal(history.points.reduce((n, p) => n + p.sales, 0), 8);
	assert.equal(history.bucketMs, 15 * MINUTE);
	assert.equal(history.source, 'demo');
	assert.equal(history.totalSales, 10);
	assert.equal(history.fetchedAt, NOW);

	// Oldest first — the chart maps `at` to x and would draw backwards otherwise.
	for (let i = 1; i < history.points.length; i++) {
		assert.ok(history.points[i].at > history.points[i - 1].at);
	}
	for (const p of history.points) {
		assert.ok(p.low <= p.median && p.median <= p.high, 'band must contain the median');
		assert.ok(p.low > 0, 'no free items');
		assert.ok(Number.isInteger(p.median));
	}
});

test('aggregate buckets sales in the same window into one point', () => {
	const sales: Sale[] = [
		{ amount: 1, price: 100, time: new Date(NOW - 40 * DAY).toISOString() },
		{ amount: 1, price: 300, time: new Date(NOW - 2 * HOUR).toISOString() },
		{ amount: 1, price: 500, time: new Date(NOW - 1 * HOUR).toISOString() },
		{ amount: 2, price: 800, time: new Date(NOW).toISOString() }
	];
	// A 40-day window buckets by day, so the last three sales land on one day.
	const history = aggregate(sales, { source: 'live', fetchedAt: NOW });
	assert.ok(history);
	assert.equal(history.bucketMs, DAY);
	assert.equal(history.points.length, 2);

	const today = history.points[1];
	assert.equal(today.sales, 3);
	assert.equal(today.low, 300);
	assert.equal(today.median, 400, 'median of 300, 400 (=800/2) and 500');
	assert.equal(today.high, 500);
});

test('aggregate refuses to invent a chart out of nothing', () => {
	assert.equal(aggregate([], { source: 'live', fetchedAt: NOW }), null);
	// Every row unusable is the same as no rows: a zero-price feed is not a market.
	assert.equal(
		aggregate([{ amount: 1, price: 0, time: new Date(NOW).toISOString() }], {
			source: 'live',
			fetchedAt: NOW
		}),
		null
	);
	assert.equal(
		aggregate([{ amount: 1, price: 500, time: 'not a date' }], { source: 'live', fetchedAt: NOW }),
		null
	);
});

test('generated history is deterministic per item', () => {
	// The fallback must not redraw between two requests for the same page.
	const a = samplePriceHistory('7lnj7', { basePrice: 2400, now: NOW });
	const b = samplePriceHistory('7lnj7', { basePrice: 2400, now: NOW });
	assert.deepEqual(a, b);

	const other = samplePriceHistory('y1q9', { basePrice: 2400, now: NOW });
	assert.notDeepEqual(a.points, other.points);
});

test('generated history is well formed and flagged as generated', () => {
	const h = samplePriceHistory('7lnj7', { basePrice: 2400, days: 30, now: NOW });
	assert.equal(h.source, 'sample');
	assert.equal(h.points.length, 30);

	// Oldest first, ending at "now" — same contract the aggregated series has, so
	// the chart cannot tell the two apart and needs no branch for it.
	assert.equal(h.points[0].at, NOW - 29 * DAY);
	assert.equal(h.points[29].at, NOW);

	for (const p of h.points) {
		assert.ok(p.low <= p.median && p.median <= p.high, 'band must contain the median');
		assert.ok(p.low > 0, 'no free items');
		assert.ok(p.sales >= 1);
		assert.ok(Number.isInteger(p.median));
	}
});

test('generated history falls back to rank when the item has no base price', () => {
	const legend = samplePriceHistory('aaa', { rank: 'RANK_LEGEND', now: NOW });
	const newbie = samplePriceHistory('aaa', { rank: 'RANK_NEWBIE', now: NOW });
	assert.ok(legend.points[0].median > newbie.points[0].median);
});

test('summariseLots prices per item, not per lot', () => {
	const lots: RawLot[] = [
		// Cheapest lot total, but a stack of ten — 900 each, the dearest per item.
		{ amount: 10, startPrice: 5_000, buyoutPrice: 9_000, startTime: '', endTime: '' },
		{ amount: 1, startPrice: 700, buyoutPrice: 800, startTime: '', endTime: '' },
		{ amount: 2, startPrice: 1_000, buyoutPrice: 1_600, startTime: '', endTime: '' }
	].map((l) => ({ ...l, startTime: new Date(NOW).toISOString(), endTime: new Date(NOW + HOUR).toISOString() }));

	const market = summariseLots(lots, { source: 'live', fetchedAt: NOW, total: 42 });
	assert.ok(market);

	// The whole point: the 9 000 lot is the cheapest total and the dearest item.
	assert.equal(market.cheapest, 800, 'cheapest is per item, so the stack does not win');
	assert.equal(market.median, 800, 'median of 800, 800 (=1600/2) and 900');
	assert.equal(market.items, 13);
	// `total` is the API's count across every lot, not the size of our slice.
	assert.equal(market.total, 42);
	assert.equal(market.rows.length, 3);
	assert.equal(market.bidOnly, 0);
});

test('summariseLots keeps the order the API sorted in', () => {
	const lot = (buyoutPrice: number): RawLot => ({
		amount: 1,
		startPrice: 1,
		buyoutPrice,
		startTime: new Date(NOW).toISOString(),
		endTime: new Date(NOW + HOUR).toISOString()
	});
	// Re-sorting our slice of an API-wide sort would only shuffle a truncation.
	const market = summariseLots([lot(300), lot(100), lot(200)], {
		source: 'live',
		fetchedAt: NOW
	});
	assert.deepEqual(market?.rows.map((r) => r.buyoutEach), [300, 100, 200]);
	// The headline is still the real minimum, whatever order the rows arrived in.
	assert.equal(market?.cheapest, 100);
});

test('summariseLots handles bid-only lots and expiry', () => {
	const lots: RawLot[] = [
		{
			amount: 1,
			startPrice: 500,
			startTime: new Date(NOW - HOUR).toISOString(),
			endTime: new Date(NOW + 2 * HOUR).toISOString()
		},
		{
			amount: 1,
			startPrice: 500,
			currentPrice: 650,
			buyoutPrice: 900,
			startTime: new Date(NOW - HOUR).toISOString(),
			endTime: new Date(NOW - MINUTE).toISOString()
		}
	];
	const market = summariseLots(lots, { source: 'live', fetchedAt: NOW });
	assert.ok(market);

	// No buyout: the row shows, but it cannot price the "cheapest" headline.
	assert.equal(market.rows[0].buyout, null);
	assert.equal(market.rows[0].bid, 500);
	assert.equal(market.rows[0].unbid, true, 'the opening price is not somebody bidding');
	assert.equal(market.bidOnly, 1);
	assert.equal(market.cheapest, 900);

	// A bid replaces the opening price, and an elapsed listing goes negative so
	// the component can say "ended" rather than counting down from the past.
	assert.equal(market.rows[1].bid, 650);
	assert.equal(market.rows[1].unbid, false);
	assert.ok(market.rows[1].endsIn < 0);
	assert.equal(market.rows[0].endsIn, 2 * HOUR);
});

test('summariseLots refuses to invent a market out of nothing', () => {
	assert.equal(summariseLots([], { source: 'live', fetchedAt: NOW }), null);
	// A lot with no opening price is not a listing we can price.
	assert.equal(
		summariseLots([{ amount: 1, startPrice: 0, startTime: '', endTime: '' }], {
			source: 'live',
			fetchedAt: NOW
		}),
		null
	);
});

test('askSpread compares the cheapest ask against recent sales', () => {
	// The number the two endpoints together buy us: asks 20% above recent sales.
	assert.equal(askSpread(1_200, 1_000), 20);
	assert.equal(askSpread(800, 1_000), -20);
	// Nothing to compare is not a spread of zero.
	assert.equal(askSpread(null, 1_000), null);
	assert.equal(askSpread(1_200, null), null);
	assert.equal(askSpread(1_200, 0), null);
});

test('latestMedian reads the newest bucket', () => {
	const h = aggregate(demoFixture(), { source: 'demo', fetchedAt: NOW });
	assert.ok(h);
	assert.equal(latestMedian(h), h.points[h.points.length - 1].median);
	assert.equal(latestMedian(null), null);
});

test('priceChange reports the move across the window', () => {
	assert.equal(priceChange([]), null);
	assert.equal(
		priceChange([
			{ at: NOW - DAY, low: 90, median: 100, high: 110, sales: 5 },
			{ at: NOW, low: 140, median: 150, high: 160, sales: 5 }
		]),
		50
	);
});

test('a buy-it-now listing prices from its buyout, with no opening bid', () => {
	// Verbatim shape from eapi.stalzone.com (EU, artifact "gyjg"): the API says
	// "no bidding on this lot" with startPrice 0, not by omitting the field.
	const lots: RawLot[] = [
		{
			amount: 1,
			startPrice: 0,
			buyoutPrice: 4999,
			startTime: new Date(NOW - HOUR).toISOString(),
			endTime: new Date(NOW + 24 * HOUR).toISOString()
		}
	];
	const market = summariseLots(lots, { source: 'live', fetchedAt: NOW, total: 67 });
	assert.ok(market, 'a buy-it-now lot is a listing, not something to filter out');

	assert.equal(market.rows.length, 1);
	assert.equal(market.rows[0].buyoutEach, 4999);
	assert.equal(market.rows[0].bid, null, 'there is no bidding side to report');
	assert.equal(market.rows[0].bidEach, null);
	assert.equal(market.rows[0].unbid, false, 'nothing to bid on is not "nobody has bid yet"');
	assert.equal(market.cheapest, 4999);
	assert.equal(market.bidOnly, 0);
	assert.equal(market.total, 67);
});

test('a page of buy-it-now lots is a market, not "nothing is listed"', () => {
	// The regression this guards: requiring startPrice > 0 dropped every row, so
	// an item listed exclusively as buy-it-now reported no listings at all while
	// the API was returning dozens.
	const lots: RawLot[] = [85000, 205000, 125000, 300000].map((buyoutPrice) => ({
		amount: 1,
		startPrice: 0,
		buyoutPrice,
		startTime: new Date(NOW - HOUR).toISOString(),
		endTime: new Date(NOW + 12 * HOUR).toISOString()
	}));
	const market = summariseLots(lots, { source: 'live', fetchedAt: NOW, total: 29 });
	assert.ok(market);
	assert.equal(market.rows.length, 4);
	assert.equal(market.cheapest, 85000);
});

test('a lot quoting neither price is still refused', () => {
	// 0/0 carries no number to show; that one really is unpriceable.
	const lots: RawLot[] = [
		{
			amount: 1,
			startPrice: 0,
			buyoutPrice: 0,
			startTime: new Date(NOW - HOUR).toISOString(),
			endTime: new Date(NOW + HOUR).toISOString()
		}
	];
	assert.equal(summariseLots(lots, { source: 'live', fetchedAt: NOW }), null);
});

test('a rolled artefact reports its quality, upgrade and bonuses', () => {
	// Verbatim from eapi.stalzone.com (RU, artefact "5rpq").
	const attrs = lotAttributes({
		md_k: 0.10000004,
		bonus_properties: ['MAX_WEIGHT_BONUS'],
		ndmg: 0.10253003878071856,
		it_transf_count: 1,
		qlt: 1,
		ptn: 8,
		upgrade_bonus: 0.002208,
		spawn_time: 1714474550880
	});
	assert.ok(attrs);
	assert.equal(attrs.rarity, 'unordinary', 'qlt 1 is the second rung of the ladder');
	assert.equal(attrs.upgradeBonus, 0.002208);
	assert.deepEqual(attrs.bonuses, ['MAX_WEIGHT_BONUS']);
	assert.equal(attrs.transfers, 1);
});

test('an ordinary item earns no attributes at all', () => {
	// The common case: quality 0, no upgrade, nothing rolled. Repeating "Q0" on
	// every row would bury the rows that actually differ.
	assert.equal(lotAttributes({ qlt: 0, upgrade_bonus: 0, spawn_time: 1785425364440 }), null);
	assert.equal(lotAttributes({ upgrade_bonus: 0 }), null);
	assert.equal(lotAttributes(undefined), null);
	assert.equal(lotAttributes(null), null);
});

test('the item column appears only when some lot has something to say', () => {
	const plain: RawLot[] = [
		{
			amount: 1,
			startPrice: 0,
			buyoutPrice: 4999,
			startTime: new Date(NOW - HOUR).toISOString(),
			endTime: new Date(NOW + HOUR).toISOString(),
			additional: { qlt: 0, upgrade_bonus: 0 }
		}
	];
	assert.equal(summariseLots(plain, { source: 'live', fetchedAt: NOW })?.hasAttrs, false);

	const rolled: RawLot[] = [
		{ ...plain[0], additional: { qlt: 1, upgrade_bonus: 0, bonus_properties: ['BLEEDING_ACC'] } }
	];
	const market = summariseLots(rolled, { source: 'live', fetchedAt: NOW });
	assert.equal(market?.hasAttrs, true);
	assert.equal(market?.rows[0].attrs?.rarity, 'unordinary');
});

test('bonus names read as words, expanding the abbreviation that recurs', () => {
	assert.equal(bonusLabel('MAX_WEIGHT_BONUS'), 'Max weight bonus');
	assert.equal(bonusLabel('BLEEDING_ACC'), 'Bleeding accumulation');
});

test('qlt maps onto the rarity ladder, and ordinary earns no tag', () => {
	// Measured, not assumed: over 400 RU lots qlt spans 0–5 and tracks price by
	// orders of magnitude within a single artefact.
	assert.equal(lotAttributes({ qlt: 5 })?.rarity, 'legendary');
	assert.equal(lotAttributes({ qlt: 3 })?.rarity, 'rare');

	// qlt 0 is the bottom rung and the commonest value; a tag on every one of
	// those would say nothing, so the lot reports no attributes at all.
	assert.equal(lotAttributes({ qlt: 0 }), null);

	// A rung the ladder does not have is not a rarity we will invent.
	assert.equal(lotAttributes({ qlt: 99 }), null);
});
