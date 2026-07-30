<script lang="ts">
	/**
	 * A published build, in full.
	 *
	 * The numbers are computed in the browser from the same modules the
	 * calculator uses — the server stores the build's encoded string and nothing
	 * derived from it, so there is exactly one implementation of the maths and
	 * no stored totals to go stale when a game patch moves a stat.
	 */
	import { onMount } from 'svelte';
	import { Button } from 'sveltekit-commons';

	import ConnectPrompt from '$lib/components/calc/ConnectPrompt.svelte';
	import EstimatePanel from '$lib/components/calc/EstimatePanel.svelte';
	import StatTable from '$lib/components/calc/StatTable.svelte';
	import VoteButton from '$lib/components/calc/VoteButton.svelte';

	import { computeBuild, indexGear } from '$lib/calc/build';
	import { decodeBuild } from '$lib/calc/codec';
	import { formatDuration } from '$lib/calc/format';
	import { loadGear } from '$lib/calc/load';
	import { TAG_LABELS } from '$lib/calc/publish';
	import type { GearIndex } from '$lib/calc/types';
	import { lang as displayLang } from '$lib/lang.svelte';

	let { data } = $props();

	const lang = $derived(displayLang());

	let gear = $state<GearIndex | null>(null);
	let promptOpen = $state(false);
	let copied = $state(false);

	onMount(() => {
		loadGear(lang)
			.then((g) => (gear = g))
			.catch(() => {
				// the build is still readable as a link; only the totals are missing
			});
	});

	$effect(() => {
		const l = lang;
		if (gear && gear.lang !== l) loadGear(l).then((g) => (gear = g));
	});

	const decoded = $derived(decodeBuild(new URLSearchParams(data.build.query)));
	const lookup = $derived(gear ? indexGear(gear) : null);
	const result = $derived(lookup ? computeBuild(decoded.build, lookup) : null);

	const armor = $derived(
		decoded.build.armor ? gear?.armor.find((a) => a.id === decoded.build.armor?.id) : null
	);
	const container = $derived(
		decoded.build.container ? gear?.containers.find((c) => c.id === decoded.build.container) : null
	);
	const artefacts = $derived(
		decoded.build.artefacts
			.map((slot) => ({ slot, item: gear?.artefacts.find((a) => a.id === slot.id) }))
			.filter((row) => row.item)
	);
	const buffs = $derived(
		decoded.build.buffs.map((id) => gear?.buffs.find((b) => b.id === id)).filter((b) => b)
	);

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(location.href);
			copied = true;
		} catch {
			copied = false;
		}
	}
</script>

<svelte:head>
	<title>{data.build.name} — STALZONE build</title>
	<meta
		name="description"
		content="{data.build.name}, a STALZONE build by {data.build.author.name}. Open it in the calculator to change anything."
	/>
	{#if data.build.visibility === 'private'}
		<meta name="robots" content="noindex" />
	{/if}
</svelte:head>

<header class="head">
	<div class="title">
		<h1>{data.build.name}</h1>
		<p class="by">
			by {data.build.author.name}
			{#if data.build.visibility === 'private'}
				<span class="private">private</span>
			{/if}
		</p>
		{#if data.build.tags.length}
			<ul class="tags">
				{#each data.build.tags as tag (tag)}
					<li><a href="/builds?tag={tag}">{TAG_LABELS[tag] ?? tag}</a></li>
				{/each}
			</ul>
		{/if}
	</div>

	<div class="actions">
		{#if data.build.visibility === 'public'}
			<VoteButton
				slug={data.build.slug}
				votes={data.build.votes}
				voted={data.voted}
				onunauthorised={() => (promptOpen = true)}
			/>
		{/if}
		<Button href="/builds/create?{data.build.query}">Open in calculator</Button>
		<Button variant="ghost" onclick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</Button>
	</div>
</header>

{#if !gear}
	<p class="quiet">Loading the numbers…</p>
{:else}
	<div class="layout">
		<div class="column">
			<section>
				<h2>Gear</h2>
				<dl class="gear">
					<div>
						<dt>Suit</dt>
						<dd>
							{#if armor}
								{armor.name}{#if decoded.build.armor?.level}
									<span class="mono">+{decoded.build.armor.level}</span>
								{/if}
							{:else}—{/if}
						</dd>
					</div>
					<div>
						<dt>Container</dt>
						<dd>{container ? container.name : '—'}</dd>
					</div>
				</dl>
			</section>

			{#if artefacts.length}
				<section>
					<h2>Artefacts</h2>
					<ul class="items">
						{#each artefacts as row, i (i)}
							<li>
								{#if row.item?.icon}
									<img class="icon" src={row.item.icon} alt="" width="24" height="24" loading="lazy" />
								{/if}
								<span class="item-name">{row.item?.name}</span>
								<span class="mono note">
									q{row.slot.quality}{#if row.slot.level} · +{row.slot.level}{/if}
								</span>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if buffs.length}
				<section>
					<h2>Buffs</h2>
					<ul class="items">
						{#each buffs as b (b?.id)}
							<li>
								{#if b?.icon}
									<img class="icon" src={b.icon} alt="" width="24" height="24" loading="lazy" />
								{/if}
								<span class="item-name">{b?.name}</span>
								<span class="mono note">{formatDuration(b?.duration ?? 0)}</span>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if decoded.build.bleeding || decoded.build.burning}
				<section>
					<h2>Condition</h2>
					<p class="quiet">
						Figures assume bleeding level {decoded.build.bleeding}{decoded.build.burning
							? ', and on fire'
							: ''}.
					</p>
				</section>
			{/if}
		</div>

		<div class="column">
			{#if result}
				<EstimatePanel {result} meta={gear.stats} {lang} />
				<section>
					<h2>Totals</h2>
					<StatTable stats={result.stats} meta={gear.stats} {lang} />
				</section>
			{/if}
		</div>
	</div>
{/if}

<ConnectPrompt action="vote" open={promptOpen} onclose={() => (promptOpen = false)} />

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: start;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
		padding-bottom: var(--space-3);
		border-bottom: var(--border-width) solid var(--border);
	}

	h1 {
		margin: 0;
	}

	.by {
		margin: var(--space-1) 0 0;
		font-size: var(--text-sm);
		color: var(--text-faint);
	}

	.private {
		margin-left: var(--space-2);
		padding: 1px var(--space-2);
		border-radius: 99px;
		border: var(--border-width) solid var(--warn);
		color: var(--warn);
		font-size: var(--text-xs);
	}

	.tags {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: var(--space-2) 0 0;
		padding: 0;
	}

	.tags a {
		font-size: var(--text-xs);
		color: var(--text-faint);
		text-decoration: none;
		border-bottom: 1px dotted var(--border-strong);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 22rem);
		gap: var(--space-5);
		align-items: start;
	}

	@media (max-width: 900px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.column {
		display: grid;
		gap: var(--space-5);
		min-width: 0;
	}

	section {
		display: grid;
		gap: var(--space-2);
	}

	h2 {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.gear {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-5);
		margin: 0;
	}

	.gear div {
		display: grid;
		gap: 2px;
	}

	.gear dt {
		font-size: var(--text-xs);
		color: var(--text-faint);
	}

	.gear dd {
		margin: 0;
	}

	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-1);
	}

	.items li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-1);
		background: var(--surface);
		font-size: var(--text-sm);
	}

	.item-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.note {
		color: var(--text-faint);
		font-size: var(--text-xs);
	}

	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.quiet {
		color: var(--text-faint);
		font-size: var(--text-sm);
	}
</style>
