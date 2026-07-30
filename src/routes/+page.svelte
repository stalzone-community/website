<script lang="ts">
	/**
	 * The overview.
	 *
	 * Two columns, the shape UAR's front page settled on: what is happening runs
	 * down the middle, and the ways in sit in a rail on the right. Below 1080px
	 * the rail comes *first* — how busy the game is and what shipped this week
	 * are why you opened the site, and on a phone they should not sit under
	 * fourteen category tiles.
	 *
	 * The rail is a grid rather than a flex column at that width, because a
	 * column would take `align-items: start` from the two-column rule above and
	 * size each half to its widest child instead of to the page.
	 */
	import { SectionHeading, WhatsNew } from 'sveltekit-commons';
	import ActivityChart from '$lib/components/ActivityChart.svelte';
	import { latestRelease } from '$lib/changelog-data';
	import { groupIcon, groupTint } from '$lib/group-icons';
	import { TAG_LABELS } from '$lib/calc/publish';
	import { REGIONS } from '$lib/regions';

	let { data } = $props();

	const groupLabel = (name: string) => name.replace(/_/g, ' ');
	const num = (n: number) => n.toLocaleString('en-US').replace(/,/g, ' ');
</script>

<svelte:head>
	<title>Stalzone — items, weapons, armor, artefacts</title>
	<meta
		name="description"
		content="Every item in the Zone: weapons, armor, artefacts and attachments, with full stats, upgrade levels and compatibility — plus live player numbers, emission alerts and community builds."
	/>
</svelte:head>

<!-- The top bar carries no title on this page (see the crumb snippet in
     +layout.svelte), and the hero it used to have is gone — so the document
     would otherwise have no h1 at all. It stays in the outline and out of the
     picture rather than being deleted: a page with no heading is a page a
     screen reader cannot announce or navigate to. -->
<h1 class="sr-only">Stalzone — every item in the Zone</h1>

