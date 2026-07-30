<script lang="ts">
	/*
	 * Auction price over whatever window the API returned: one line for the
	 * bucket median, a band behind it for the bucket's low/high.
	 *
	 * The band is deliberately not a second series — it is the same measure's
	 * spread, so it shares the line's hue at low opacity rather than taking a
	 * colour of its own. One series means no legend: the caption names it.
	 *
	 * X IS TIME, NOT POSITION
	 *
	 * Points are spaced by their timestamp, not by their index. The series comes
	 * from completed sales bucketed by width, so a quiet stretch produces no
	 * bucket at all — spacing by index would silently close those gaps and draw a
	 * week of no trade as a normal step. The window itself varies too: the demo
	 * fixture spans two hours, a real item spans weeks.
	 *
	 * Every label is relative and measured against `history.fetchedAt`, which the
	 * server put in the payload. Absolute times would need a timezone, and the
	 * page is server-rendered then hydrated — formatting on the client clock would
	 * rewrite every label on hydration.
	 *
	 * Hover moves a crosshair and rewrites the readout above the chart instead of
	 * floating a tooltip. At this size a positioned tooltip would cover a third of
	 * the plot, and the readout doubles as the resting state — it shows the latest
	 * bucket until you point at another one.
	 */
	import type { PriceHistory } from '$lib/auction';

	interface Props {
		history: PriceHistory;
		/** why the series is generated, when it is; from the loader */
		reason?: string | null;
		/** the API region the prices were read from */
		region?: string;
	}

	let { history, reason = null, region }: Props = $props();

	const W = 520;
	const H = 180;
	const PAD = { top: 12, right: 14, bottom: 26, left: 52 };

	const MINUTE = 60_000;
	const HOUR = 60 * MINUTE;
	const DAY = 24 * HOUR;

	const points = $derived(history.points);

	const lo = $derived(Math.min(...points.map((p) => p.low)));
	const hi = $derived(Math.max(...points.map((p) => p.high)));
	// A little headroom top and bottom so the band never touches the frame.
	const minY = $derived(Math.max(0, lo - (hi - lo) * 0.12));
	const maxY = $derived(hi + (hi - lo) * 0.12);

	const t0 = $derived(points[0].at);
	const t1 = $derived(points[points.length - 1].at);
	/** One point, or every sale inside a single bucket: draw it centred. */
	const flat = $derived(t1 <= t0);

	const sx = (at: number) =>
		flat
			? (PAD.left + W - PAD.right) / 2
			: PAD.left + ((at - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
	const sy = (v: number) =>
		H - PAD.bottom - ((v - minY) / Math.max(1, maxY - minY)) * (H - PAD.top - PAD.bottom);

	const line = $derived(
		points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.at).toFixed(1)} ${sy(p.median).toFixed(1)}`).join(' ')
	);

	// Out along the highs, back along the lows — one closed shape, so the band
	// is a single fill rather than two paths that have to be kept in step.
	const band = $derived(
		points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.at).toFixed(1)} ${sy(p.high).toFixed(1)}`).join(' ') +
			' ' +
			points
				.map((_, i) => points[points.length - 1 - i])
				.map((p) => `L${sx(p.at).toFixed(1)} ${sy(p.low).toFixed(1)}`)
				.join(' ') +
			' Z'
	);

	const ticksY = $derived([minY, (minY + maxY) / 2, maxY]);

	let hover = $state<number | null>(null);
	const shown = $derived(points[hover ?? points.length - 1]);

	const fmt = (n: number) => n.toLocaleString('en-US').replace(/,/g, ' ');

	/** Relative to when the server built the series, so SSR and hydration agree. */
	function ago(at: number): string {
		const delta = history.fetchedAt - at;
		if (delta < 90 * 1000) return 'just now';
		if (delta < 90 * MINUTE) return `${Math.round(delta / MINUTE)} min ago`;
		if (delta < 48 * HOUR) return `${Math.round(delta / HOUR)} h ago`;
		return `${Math.round(delta / DAY)} days ago`;
	}

	/** What one point on the line covers. */
	const bucket = $derived(
		history.bucketMs >= 7 * DAY
			? 'week'
			: history.bucketMs >= DAY
				? 'day'
				: history.bucketMs >= HOUR
					? 'hour'
					: `${Math.round(history.bucketMs / MINUTE)} min`
	);

	function track(event: PointerEvent & { currentTarget: SVGSVGElement }) {
		const box = event.currentTarget.getBoundingClientRect();
		// The svg scales with the column, so map through the viewBox rather than
		// using clientX directly — otherwise the crosshair drifts off the pointer
		// at every width but the one the chart was authored at.
		const x = ((event.clientX - box.left) / box.width) * W;
		const t = (x - PAD.left) / (W - PAD.left - PAD.right);
		const at = t0 + Math.max(0, Math.min(1, t)) * (t1 - t0);

		// Nearest in time, not nearest in index: with gaps in the series those are
		// not the same point.
		let best = 0;
		for (let i = 1; i < points.length; i++) {
			if (Math.abs(points[i].at - at) < Math.abs(points[best].at - at)) best = i;
		}
		hover = best;
	}

	const summary = $derived(
		`Auction price in ${points.length} ${bucket} step${points.length === 1 ? '' : 's'} ` +
			`from ${ago(t0)}: median ${fmt(points[0].median)} to ${fmt(points[points.length - 1].median)} ` +
			`roubles, low ${fmt(lo)}, high ${fmt(hi)}.`
	);
