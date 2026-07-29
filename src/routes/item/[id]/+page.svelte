<script lang="ts">
	import DamageChart from '$lib/components/DamageChart.svelte';
	import RecipePanel from '$lib/components/RecipePanel.svelte';
	import { damageAtLevel, formatStat, itemName, rankSlug, statsAtLevel } from '$lib/items';
	import type { Lang } from '$lib/types';

	let { data } = $props();

	const lang: Lang = 'en';

	let level = $state(0);

	let item = $derived(data.item);
	let stats = $derived(statsAtLevel(item, level));
	let damage = $derived(damageAtLevel(item, level));
	// what level 0 looked like, so the chart can show what the upgrade bought
	let baseDamage = $derived(level > 0 ? item.damage : null);

	/** Stats whose value differs from level 0 — highlighted while upgrading. */
	let changed = $derived(
		new Set(
			level === 0
				? []
				: Object.keys(stats).filter((k) => stats[k] !== item.stats[k])
		)
	);

	let statRows = $derived(
		Object.entries(stats)
			.map(([slug, value]) => ({ slug, value, meta: data.statMeta[slug] }))
			.filter((r) => r.meta)
			.sort((a, b) => (a.meta.label.en ?? '').localeCompare(b.meta.label.en ?? ''))
	);

	let rangeRows = $derived(
		Object.entries(item.ranges)
			.map(([slug, r]) => ({ slug, r, meta: data.statMeta[slug] }))
			.filter((r) => r.meta)
	);

	let enumRows = $derived(
		Object.entries(item.enums)
			.map(([slug, key]) => ({ slug, key, meta: data.statMeta[slug] }))
			.filter((r) => r.meta)
	);
</script>

<svelte:head>
	<title>{itemName(item, lang)} — STALZONE database</title>
	<meta
		name="description"
		content="{itemName(item, lang)} — {item.category} stats, upgrade levels and compatibility in STALZONE."
	/>
</svelte:head>

<nav class="crumbs">
	<a href="/items">Items</a> <span aria-hidden="true">/</span>
	<a href="/items/{item.group}">{item.group.replace(/_/g, ' ')}</a>
</nav>