<div class="layout">
	<div class="main">
		{#if data.activity}
			<SectionHeading>In game · last {data.activity.days} days</SectionHeading>
			<div class="panel">
				<div class="panel-head">
					<span class="panel-label">Players on Steam</span>
					{#if data.activity.now !== null}
						<span class="live"><span class="pip" aria-hidden="true"></span>{num(data.activity.now)} now</span>
					{/if}
				</div>

				<ActivityChart timeline={data.activity.timeline} />

				<dl class="figures">
					<div><dt>Peak</dt><dd>{num(data.activity.peak)}</dd></div>
					<div><dt>Average</dt><dd>{num(data.activity.average)}</dd></div>
				</dl>
			</div>
			<!-- The credit is not optional politeness: the series is somebody else's
			     polling, and where a number came from is part of the number. -->
			<p class="note">
				Concurrent players across the whole game, hourly · history from
				<a href="https://steamcharts.com/app/1818450" rel="noreferrer">SteamCharts</a>, live count
				from Steam · times in your local timezone.
			</p>
		{/if}

		<SectionHeading>Emissions</SectionHeading>
		<div class="panel">
			<div class="panel-head">
				<span class="panel-label">Next emission</span>
				<span class="pending-chip">Awaiting API access</span>
			</div>
			<p class="panel-body">
				Live timings for all {REGIONS.length} regions land here as soon as EXBO approve production
				access to their API. The alerts themselves already work: subscribe and your browser tells
				you when one starts and when it is over, without this site being open.
			</p>
			<div class="regions">
				{#each REGIONS as r (r.id)}
					<a class="region" href="/emission?region={r.id}">
						<b>{r.id}</b>
						<span>{r.name}</span>
					</a>
				{/each}
			</div>
			<a class="panel-link" href="/emission">Set up emission alerts →</a>
		</div>

		{#if data.builds.length}
			<SectionHeading>Community builds</SectionHeading>
			<ul class="builds">
				{#each data.builds as b (b.slug)}
					<li>
						<a class="build" href="/builds/{b.slug}">
							<span class="votes" title="{b.votes} upvote{b.votes === 1 ? '' : 's'}">
								<span class="arrow" aria-hidden="true">▲</span>{b.votes}
							</span>
							<span class="build-main">
								<span class="build-name">{b.name}</span>
								<span class="build-by">by {b.author.name}</span>
							</span>
							{#if b.tags.length}
								<span class="build-tags">
									{#each b.tags as t (t)}<span class="btag">{TAG_LABELS[t] ?? t}</span>{/each}
								</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
			<a class="more" href="/builds">All builds →</a>
		{/if}
	</div>

	<aside class="rail">
		<!-- The categories lead the rail: they are the whole point of the site,
		     and everything else in this column is context for them. Each carries
		     its group's mark and hue (see --group-* in palette.css) — fourteen
		     identical outlines would leave the name doing all the work. -->
		<nav class="tiles" aria-label="Item categories">
			{#each data.groups as g (g.name)}
				<a class="tile" href="/items/{g.name}" style="--tint: {groupTint(g.name)}">
					<span class="tile-icon" aria-hidden="true">{@html groupIcon(g.name)}</span>
					<span class="tile-name">{groupLabel(g.name)}</span>
					<span class="tile-count">{num(g.count)}</span>
				</a>
			{/each}
		</nav>

		<WhatsNew release={latestRelease} />
	</aside>
</div>

<style>
	/* the rail is a fixed column beside the page; see the note in the script */
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 290px;
		gap: 0 var(--space-6);
		align-items: start;
	}

	.main {
		min-width: 0;
	}

	/* SectionHeading carries a big top margin, which is spacing *between* bands.
	   The column now opens on one, so the first has to give that back or the
	   page starts with a hole under the top bar. */
	.main :global(h2.section:first-of-type) {
		margin-top: 0;
	}

	/* In the outline, out of the picture — and deliberately not
	   `position: absolute`, which with no positioned ancestor anchors to the
	   document and grows the page's scroll area instead. */
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

	.rail {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	@media (max-width: 1080px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}

		.rail {
			order: -1;
			margin-bottom: var(--space-5);
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
			gap: var(--space-4);
			align-items: start;
		}
	}

	/* ── the panels down the middle ─────────────────────────────────── */

	.panel {
		background: var(--surface);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-3);
		box-shadow: var(--shadow-1);
		padding: var(--space-3) var(--space-4);
		/* the chart's tooltip and dot sit at the edges of their box */
		overflow: hidden;
	}

	.panel-head {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.panel-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.live {
		margin-left: auto;
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-2);
		font-size: var(--text-md);
		font-weight: 650;
		font-variant-numeric: tabular-nums;
		color: var(--text);
		white-space: nowrap;
	}

	.pip {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--accent);
		/* the halo does the work a blink would, without the movement */
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
	}

	.figures {
		display: flex;
		gap: var(--space-5);
		margin: 0;
	}

	.figures div {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}

	.figures dt {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.figures dd {
		margin: 0;
		font-weight: 650;
		font-variant-numeric: tabular-nums;
	}

	.panel-body {
		margin: var(--space-2) 0 0;
		font-size: var(--text-sm);
		line-height: 1.6;
		color: var(--text-dim);
		max-width: 62ch;
	}

	/* Said plainly rather than dressed as a countdown: a placeholder that looks
	   like data is worse than an empty space. */
	.pending-chip {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.04em;
		color: var(--warn);
		background: color-mix(in srgb, var(--warn) 13%, transparent);
		border-radius: 99px;
		padding: 0 var(--space-2);
		white-space: nowrap;
	}

	.regions {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		gap: var(--space-2);
		margin-top: var(--space-3);
	}

	.region {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		background: var(--surface-sunken);
		text-decoration: none;
		font-size: var(--text-sm);
	}

	.region:hover {
		border-color: var(--accent-dim);
	}

	.region b {
		font-family: var(--font-mono);
		font-weight: 700;
		color: var(--accent);
	}

	.region span {
		color: var(--text-dim);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.panel-link,
	.more {
		display: inline-block;
		margin-top: var(--space-3);
		font-size: var(--text-sm);
		color: var(--accent);
		text-decoration: none;
	}

	.panel-link:hover,
	.more:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.note {
		margin: var(--space-2) 0 0;
		font-size: var(--text-xs);
		color: var(--text-faint);
		text-wrap: pretty;
	}

	.note a {
		color: inherit;
	}

	/* ── builds ─────────────────────────────────────────────────────── */

	.builds {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.build {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		background: var(--surface);
		text-decoration: none;
	}

	.build:hover {
		background: var(--surface-raised);
		border-color: var(--border-strong);
	}

	.votes {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		color: var(--text-dim);
		/* a fixed column so the names line up whatever the score */
		min-width: 3ch;
	}

	.arrow {
		color: var(--accent);
		font-size: 0.8em;
	}

	.build-main {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		min-width: 0;
		flex-wrap: wrap;
	}

	.build-name {
		font-weight: 600;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.build-by {
		font-size: var(--text-xs);
		color: var(--text-faint);
	}

	.build-tags {
		margin-left: auto;
		display: flex;
		gap: var(--space-2);
	}

	.btag {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-faint);
		white-space: nowrap;
	}

	/* the tags are the first thing worth losing when the row runs out of room */
	@media (max-width: 560px) {
		.build-tags {
			display: none;
		}
	}

	/* ── the rail's category tiles ──────────────────────────────────── */

	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(8.5rem, 100%), 1fr));
		gap: var(--space-2);
	}

	.tile {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 0 var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: var(--border-width) solid var(--border);
		/* the hue on the edge, where it reads without tinting the label */
		border-left: 3px solid var(--tint);
		border-radius: var(--radius-2);
		background: var(--surface);
		text-decoration: none;
	}

	.tile:hover {
		background: var(--surface-raised);
		border-color: var(--border-strong);
		border-left-color: var(--tint);
	}

	.tile-icon {
		display: flex;
		color: var(--tint);
		grid-row: span 2;
	}

	.tile-icon :global(svg) {
		width: 18px;
		height: 18px;
	}

	.tile-name {
		font-size: var(--text-sm);
		color: var(--text);
		text-transform: capitalize;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tile-count {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
	}

</style>
