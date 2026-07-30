<script lang="ts">
	import CompatTable from '$lib/components/CompatTable.svelte';
	import { itemName, rankSlug } from '$lib/items';
	import { lang as displayLang } from '$lib/lang.svelte';
	import { Card } from 'sveltekit-commons';

	let { data } = $props();

	const lang = $derived(displayLang());
	const name = $derived(itemName(data.entity, lang));

	const label = (l: Record<string, string>, fallback = '') => l[lang] ?? l.en ?? fallback;

	/* Two shapes, because two kinds of thing. Paints used to be a third and are
	   now their own tab.
	   - measured: parts with numbers, so a table you can sort and compare
	   - plain:    parts with none — charms and tokens, where a table would be a
	               column of names and nothing else */
	const measured = $derived(data.groups.filter((g) => g.columns.length));
	const plain = $derived(data.groups.filter((g) => !g.columns.length));
</script>

<svelte:head>
	<title>{name} compatibility — Stalzone</title>
	<meta
		name="description"
		content="The {data.total} parts compatible with {name} in STALZONE, grouped by slot with their stats."
	/>
</svelte:head>

<!-- No page heading: the tab bar already says Compatible, the shell's crumb says
     which item, and each section carries its own name and count. -->

{#each measured as g (g.key)}
	<section>
		<h2>{label(g.label, g.key)} <span class="count">{g.items.length}</span></h2>
		<CompatTable
			label={label(g.label, g.key)}
			columns={g.columns}
			rows={g.items}
			meta={data.statMeta}
			{lang}
		/>
	</section>
{/each}

{#each plain as g (g.key)}
	<section>
		<h2>{label(g.label, g.key)} <span class="count">{g.items.length}</span></h2>
		<Card class="block" pad={false}>
			<ul class="cards">
				{#each g.items as c (c.id)}
					<li style="--rank: var(--rank-{rankSlug(c.rank)})">
						<a href="/entities/{c.slug}">
							{#if c.icon}
								<img class="icon" src={c.icon} alt="" width="28" height="28" loading="lazy" />
							{/if}
							<span>{label(c.name, c.id)}</span>
						</a>
					</li>
				{/each}
			</ul>
		</Card>
	</section>
{/each}


<style>
	section {
		margin-bottom: var(--space-5);
	}

	/* A section heading, but scaled down: nine of them on a rifle's page is a
	   different weight of thing from the one heading a tab leads with. */
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

	.cards :global(img) {
		width: 28px;
		height: 28px;
		object-fit: contain;
	}

</style>