</script>

<figure>
	<div class="readout">
		<div>
			<b>{fmt(shown.median)}</b><span class="unit">₽</span>
			<span class="when">{ago(shown.at)}</span>
		</div>
		<div class="range">
			{fmt(shown.low)}–{fmt(shown.high)} · {shown.sales} sale{shown.sales === 1 ? '' : 's'}
		</div>
	</div>

	<svg
		viewBox="0 0 {W} {H}"
		role="img"
		aria-label={summary}
		onpointermove={track}
		onpointerleave={() => (hover = null)}
	>
		{#each ticksY as t (t)}
			<line class="grid" x1={PAD.left} y1={sy(t)} x2={W - PAD.right} y2={sy(t)} />
			<text class="axis" x={PAD.left - 6} y={sy(t)} text-anchor="end" dominant-baseline="middle">
				{fmt(Math.round(t))}
			</text>
		{/each}

		{#if !flat}
			<text class="axis" x={PAD.left} y={H - 8} text-anchor="start">{ago(t0)}</text>
			<text class="axis" x={W - PAD.right} y={H - 8} text-anchor="end">{ago(t1)}</text>
		{/if}

		<path class="band" d={band} />
		<path class="line" d={line} />

		{#if hover !== null && !flat}
			<line class="cross" x1={sx(shown.at)} y1={PAD.top} x2={sx(shown.at)} y2={H - PAD.bottom} />
		{/if}
		<circle class="dot" cx={sx(shown.at)} cy={sy(shown.median)} r="4" />
	</svg>

	<figcaption>
		Median price per item, {bucket} low–high band{#if region}, {region} region{/if}.
		{#if history.totalSales && history.totalSales > 0}
			{history.totalSales} recorded sale{history.totalSales === 1 ? '' : 's'}.
		{/if}

		{#if history.source === 'sample'}
			<strong class="warn">Generated data</strong> —
			{reason ?? 'the live auction feed is unavailable'}, so these numbers are invented and mean
			nothing.
		{:else if history.source === 'demo'}
			<strong class="warn">Demo API</strong> — read live from EXBO's demo endpoint, which returns
			the same fixture for every item. The shape is real, the prices are not. Real prices need the
			production API access we have applied for.
		{/if}
	</figcaption>
</figure>

<style>
	figure {
		margin: 0;
	}

	.readout {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}

	/* The number is the thing you came for, so it gets the size — but it stays
	   in text ink. The accent belongs to the mark, not to the label. */
	.readout b {
		font-size: var(--text-lg);
		font-family: var(--font-mono);
		color: var(--text);
	}

	/* The symbol is a unit, not part of the figure: it steps down in size and
	   keeps its own gap, so "276 120" reads as the number and ₽ as its label
	   rather than the two colliding into one mono blob. */
	.unit {
		color: var(--text-dim);
		font-size: var(--text-sm);
		margin-left: 0.3em;
	}

	.when,
	.range {
		font-size: var(--text-xs);
		color: var(--text-faint);
	}

	.when {
		margin-left: var(--space-2);
	}

	.range {
		font-family: var(--font-mono);
	}

	svg {
		width: 100%;
		height: auto;
		overflow: visible;
		touch-action: pan-y;
	}

	.grid {
		stroke: var(--border);
		stroke-width: 1;
	}

	.axis {
		fill: var(--text-faint);
		font-size: 10px;
		font-family: var(--font-mono);
	}

	/* Same hue as the line: this is that measure's spread, not another series.
	   0.16 washed out to near-grey on the light skin, where the accent is
	   already low-chroma; 0.22 keeps it legible without competing with the
	   median it sits behind. */
	.band {
		fill: var(--accent);
		opacity: 0.22;
		stroke: none;
	}

	.line {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}

	.cross {
		stroke: var(--border-strong);
		stroke-width: 1;
	}

	.dot {
		fill: var(--accent);
		/* a surface ring keeps the dot readable where it sits on the band */
		stroke: var(--surface);
		stroke-width: 2;
	}

	figcaption {
		margin-top: var(--space-2);
		font-size: var(--text-xs);
		color: var(--text-faint);
	}

	.warn {
		color: var(--warn);
	}
</style>
