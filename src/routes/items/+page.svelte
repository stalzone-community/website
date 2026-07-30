<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>Items — Stalzone</title>
</svelte:head>

<h1>Items</h1>

<ul class="groups">
	{#each data.groups as g (g.name)}
		<li>
			<a href="/items/{g.name}">
				<div class="head">
					<span class="name">{g.name.replace(/_/g, ' ')}</span>
					<span class="count">{g.count.toLocaleString('en')}</span>
				</div>
				<div class="sample">
					{#each g.sample as s (s.id)}
						<img class="icon" src={s.icon} alt="" width="32" height="32" loading="lazy" />
					{/each}
				</div>
			</a>
		</li>
	{/each}
</ul>

<style>
	h1 {
		margin-bottom: var(--space-5);
	}

	.groups {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: var(--space-3);
	}

	.groups a {
		display: block;
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

	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--space-3);
	}

	.name {
		text-transform: capitalize;
	}

	.count {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--text-faint);
	}

	.sample {
		display: flex;
		gap: var(--space-1);
		margin-top: var(--space-2);
		opacity: 0.75;
	}

	.sample img {
		width: 32px;
		height: 32px;
		object-fit: contain;
	}
</style>
