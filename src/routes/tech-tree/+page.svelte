<script lang="ts">
	import { itemName, rankSlug } from '$lib/items';
	import { lang as displayLang } from '$lib/lang.svelte';

	let { data } = $props();

	const lang = $derived(displayLang());
	const pretty = (s: string) => s.replace(/_/g, ' ');
</script>

<svelte:head>
	<title>Tech tree — Stalzone</title>
	<meta
		name="description"
		content="Every gear upgrade path in STALZONE — weapons, armor, attachments, backpacks and containers — reconstructed from the game's own barter data."
	/>
</svelte:head>

<p class="lede">
	Traders do not just sell gear, they take the piece you own and hand back the next one up. Those
	trades chain, and the chains are the progression the game shows in a gear tooltip. Every step
	below is one of them, read straight out of EXBO's own barter data.
</p>

<ul class="groups">
	{#each data.groups as g (g.group)}
		<li>
			<a href="/tech-tree/{g.group}">
				<h2>{pretty(g.group)}</h2>
				<p class="count">
					{g.items} items · {g.steps} upgrades · {g.trees} branches · {g.tiers} tiers deep
				</p>
				<ol class="chain">
					{#each g.chain as item (item.id)}
						<li style="--rank: var(--rank-{rankSlug(item.rank)})">
							{#if item.icon}
								<img class="icon" src={item.icon} alt="" width="26" height="26" loading="lazy" />
							{/if}
							<span class="name">{itemName(item, lang)}</span>
						</li>
					{/each}
				</ol>
			</a>
		</li>
	{/each}
</ul>

<style>
	.lede {
		max-width: 62ch;
		margin-bottom: var(--space-6);
		color: var(--text-dim);
	}

	.groups {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-3);
	}

	.groups > li > a {
		display: block;
		padding: var(--space-4);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		background: var(--surface);
		text-decoration: none;
		color: inherit;
	}

	.groups > li > a:hover {
		background: var(--surface-raised);
		border-color: var(--border-strong);
	}

	h2 {
		font-size: var(--text-base);
		text-transform: capitalize;
	}

	.count {
		margin-top: var(--space-1);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-faint);
	}

	/* The sample chain is the group's longest line. It wraps rather than
	   scrolls — this is a teaser, and a horizontal scrollbar on a card reads as
	   a control the card does not have. */
	.chain {
		list-style: none;
		margin: var(--space-3) 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
	}

	.chain li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-xs);
		color: var(--text-dim);
	}

	/* the separator belongs between two items, so it hangs off the second one
	   rather than being an element the markup has to interleave */
	.chain li:not(:first-child)::before {
		content: '→';
		color: var(--text-faint);
	}

	.chain img {
		border-left: 2px solid var(--rank);
		padding-left: var(--space-1);
	}

	.chain img {
		width: 26px;
		height: 26px;
		box-sizing: content-box;
		object-fit: contain;
	}

	.name {
		max-width: 16ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
