<script lang="ts">
	import { itemName, rankSlug } from '$lib/items';
	import { lang as displayLang } from '$lib/lang.svelte';
	import { Card } from 'sveltekit-commons';

	let { data } = $props();

	const lang = $derived(displayLang());
	const name = $derived(itemName(data.entity, lang));
	const label = (l: Record<string, string>, fallback = '') => l[lang] ?? l.en ?? fallback;
</script>

<svelte:head>
	<title>{name} paints and camo — Stalzone</title>
	<meta
		name="description"
		content="Skins and paints for {name} in STALZONE: {data.skins.length} named finishes made for it and {data.paints.length} camouflage patterns it can wear."
	/>
</svelte:head>

<!-- No folds: this is the whole tab, and there is nothing to collapse away
     from. Neither kind carries a number worth tabulating, so both stay grids
     rather than tables. -->
{#if data.skins.length}
	<section>
		<h2>{label(data.skinsLabel)} <span class="count">{data.skins.length}</span></h2>
		<Card class="block" pad={false}>
			<ul class="cards">
				{#each data.skins as c (c.id)}
					<li style="--rank: var(--rank-{rankSlug(c.rank)})">
						<a href="/entities/{c.slug}">
							{#if c.icon}
								<img class="icon" src={c.icon} alt="" width="28" height="28" loading="lazy" />
							{/if}
							<span class="nm">{label(c.name, c.id)}</span>
							<span class="kind">{label(c.kind)}</span>
						</a>
					</li>
				{/each}
			</ul>
		</Card>
	</section>
{/if}

{#if data.paints.length}
	<section>
		<h2>{label(data.paintsLabel)} <span class="count">{data.paints.length}</span></h2>
		<Card class="block" pad={false}>
			<ul class="cards">
				{#each data.paints as c (c.id)}
					<li style="--rank: var(--rank-{rankSlug(c.rank)})">
						<a href="/entities/{c.slug}">
							{#if c.icon}
								<img class="icon" src={c.icon} alt="" width="28" height="28" loading="lazy" />
							{/if}
							<span class="nm">{label(c.name, c.id)}</span>
						</a>
					</li>
				{/each}
			</ul>
		</Card>
	</section>
{/if}

<style>
	section {
		margin-bottom: var(--space-5);
	}

	section h2 {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin: 0 0 var(--space-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-dim);
	}

	.cards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 2px;
	}

	.cards a {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		border-left: 2px solid var(--rank);
		border-radius: var(--radius-1);
		font-size: var(--text-sm);
		text-decoration: none;
	}

	.cards a:hover {
		background: var(--surface-raised);
	}

	.nm {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* "Weapon motif" or "Weapon Style" — the two are different things in game and
	   the names alone do not say which is which. */
	.kind {
		margin-left: auto;
		padding-left: var(--space-2);
		font-family: var(--font-mono);
		font-size: 9.5px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-faint);
		white-space: nowrap;
	}

	.cards :global(img) {
		width: 28px;
		height: 28px;
		object-fit: contain;
	}
</style>
