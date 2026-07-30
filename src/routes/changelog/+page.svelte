<script lang="ts">
	/**
	 * Every release, newest first.
	 *
	 * `minor` entries do not get a card — they are the ones a player would not
	 * notice unless told — but they are not hidden either: they run along the
	 * foot of their release as one "Also:" line, which is the amount of room
	 * they are worth.
	 *
	 * The heading is in the top bar, like every other page here (see the crumb
	 * snippet in +layout.svelte), so this file starts at the first release.
	 */
	import { ChangeChip } from 'sveltekit-commons';
	import { AREA_LABELS } from '$lib/changelog';

	let { data } = $props();
</script>

<svelte:head>
	<title>Changelog — Stalzone</title>
	<meta
		name="description"
		content="What changed on Stalzone, release by release: new pages, freshly vendored game data, and fixes."
	/>
</svelte:head>

<p class="note">What changed on this site, release by release.</p>

{#each data.releases as rel (rel.version)}
	{@const shown = rel.entries.filter((e) => e.impact !== 'minor')}
	{@const minor = rel.entries.filter((e) => e.impact === 'minor')}
	<section class="release">
		<header class="rel-head">
			<h2>{rel.version}</h2>
			{#if rel.date}<time datetime={rel.date}>{rel.date}</time>{/if}
		</header>

		<div class="entries">
			{#each shown as e (e.title)}
				<article class="entry" class:major={e.impact === 'major'}>
					<header>
						<ChangeChip type={e.type} />
						<h3>{e.title}</h3>
						<span class="area">{AREA_LABELS[e.area] ?? e.area}</span>
					</header>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- the sanitized
					     subset from our own committed files; see commons/changelog -->
					<div class="body">{@html e.html}</div>
				</article>
			{/each}

			{#if minor.length}
				<p class="also">Also: {minor.map((e) => e.title).join(' · ')}</p>
			{/if}
		</div>
	</section>
{/each}

<style>
	.note {
		margin: 0 0 var(--space-5);
		color: var(--text-dim);
	}

	.release {
		margin-bottom: var(--space-6);
	}

	.rel-head {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
	}

	.rel-head h2 {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-lg);
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.rel-head time {
		font-size: var(--text-xs);
		color: var(--text-faint);
	}

	.entries {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.entry {
		background: var(--surface);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-3);
		box-shadow: var(--shadow-1);
		padding: var(--space-3) var(--space-4);
	}

	/* the flagship of its release, marked on the edge rather than by a louder
	   card — a release with two of these should still read as one list */
	.entry.major {
		border-left: 3px solid var(--accent);
	}

	.entry header {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-3);
	}

	.entry h3 {
		margin: 0;
		font-size: var(--text-md);
		font-weight: 650;
		letter-spacing: -0.01em;
	}

	.area {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-faint);
		white-space: nowrap;
	}

	.body {
		margin-top: var(--space-2);
		color: var(--text-dim);
		line-height: 1.6;
	}

	.body :global(p) {
		margin: 0 0 var(--space-2);
	}

	.body :global(p:last-child),
	.body :global(ul:last-child) {
		margin-bottom: 0;
	}

	.body :global(ul) {
		margin: 0 0 var(--space-2);
		padding-left: 1.2em;
	}

	.body :global(code) {
		font-family: var(--font-mono);
		font-size: 0.9em;
		background: var(--surface-sunken);
		border-radius: var(--radius-1);
		padding: 0 0.35em;
	}

	.body :global(strong) {
		color: var(--text);
	}

	.also {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-faint);
		text-wrap: pretty;
	}
</style>
