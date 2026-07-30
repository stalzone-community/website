<script lang="ts">
	/**
	 * Concurrent players over the trailing window — the shape of a week in the
	 * Zone. Same chart UAR draws on its overview, with two differences that the
	 * data forced rather than taste:
	 *
	 * 1. **Hourly slots, not half-hourly.** UAR derives its series from replay
	 *    durations and can resolve to thirty minutes; this one comes from an
	 *    hourly upstream (see $lib/steam), and asking for finer slots would draw
	 *    detail nobody measured.
	 *
	 * 2. **A wider gutter and compact ticks.** STALZONE peaks north of 25 000
	 *    concurrent, and "25 000" does not fit in the 30px UAR's two-digit
	 *    counts live in. Axis ticks read "25k"; the tooltip and the table below
	 *    carry the exact figure, because that is where somebody goes to read one.
	 *
	 * The visual chart is hover-only and hidden from assistive tech behind a
	 * role="img" label; the daily digest table under it is what actually carries
	 * the numbers. A row per slot would be a 168-row table that helps no one.
	 */
	import { SLOT_MINUTES, type ActivityTimeline } from '$lib/steam';

	let { timeline }: { timeline: ActivityTimeline } = $props();

	let hovered: number | null = $state(null);

	const SLOT_MS = SLOT_MINUTES * 60 * 1000;
	const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES;

	const values = $derived(timeline.values);
	const n = $derived(values.length);

	const max = $derived(Math.max(...values, 1));
	// clean tick step (1/2/5 × 10^n) so the 2–3 gridlines land on round numbers
	const step = $derived.by(() => {
		for (let mag = 1; ; mag *= 10) for (const s of [1, 2, 5]) if (max <= 3 * s * mag) return s * mag;
	});
	const top = $derived(Math.ceil(max / step - 1e-9) * step);
	const ticks = $derived(Array.from({ length: Math.round(top / step) }, (_, i) => (i + 1) * step));

	const x = (i: number) => (n > 1 ? (100 * i) / (n - 1) : 50);
	const y = (v: number) => 100 - (100 * v) / top;
	const points = $derived(values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' '));

	// Axis labels at the viewer's local midnights, anchored on the newest and
	// strided to at most ~5 labels so they stay apart at mobile widths. SSR
	// renders in the server's timezone; hydration re-renders in the reader's,
	// which is the right trade for a label nobody reads before paint.
	const mids = $derived.by(() => {
		const end = timeline.start + n * SLOT_MS;
		const stride = Math.max(1, Math.ceil(n / SLOTS_PER_DAY / 5));
		const out: { frac: number; label: string }[] = [];
		const fmtDay = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
		const d = new Date(end);
		d.setHours(0, 0, 0, 0);
		for (let day = 0; d.getTime() >= timeline.start; day++, d.setDate(d.getDate() - 1)) {
			if (day % stride === 0)
				out.push({ frac: (d.getTime() - timeline.start) / (n * SLOT_MS), label: fmtDay.format(d) });
		}
		return out;
	});

	const fmtWhen = new Intl.DateTimeFormat('en', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	});
	const when = (i: number) => fmtWhen.format(new Date(timeline.start + i * SLOT_MS));

	/** Exact, thin-spaced — the site's number style everywhere else. */
	const full = (v: number) => Math.round(v).toLocaleString('en-US').replace(/,/g, ' ');
	/** Axis only: "25k" where the exact figure will not fit. */
	const short = (v: number) =>
		v >= 10_000
			? `${Math.round(v / 1000)}k`
			: v >= 1_000
				? `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`
				: String(Math.round(v));

	// daily digest for the screen-reader table
	const dayRows = $derived.by(() => {
		const fmtDay = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' });
		const rows = new Map<string, { sum: number; count: number; peak: number; peakAt: string }>();
		for (let i = 0; i < n; i++) {
			const at = new Date(timeline.start + i * SLOT_MS);
			const key = fmtDay.format(at);
			const row = rows.get(key) ?? { sum: 0, count: 0, peak: 0, peakAt: '' };
			row.sum += values[i];
			row.count++;
			if (values[i] > row.peak) {
				row.peak = values[i];
				row.peakAt = at.toTimeString().slice(0, 5);
			}
			rows.set(key, row);
		}
		return [...rows].map(([day, r]) => ({ day, avg: r.sum / r.count, peak: r.peak, peakAt: r.peakAt }));
	});

	/** Must match the CSS gutter (the tick-label column) below. */
	const GUTTER = 34;

	/** Snap the pointer to the nearest sampled hour. */
	function pick(e: PointerEvent) {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const w = r.width - GUTTER;
		if (w <= 0 || n < 2) return;
		const i = Math.round(((n - 1) * (e.clientX - r.left - GUTTER)) / w);
		hovered = Math.max(0, Math.min(n - 1, i));
	}
