<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>STALZONE database — items, weapons, armor, artefacts</title>
	<meta
		name="description"
		content="Every STALZONE item: weapons, armor, artefacts and attachments, with full stats, upgrade levels and compatibility."
	/>
</svelte:head>

<section class="hero">
	<h1>The STALZONE item database</h1>
	<p class="lede">
		{data.total.toLocaleString('en')} items across {data.groups.length} categories, with stats, upgrade
		levels and compatibility — in five languages.
	</p>
</section>

<ul class="groups">
	{#each data.groups as g (g.name)}
		<li>
			<a href="/items/{g.name}">
				<span class="name">{g.name.replace(/_/g, ' ')}</span>
				<span class="count">{g.count.toLocaleString('en')}</span>
			</a>
		</li>
	{/each}
</ul>

<p class="provenance">
	Built from upstream <code>{data.source.sha.slice(0, 8)}</code>, pushed
	{data.source.committedAt.slice(0, 10)} · realm <code>{data.realm}</code>
</p>

<style>
	.hero {
		margin-bottom: var(--space-6);
	}

	.lede {
		margin-top: var(--space-3);
		max-width: 46ch;
		color: var(--text-dim);
	}

	.groups {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
		gap: var(--space-3);
	}

	.groups a {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		background: var(--surface);
		text-decoration: none;
	}

	.groups a:hover {
		background: var(--surface-raised);
		border-color: var(--accent-dim);
	}

	.name {
		text-transform: capitalize;
	}

	.count {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--text-faint);
	}

	.provenance {
		margin-top: var(--space-6);
		font-size: var(--text-xs);
		color: var(--text-faint);
	}

	code {
		font-family: var(--font-mono);
	}
</style>
