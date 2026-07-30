<script lang="ts">
	/**
	 * Builds — the community list, and your own shelf.
	 *
	 * Two lists that mean different things. The top one is everyone's, comes
	 * from the server, and is what upvoting acts on. The bottom one is this
	 * browser's, comes from local storage, and says of each entry whether it is
	 * local-only, private on your account, or public.
	 *
	 * They are deliberately not merged into one: "saved" and "published" are
	 * different states, and a single list would have to pick a word that lies
	 * about one of them.
	 */
	import { onMount } from 'svelte';
	import { Button } from 'sveltekit-commons';

	import ConnectPrompt from '$lib/components/calc/ConnectPrompt.svelte';
	import PublishDialog from '$lib/components/calc/PublishDialog.svelte';
	import VoteButton from '$lib/components/calc/VoteButton.svelte';

	import { computeBuild, indexGear, type BuildState } from '$lib/calc/build';
	import { decodeBuild } from '$lib/calc/codec';
	import { loadGear } from '$lib/calc/load';
	import { TAG_LABELS, type PublishedBuild } from '$lib/calc/publish';
	import {
		deleteBuild,
		linkRemote,
		loadSavedBuilds,
		reconcile,
		renameBuild,
		savedBuilds,
		syncState,
		unlinkRemote,
		type SavedBuild
	} from '$lib/calc/storage.svelte';
	import type { GearIndex } from '$lib/calc/types';
	import { lang as displayLang } from '$lib/lang.svelte';

	let { data } = $props();

	const lang = $derived(displayLang());

	let gear = $state<GearIndex | null>(null);
	let mounted = $state(false);
	let renaming = $state<string | null>(null);
	let draftName = $state('');
	let promptOpen = $state(false);
	let promptAction = $state<'vote' | 'publish'>('vote');
	let publishing = $state<SavedBuild | null>(null);

	onMount(async () => {
		loadSavedBuilds();
		mounted = true;

		loadGear(lang)
			.then((g) => (gear = g))
			.catch(() => {
				// summaries stay quiet; the lists still work
			});

		// what the account holds may differ from what this browser remembers —
		// published elsewhere, or deleted elsewhere
		if (data.user) {
			try {
				const r = await fetch('/api/builds/mine');
				if (r.ok) reconcile(((await r.json()) as { builds: PublishedBuild[] }).builds);
			} catch {
				// offline: the local list is still correct about itself
			}
		}
	});

	const builds = $derived(mounted ? savedBuilds() : []);
	const lookup = $derived(gear ? indexGear(gear) : null);

	function summarise(query: string) {
		const { build, weapon } = decodeBuild(new URLSearchParams(query));
		const parts: string[] = [];
		const suit = build.armor ? gear?.armor.find((a) => a.id === build.armor?.id) : null;
		if (suit) parts.push(build.armor?.level ? `${suit.name} +${build.armor.level}` : suit.name);
		const filled = build.artefacts.filter((a) => a.id).length;
		if (filled) parts.push(`${filled} artefact${filled === 1 ? '' : 's'}`);
		if (build.buffs.length) parts.push(`${build.buffs.length} buff${build.buffs.length === 1 ? '' : 's'}`);
		if (weapon?.id) parts.push('weapon');
		return { text: parts.join(' · ') || 'Empty build', build };
	}

	function ehpOf(build: BuildState): number | null {
		if (!lookup) return null;
		return Math.round(computeBuild(build, lookup).effectiveHealth);
	}

	function askToConnect(action: 'vote' | 'publish') {
		promptAction = action;
		promptOpen = true;
	}

	function startPublish(entry: SavedBuild) {
		if (!data.user) return askToConnect('publish');
		publishing = entry;
	}

	function onPublished(build: PublishedBuild) {
		if (publishing) linkRemote(publishing.id, build);
		publishing = null;
	}

	async function unpublish(entry: SavedBuild) {
		if (!entry.slug) return;
		try {
			const r = await fetch(`/api/builds/${entry.slug}`, { method: 'DELETE' });
			// gone either way, as far as this device is concerned
			if (r.ok || r.status === 404) unlinkRemote(entry.id);
		} catch {
			// leave the row as it is; the next reconcile will settle it
		}
	}

	function startRename(entry: SavedBuild) {
		renaming = entry.id;
		draftName = entry.name;
	}

	function commitRename(id: string) {
		renameBuild(id, draftName);
		renaming = null;
	}

	function formatDate(ms: number): string {
		return new Date(ms).toLocaleDateString(lang === 'ko' ? 'ko-KR' : lang, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	const votedSet = $derived(new Set(data.voted));

	const SYNC_LABEL = {
		local: 'This browser only',
		private: 'Private',
		public: 'Public'
	} as const;
</script>

<svelte:head>
	<title>Builds — Stalzone</title>
	<meta
		name="description"
		content="Community STALZONE builds: suits, containers, artefacts and buffs with the protections and effective health they add up to. Browse, upvote, or plan your own."
	/>
</svelte:head>

<section class="hero">
	<p class="lede">
		Put a loadout together and see what it actually adds up to — protections, accumulation,
		effective health, and what every artefact contributes to each. Nothing here needs an account,
		and every build lives in its own link.
	</p>
	<Button href="/builds/create">Open the calculator</Button>
</section>

<section>
	<div class="head">
		<h2>Community builds</h2>
		<div class="filters">
			<a class="filter" class:on={data.sort === 'top'} href="/builds?sort=top">Top</a>
			<a class="filter" class:on={data.sort === 'new'} href="/builds?sort=new">New</a>
		</div>
	</div>

	{#if data.tag}
		<p class="quiet">
			Filtered to {TAG_LABELS[data.tag] ?? data.tag}. <a href="/builds">Show all</a>.
		</p>
	{/if}

	{#if !data.storage}
		<p class="quiet">Build storage is not configured on this server yet.</p>
	{:else if data.builds.length === 0}
		<p class="quiet">
			No public builds yet. {data.user ? 'Publish one and it lands here.' : 'Yours could be first.'}
		</p>
	{:else}
		<ul class="published">
			{#each data.builds as build (build.slug)}
				{@const summary = summarise(build.query)}
				{@const ehp = ehpOf(summary.build)}
				<li>
					<VoteButton
						slug={build.slug}
						votes={build.votes}
						voted={votedSet.has(build.slug)}
						onunauthorised={() => askToConnect('vote')}
					/>
					<a class="open" href="/builds/{build.slug}">
						<span class="name">{build.name}</span>
						<span class="summary">{summary.text}</span>
					</a>
					<div class="meta">
						{#if ehp !== null}<span class="ehp mono">{ehp} EHP</span>{/if}
						<span class="by">{build.author.name}</span>
					</div>
					{#if build.tags.length}
						<ul class="tags">
							{#each build.tags as tag (tag)}
								<li><a href="/builds?tag={tag}">{TAG_LABELS[tag] ?? tag}</a></li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section>
	<h2>Your builds</h2>

	{#if !mounted}
		<p class="quiet">Loading…</p>
	{:else if builds.length === 0}
		<p class="quiet">
			Nothing saved yet. Builds you save in the calculator are kept in this browser and appear
			here.
		</p>
	{:else}
		<ul class="mine">
			{#each builds as entry (entry.id)}
				{@const summary = summarise(entry.query)}
				{@const ehp = ehpOf(summary.build)}
				{@const state = syncState(entry)}
				<li>
					{#if renaming === entry.id}
						<div class="open">
							<!-- svelte-ignore a11y_autofocus -- the field appeared because it was asked for -->
							<input
								class="rename"
								type="text"
								bind:value={draftName}
								autofocus
								onkeydown={(e) => {
									if (e.key === 'Enter') commitRename(entry.id);
									if (e.key === 'Escape') renaming = null;
								}}
								onblur={() => commitRename(entry.id)}
							/>
							<span class="summary">{summary.text}</span>
						</div>
					{:else}
						<a class="open" href="/builds/create?{entry.query}">
							<span class="name">{entry.name}</span>
							<span class="summary">{summary.text}</span>
						</a>
					{/if}

					<div class="meta">
						<span class="sync {state}" title={entry.slug ? `Synced as ${entry.slug}` : undefined}>
							<span class="dot" aria-hidden="true"></span>
							{SYNC_LABEL[state]}
						</span>
						{#if ehp !== null}<span class="ehp mono">{ehp} EHP</span>{/if}
						<span class="date">{formatDate(entry.savedAt)}</span>
					</div>

					<div class="row-actions">
						{#if state === 'local'}
							<button type="button" onclick={() => startPublish(entry)}>Publish…</button>
						{:else}
							<a href="/builds/{entry.slug}">View</a>
							<button type="button" onclick={() => startPublish(entry)}>Edit…</button>
							<button type="button" onclick={() => unpublish(entry)}>Unpublish</button>
						{/if}
						<button type="button" onclick={() => startRename(entry)}>Rename</button>
						<button type="button" class="danger" onclick={() => deleteBuild(entry.id)}>Delete</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	{#if !data.user}
		<p class="quiet">
			These are kept in this browser. Connecting an EXBO account lets you publish them, keep them
			across devices, and upvote other people's.
		</p>
	{/if}
</section>

<ConnectPrompt action={promptAction} open={promptOpen} onclose={() => (promptOpen = false)} />

{#if publishing}
	<PublishDialog
		open={true}
		query={publishing.query}
		name={publishing.name}
		visibility={publishing.visibility ?? 'public'}
		slug={publishing.slug}
		onclose={() => (publishing = null)}
		onpublished={onPublished}
		onunauthorised={() => askToConnect('publish')}
	/>
{/if}

<style>
	.hero {
		display: grid;
		justify-items: start;
		gap: var(--space-3);
		margin-bottom: var(--space-6);
	}

	.lede {
		max-width: 62ch;
		margin: 0;
		color: var(--text-dim);
	}

	section + section {
		margin-top: var(--space-6);
	}

	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
	}

	h2 {
		margin: 0 0 var(--space-3);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.filters {
		display: flex;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}

	.filter {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-faint);
		text-decoration: none;
	}

	.filter.on {
		color: var(--accent);
	}

	.quiet {
		max-width: 62ch;
		color: var(--text-faint);
		font-size: var(--text-sm);
	}

	.published,
	.mine {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2);
	}

	.published li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		padding: var(--space-3);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		background: var(--surface);
	}

	.mine li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--space-1) var(--space-3);
		padding: var(--space-3);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		background: var(--surface);
	}

	.open {
		display: grid;
		gap: 2px;
		min-width: 0;
		text-decoration: none;
		color: inherit;
	}

	.open:hover .name {
		color: var(--accent);
	}

	.name {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.rename {
		width: 100%;
	}

	.summary {
		font-size: var(--text-sm);
		color: var(--text-dim);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		justify-content: end;
		font-size: var(--text-xs);
		color: var(--text-faint);
	}

	.ehp {
		color: var(--accent);
	}

	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	/* the status chip: a coloured dot rather than three different words in three
	   different colours, so the state is scannable down the column */
	.sync {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		white-space: nowrap;
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--text-faint);
	}

	.sync.public .dot {
		background: var(--ok);
	}

	.sync.private .dot {
		background: var(--warn);
	}

	.sync.local .dot {
		background: none;
		border: 1px solid var(--text-faint);
	}

	.tags {
		grid-column: 2 / -1;
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
	}

	.tags a {
		font-size: var(--text-xs);
		color: var(--text-faint);
		text-decoration: none;
		border-bottom: 1px dotted var(--border-strong);
	}

	.tags a:hover {
		color: var(--text);
	}

	.row-actions {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-top: var(--space-2);
		padding-top: var(--space-2);
		border-top: var(--border-width) solid var(--border);
	}

	.row-actions button,
	.row-actions a {
		border: none;
		background: none;
		padding: 0;
		color: var(--text-faint);
		font-size: var(--text-xs);
		text-decoration: none;
		cursor: pointer;
	}

	.row-actions button:hover,
	.row-actions a:hover {
		color: var(--text);
	}

	.row-actions .danger:hover {
		color: var(--danger);
	}

	.by {
		max-width: 14ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