</script>

<div
	class="plot"
	role="img"
	aria-label="Chart of concurrent players over the last {Math.round(
		(n * SLOT_MINUTES) / (24 * 60)
	)} days"
	onpointermove={pick}
	onpointerdown={pick}
	onpointerleave={() => (hovered = null)}
>
	{#each ticks as t (t)}
		<div class="grid" style="bottom: {(100 * t) / top}%">
			<span class="tick">{short(t)}</span>
		</div>
	{/each}
	<div class="area">
		<svg viewBox="0 0 100 100" preserveAspectRatio="none">
			<polygon class="wash" points="{points} 100,100 0,100" />
			<polyline class="line" points={points} />
		</svg>
		{#each mids as m (m.label)}
			<span class="xlabel" style="left: {100 * m.frac}%">{m.label}</span>
		{/each}
		{#if hovered !== null}
			<div class="cross" style="left: {x(hovered)}%"></div>
			<div class="dot" style="left: {x(hovered)}%; bottom: {(100 * values[hovered]) / top}%"></div>
			<div class="tip" style="left: clamp(66px, {x(hovered)}%, calc(100% - 66px))">
				<b>{full(values[hovered])}</b> in game
				<span class="tip-when">{when(hovered)}</span>
			</div>
		{/if}
	</div>
</div>

<!-- The hiding box has to be a plain block: a table cannot be squeezed under
     its min-content width, so `.sr-only` on the <table> itself leaves a wide
     box hanging off the page and every phone gets a sideways scroll. -->
<div class="sr-only">
	<table>
		<caption>Concurrent players per day (average and peak hour)</caption>
		<thead>
			<tr><th>Day</th><th>Average</th><th>Peak</th><th>Peak at</th></tr>
		</thead>
		<tbody>
			{#each dayRows as r (r.day)}
				<tr>
					<th scope="row">{r.day}</th>
					<td>{full(r.avg)}</td>
					<td>{full(r.peak)}</td>
					<td>{r.peakAt}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.plot {
		position: relative;
		height: 120px;
		/* room for the x-label band below the baseline */
		margin: var(--space-3) 0 var(--space-5);
	}

	.plot::after {
		content: '';
		position: absolute;
		left: 34px;
		right: 0;
		bottom: 0;
		border-top: var(--border-width) solid var(--border-strong);
	}

	.grid {
		position: absolute;
		left: 34px;
		right: 0;
		height: 0;
		border-top: var(--border-width) solid var(--border);
	}

	.tick {
		position: absolute;
		right: calc(100% + 6px);
		top: -0.7em;
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
	}

	.area {
		position: absolute;
		inset: 0 0 0 34px;
	}

	svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	.wash {
		fill: var(--accent);
		fill-opacity: 0.1;
	}

	.line {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
		/* the viewBox is stretched to the column, so the stroke must not be */
		vector-effect: non-scaling-stroke;
	}

	.xlabel {
		position: absolute;
		top: calc(100% + 5px);
		transform: translateX(-50%);
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-faint);
		white-space: nowrap;
	}

	.cross {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--border-strong);
	}

	.dot {
		position: absolute;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
		/* a surface ring, so it stays legible where it sits on the line */
		box-shadow: 0 0 0 2px var(--surface);
		transform: translate(-50%, 50%);
	}

	.tip {
		position: absolute;
		top: -6px;
		transform: translateX(-50%);
		background: var(--surface);
		border: var(--border-width) solid var(--border-strong);
		border-radius: var(--radius-2);
		padding: 3px 8px;
		font-size: var(--text-xs);
		color: var(--text-faint);
		white-space: nowrap;
		pointer-events: none;
	}

	.tip b {
		font-size: var(--text-sm);
		color: var(--text);
		font-weight: 650;
		font-variant-numeric: tabular-nums;
	}

	.tip-when {
		margin-left: 5px;
	}

	/* Hidden in flow, not out of it: with no positioned ancestor an absolute box
	   anchors to the document rather than the column and grows the page's scroll
	   area in both axes. A 1px box pulled back by its own margin costs no layout
	   and cannot escape. */
	.sr-only {
		position: relative;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		border: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
