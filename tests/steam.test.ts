import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseChartData, series, summarise, SLOT_MINUTES } from '../src/lib/steam.ts';

const HOUR = SLOT_MINUTES * 60 * 1000;
/** A slot boundary, so the arithmetic in these tests is readable. */
const T0 = 1_767_225_600_000; // 2026-01-01T00:00:00Z, exactly on the hour

test('parseChartData keeps well-formed pairs and sorts them', () => {
	assert.deepEqual(
		parseChartData([
			[T0 + HOUR, 200],
			[T0, 100]
		]),
		[
			{ at: T0, players: 100 },
			{ at: T0 + HOUR, players: 200 }
		]
	);
});

test('parseChartData drops anything that is not two sane numbers', () => {
	assert.deepEqual(
		parseChartData([
			[T0, 100],
			[T0 + HOUR], // too short
			['nope', 5],
			[T0 + 2 * HOUR, -1], // a negative count would rescale the chart
			[T0 + 3 * HOUR, Number.NaN],
			null,
			[T0 + 4 * HOUR, 50.6] // rounded, not floored
		]),
		[
			{ at: T0, players: 100 },
			{ at: T0 + 4 * HOUR, players: 51 }
		]
	);
	assert.deepEqual(parseChartData({ not: 'an array' }), []);
	assert.deepEqual(parseChartData(null), []);
});

test('series buckets samples into absolute hourly slots', () => {
	const now = T0 + 3 * HOUR;
	const t = series(
		[
			{ at: T0, players: 100 },
			{ at: T0 + HOUR, players: 200 },
			{ at: T0 + 2 * HOUR, players: 300 }
		],
		now,
		// three hours of window, expressed in days
		(3 * HOUR) / 86_400_000
	);
	assert.equal(t.start, T0);
	assert.deepEqual(t.values, [100, 200, 300]);
});

test('series averages several samples that land in one slot', () => {
	const now = T0 + HOUR;
	const t = series(
		[
			{ at: T0 + 60_000, players: 100 },
			{ at: T0 + 50 * 60_000, players: 300 }
		],
		now,
		HOUR / 86_400_000
	);
	assert.deepEqual(t.values, [200]);
});

test('series carries the last value through a gap instead of drawing a zero', () => {
	const now = T0 + 4 * HOUR;
	const t = series(
		[
			{ at: T0, players: 100 },
			// hour 1 missing — upstream skipped a poll
			{ at: T0 + 2 * HOUR, players: 300 },
			{ at: T0 + 3 * HOUR, players: 400 }
		],
		now,
		(4 * HOUR) / 86_400_000
	);
	assert.deepEqual(t.values, [100, 100, 300, 400]);
});

test('series backfills the head from the first sample it has', () => {
	const now = T0 + 4 * HOUR;
	const t = series(
		[
			// nothing for the first two hours of the window
			{ at: T0 + 2 * HOUR, players: 300 },
			{ at: T0 + 3 * HOUR, players: 400 }
		],
		now,
		(4 * HOUR) / 86_400_000
	);
	assert.deepEqual(t.values, [300, 300, 300, 400]);
});

test('series ignores samples outside the window', () => {
	const now = T0 + 2 * HOUR;
	const t = series(
		[
			{ at: T0 - 50 * HOUR, players: 9999 }, // long before the window
			{ at: T0, players: 100 },
			{ at: T0 + HOUR, players: 200 },
			{ at: T0 + 10 * HOUR, players: 8888 } // after `now`
		],
		now,
		(2 * HOUR) / 86_400_000
	);
	assert.deepEqual(t.values, [100, 200]);
});

test('series returns no values when nothing falls in the window', () => {
	const t = series([{ at: T0 - 500 * HOUR, players: 100 }], T0, 7);
	assert.deepEqual(t.values, []);
	// the start is still a real slot boundary, so the caller can render nothing
	// without special-casing NaN
	assert.equal(t.start % HOUR, 0);
});

test('summarise reports peak and mean, and survives an empty timeline', () => {
	assert.deepEqual(summarise({ start: T0, values: [100, 300, 200] }), {
		peak: 300,
		average: 200
	});
	assert.deepEqual(summarise({ start: T0, values: [] }), { peak: 0, average: 0 });
});