<header class="head" style="--rank: var(--rank-{rankSlug(item.rank)})">
	{#if item.icon}
		<img class="icon" src={item.icon} alt="" width="72" height="72" />
	{/if}
	<div>
		<h1>{itemName(item, lang)}</h1>
		<p class="meta">
			<span class="rank">{rankSlug(item.rank)}</span>
			<span>{item.kind.replace(/_/g, ' ')}</span>
			{#if item.usedInCrafts}<span class="tag">used in crafting</span>{/if}
		</p>
	</div>
</header>

<div class="cols">
	<section>
		{#if data.maxLevel > 0}
			<div class="upgrade">
				<label for="level">
					Upgrade level <strong>{level}</strong> / {data.maxLevel}
				</label>
				<input id="level" type="range" min="0" max={data.maxLevel} step="1" bind:value={level} />
			</div>
		{/if}

		{#if statRows.length || enumRows.length || rangeRows.length}
			<table>
				<tbody>
					{#each enumRows as r (r.slug)}
						<tr>
							<th scope="row">{r.meta.label[lang] ?? r.meta.label.en ?? r.slug}</th>
							<td>{data.enumLabels[r.key]?.[lang] ?? data.enumLabels[r.key]?.en ?? r.key}</td>
						</tr>
					{/each}
					{#each statRows as r (r.slug)}
						<tr class:changed={changed.has(r.slug)}>
							<th scope="row">{r.meta.label[lang] ?? r.meta.label.en ?? r.slug}</th>
							<td>{formatStat(r.value, r.meta, lang)}</td>
						</tr>
					{/each}
					{#each rangeRows as r (r.slug)}
						<tr>
							<th scope="row">{r.meta.label[lang] ?? r.meta.label.en ?? r.slug}</th>
							<td>
								{formatStat(r.r.min, r.meta, lang)} – {formatStat(r.r.max, r.meta, lang)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p class="empty">This item carries no stats.</p>
		{/if}

		{#each item.texts as t, i (i)}
			{#if t.text[lang] ?? t.text.en}
				<p class="note">
					{#if t.title}<strong>{t.title[lang] ?? t.title.en}:</strong>{/if}
					{t.text[lang] ?? t.text.en}
				</p>
			{/if}
		{/each}
	</section>

	<section>
		{#if damage}
			<h2>Damage</h2>
			<DamageChart {damage} base={baseDamage} />
		{/if}

		<RecipePanel {...data.recipes} {lang} />

		{#if data.compatible.length}
			<h2>Compatible <span class="count">{data.compatible.length}</span></h2>
			<ul class="compat">
				{#each data.compatible as c (c.id)}
					<li style="--rank: var(--rank-{rankSlug(c.rank)})">
						<a href="/item/{c.id}">
							{#if c.icon}
								<img class="icon" src={c.icon} alt="" width="28" height="28" loading="lazy" />
							{/if}
							<span>{c.name[lang] ?? c.name.en ?? c.id}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<style>
	.crumbs {
		font-size: var(--text-xs);
		color: var(--text-faint);
		margin-bottom: var(--space-3);
	}

	.crumbs a {
		color: var(--text-dim);
		text-decoration: none;
		text-transform: capitalize;
	}

	.crumbs a:hover {
		color: var(--text);
	}

	.head {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding-bottom: var(--space-4);
		border-bottom: 2px solid var(--rank);
		margin-bottom: var(--space-5);
	}

	.head .icon {
		width: 72px;
		height: 72px;
		object-fit: contain;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-top: var(--space-2);
		font-size: var(--text-sm);
		color: var(--text-dim);
		text-transform: capitalize;
	}

	.rank {
		color: var(--rank);
		font-weight: 600;
	}

	.tag {
		font-size: var(--text-xs);
		padding: 0 var(--space-2);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-1);
		color: var(--text-faint);
	}

	.cols {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--space-6);
		align-items: start;
	}

	@media (max-width: 52rem) {
		.cols {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.upgrade {
		margin-bottom: var(--space-4);
		padding: var(--space-3);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		background: var(--surface);
	}

	.upgrade label {
		display: block;
		font-size: var(--text-sm);
		color: var(--text-dim);
		margin-bottom: var(--space-2);
	}

	.upgrade strong {
		color: var(--accent);
		font-family: var(--font-mono);
	}

	.upgrade input {
		width: 100%;
		accent-color: var(--accent);
	}

	table {
		width: 100%;
		font-size: var(--text-sm);
	}

	th,
	td {
		padding: var(--space-2) 0;
		border-bottom: var(--border-width) solid var(--border);
		text-align: left;
		font-weight: 400;
	}

	th {
		color: var(--text-dim);
	}

	td {
		font-family: var(--font-mono);
		text-align: right;
	}

	/* what the current upgrade level actually changed */
	tr.changed td {
		color: var(--accent);
	}

	h2 {
		font-size: var(--text-base);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-dim);
		margin-bottom: var(--space-3);
	}

	h2:not(:first-child) {
		margin-top: var(--space-6);
	}

	.count {
		font-family: var(--font-mono);
		color: var(--text-faint);
		letter-spacing: 0;
	}

	.compat {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 2px;
		max-height: 26rem;
		overflow-y: auto;
	}

	.compat a {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		border-left: 2px solid var(--rank);
		border-radius: var(--radius-1);
		font-size: var(--text-sm);
		text-decoration: none;
	}

	.compat a:hover {
		background: var(--surface-raised);
	}

	.compat img {
		width: 28px;
		height: 28px;
		object-fit: contain;
	}

	.note {
		margin-top: var(--space-4);
		font-size: var(--text-sm);
		color: var(--text-dim);
	}

	.empty {
		color: var(--text-dim);
	}
</style>
