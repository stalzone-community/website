<script lang="ts">
	/**
	 * The build calculator.
	 *
	 * The URL is the state. Every change rewrites the query string, so the
	 * address bar is always a working share link, the back button undoes a
	 * choice, and a reload keeps the build — none of which needs an account or
	 * a round trip. Saving only copies that query string into local storage.
	 *
	 * Data loads in the browser, not through a `load`: this page is prerendered,
	 * and a fetch inside a load would be inlined into the prerendered HTML,
	 * putting a 500 KB payload in a document that could have fetched it lazily.
	 * Weapons load only when that tab is opened.
	 */
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from 'sveltekit-commons';

	import ArtefactSlots from '$lib/components/calc/ArtefactSlots.svelte';
	import ConnectPrompt from '$lib/components/calc/ConnectPrompt.svelte';
	import EstimatePanel from '$lib/components/calc/EstimatePanel.svelte';
	import ItemPicker from '$lib/components/calc/ItemPicker.svelte';
	import PublishDialog from '$lib/components/calc/PublishDialog.svelte';
	import StatTable from '$lib/components/calc/StatTable.svelte';
	import WeaponPanel from '$lib/components/calc/WeaponPanel.svelte';

	import { computeBuild, emptyBuild, indexGear, MAX_BLEEDING, type BuildState } from '$lib/calc/build';
	import { buildHref, decodeBuild, encodeBuild } from '$lib/calc/codec';
	import { formatDuration, statLabel } from '$lib/calc/format';
	import { REACTION_STATS } from '$lib/calc/keys';
	import { statIcon, statTint } from '$lib/stat-icons';
	import { loadGear, loadWeapons } from '$lib/calc/load';
	import type { PublishedBuild } from '$lib/calc/publish';
	import { linkRemote, loadSavedBuilds, saveBuild } from '$lib/calc/storage.svelte';
	import type { GearIndex, WeaponIndex } from '$lib/calc/types';
	import type { WeaponState } from '$lib/calc/weapon';
	import { lang as displayLang } from '$lib/lang.svelte';

	const lang = $derived(displayLang());

	let build = $state<BuildState>(emptyBuild());
	let weapon = $state<WeaponState | null>(null);
	let tab = $state<'gear' | 'weapon'>('gear');
	let name = $state('');
	let savedAs = $state<string | null>(null);
	let copied = $state(false);
	let publishOpen = $state(false);
	let promptOpen = $state(false);
	/** set once this build has been published, so Publish becomes Update */
	let remote = $state<PublishedBuild | null>(null);

	let gear = $state<GearIndex | null>(null);
	let weaponIndex = $state<WeaponIndex | null>(null);
	let error = $state<string | null>(null);

	/* The URL is read once, on arrival. After that this component owns the
	   state and writes to the URL — reading it back on every change would fight
	   the very updates it just made. */
	onMount(() => {
		loadSavedBuilds();
		const decoded = decodeBuild(page.url.searchParams);
		build = decoded.build;
		weapon = decoded.weapon;
		if (weapon) tab = 'weapon';

		loadGear(lang)
			.then((g) => (gear = g))
			.catch(() => (error = 'The gear list could not be loaded. Reload to try again.'));
	});

	/* Language is a display choice on this site, so the payload has to follow it
	   — the numbers are the same, the names are not. */
	$effect(() => {
		const l = lang;
		if (gear && gear.lang !== l) loadGear(l).then((g) => (gear = g));
		if (weaponIndex && weaponIndex.lang !== l) loadWeapons(l).then((w) => (weaponIndex = w));
	});

	$effect(() => {
		if (tab !== 'weapon' || weaponIndex) return;
		loadWeapons(lang)
			.then((w) => (weaponIndex = w))
			.catch(() => (error = 'The weapon list could not be loaded. Reload to try again.'));
	});

	/* Push the build into the address bar. `replaceState` rather than a push:
	   dragging a quality slider would otherwise write a history entry per pixel. */
	$effect(() => {
		const query = encodeBuild(build, weapon).toString();
		if (typeof window === 'undefined') return;
		if (query === page.url.search.replace(/^\?/, '')) return;
		replaceState(query ? `?${query}` : page.url.pathname, {});
		copied = false;
	});

	const lookup = $derived(gear ? indexGear(gear) : null);
	const result = $derived(lookup ? computeBuild(build, lookup) : null);

	const container = $derived(
		build.container ? (gear?.containers.find((c) => c.id === build.container) ?? null) : null
	);
	const armor = $derived(
		build.armor ? (gear?.armor.find((a) => a.id === build.armor?.id) ?? null) : null
	);

	const armorOptions = $derived(
		[...(gear?.armor ?? [])]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((a) => ({ id: a.id, name: a.name, icon: a.icon, rank: a.rank, note: a.kind }))
	);

	const containerOptions = $derived(
		[...(gear?.containers ?? [])]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((c) => ({
				id: c.id,
				name: c.name,
				icon: c.icon,
				rank: c.rank,
				note: `${c.size} slot${c.size === 1 ? '' : 's'}`
			}))
	);

	const buffOptions = $derived(
		[...(gear?.buffs ?? [])]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((b) => ({
				id: b.id,
				name: b.name,
				icon: b.icon,
				rank: b.rank,
				note: formatDuration(b.duration)
			}))
	);

	const chosenBuffs = $derived(
		build.buffs.map((id) => gear?.buffs.find((b) => b.id === id)).filter((b) => b !== undefined)
	);

	function toggleReaction(slug: string) {
		build = {
			...build,
			reactions: build.reactions.includes(slug)
				? build.reactions.filter((r) => r !== slug)
				: [...build.reactions, slug]
		};
	}

	function addBuff(id: string | null) {
		if (!id || build.buffs.includes(id)) return;
		build = { ...build, buffs: [...build.buffs, id] };
	}

	function removeBuff(id: string) {
		build = { ...build, buffs: build.buffs.filter((b) => b !== id) };
	}

	function reset() {
		build = emptyBuild();
		weapon = null;
		name = '';
		savedAs = null;
	}

	function save() {
		const entry = saveBuild(name || 'Untitled build', encodeBuild(build, weapon).toString(), savedAs ?? undefined);
		savedAs = entry.id;
		name = entry.name;
		return entry;
	}

	/* Publishing implies saving: a build on the account that this browser had no
	   record of would come back as a stranger on the next reconcile. */
	function publish() {
		save();
		publishOpen = true;
	}

	function onPublished(build: PublishedBuild) {
		remote = build;
		name = build.name;
		if (savedAs) linkRemote(savedAs, build);
		publishOpen = false;
	}

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(new URL(buildHref(build, weapon), location.origin).href);
			copied = true;
		} catch {
			// clipboard blocked — the address bar already holds the same link
			copied = false;
		}
	}

	const isEmpty = $derived(
		!build.armor && !build.container && build.artefacts.length === 0 && build.buffs.length === 0 && !weapon
	);
</script>

<svelte:head>
	<title>Build calculator — Stalzone</title>
	<meta
		name="description"
		content="Plan a STALZONE loadout: suit, container, artefacts, buffs and weapon attachments, with the resulting protections, accumulation and effective health."
	/>
</svelte:head>

<div class="toolbar">
	<div class="tabs" role="tablist">
		<button
			role="tab"
			aria-selected={tab === 'gear'}
			class:on={tab === 'gear'}
			onclick={() => (tab = 'gear')}
		>
			Gear
		</button>
		<button
			role="tab"
			aria-selected={tab === 'weapon'}
			class:on={tab === 'weapon'}
			onclick={() => (tab = 'weapon')}
		>
			Weapon
		</button>
	</div>

	<div class="actions">
		<input class="name" type="text" bind:value={name} placeholder="Name this build" />
		<Button onclick={save} disabled={isEmpty}>{savedAs ? 'Saved' : 'Save'}</Button>
		<Button variant="ghost" onclick={copyLink} disabled={isEmpty}>
			{copied ? 'Link copied' : 'Copy link'}
		</Button>
		<Button variant="ghost" onclick={publish} disabled={isEmpty}>
			{remote ? 'Update…' : 'Publish…'}
		</Button>
		<Button variant="ghost" onclick={reset} disabled={isEmpty}>Reset</Button>
	</div>
</div>

{#if error}
	<p class="error">{error}</p>
{/if}

{#if tab === 'gear'}
	{#if !gear}
		<p class="loading">Loading gear…</p>
	{:else}
		<div class="layout">
			<div class="column">
				<section>
					<h2>Suit</h2>
					<ItemPicker
						label="Armour"
						options={armorOptions}
						value={build.armor?.id ?? null}
						onchange={(id) => (build = { ...build, armor: id ? { id, level: build.armor?.level ?? 0 } : null })}
					/>
					{#if armor && build.armor}
						<label class="level">
							<span>Upgrade level</span>
							<span class="level-row">
								<input
									type="range"
									min="0"
									max="15"
									value={build.armor.level}
									oninput={(e) =>
										(build = {
											...build,
											armor: { id: build.armor!.id, level: Number(e.currentTarget.value) }
										})}
								/>
								<output class="mono">{build.armor.level}</output>
							</span>
						</label>
					{/if}
				</section>

				<section>
					<h2>Container</h2>
					<ItemPicker
						label="Container or backpack"
						options={containerOptions}
						value={build.container}
						onchange={(id) => (build = { ...build, container: id })}
					/>
					{#if container}
						<dl class="facts">
							<div><dt>Slots</dt><dd class="mono">{container.size}</dd></div>
							<div><dt>Effectiveness</dt><dd class="mono">{container.effectiveness}%</dd></div>
							<div><dt>Protection</dt><dd class="mono">{container.protection}%</dd></div>
						</dl>
						<p class="hint">
							Effectiveness scales what your artefacts give you; protection cuts what they do to you
							— radiation, biological, psycho, bleeding and thermal, but not frost.
						</p>
					{/if}
				</section>

				<section>
					<h2>Artefacts</h2>
					<ArtefactSlots
						artefacts={gear.artefacts}
						meta={gear.stats}
						slots={build.artefacts}
						capacity={container?.size ?? 0}
						effectiveness={container?.effectiveness ?? 100}
						onchange={(slots) => (build = { ...build, artefacts: slots })}
						{lang}
					/>
				</section>

				<section>
					<h2>Buffs</h2>
					<ItemPicker
						label="Add food, drink or medicine"
						options={buffOptions}
						value={null}
						onchange={addBuff}
					/>
					{#if chosenBuffs.length}
						<ul class="chosen">
							{#each chosenBuffs as b (b.id)}
								<li>
									{#if b.icon}
										<img class="icon" src={b.icon} alt="" width="24" height="24" loading="lazy" />
									{/if}
									<span class="chosen-name">{b.name}</span>
									<span class="chosen-note mono">{formatDuration(b.duration)}</span>
									<button type="button" onclick={() => removeBuff(b.id)} aria-label="Remove {b.name}">
										×
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</section>

				<section>
					<h2>Condition</h2>
					<label class="level">
						<span>Bleeding</span>
						<span class="level-row">
							<input
								type="range"
								min="0"
								max={MAX_BLEEDING}
								value={build.bleeding}
								oninput={(e) => (build = { ...build, bleeding: Number(e.currentTarget.value) })}
							/>
							<output class="mono">{build.bleeding}</output>
						</span>
					</label>
					<label class="check">
						<input
							type="checkbox"
							checked={build.burning}
							onchange={(e) => (build = { ...build, burning: e.currentTarget.checked })}
						/>
						<span>On fire</span>
					</label>

					{#if result?.availableReactions.length}
						<h3>Anomaly reactions</h3>
						<p class="hint">
							Your gear can convert these. Switch on the ones that are triggering — each adds its
							value to both vitality and stamina regeneration.
						</p>
						<div class="reactions">
							{#each REACTION_STATS.filter((r) => result.availableReactions.includes(r)) as slug (slug)}
								<label class="check" style="--stat-tint: {statTint(slug)}">
									<input
										type="checkbox"
										checked={build.reactions.includes(slug)}
										onchange={() => toggleReaction(slug)}
									/>
									{@html statIcon(slug)}<span>{statLabel(slug, gear.stats[slug])}</span>
								</label>
							{/each}
						</div>
					{/if}
				</section>
			</div>

			<div class="column results">
				{#if result}
					<EstimatePanel {result} meta={gear.stats} {lang} />

					<section>
						<h2>
							Totals
							{#if result.slots.total}
								<span class="slots mono">{result.slots.used}/{result.slots.total} slots</span>
							{/if}
						</h2>
						<StatTable stats={result.stats} meta={gear.stats} {lang} />
					</section>

					{#if result.polyhedron.length}
						<section>
							<h2>Lifesaver</h2>
							<StatTable stats={result.polyhedron} meta={gear.stats} {lang} />
						</section>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
{:else if !weaponIndex}
	<p class="loading">Loading weapons…</p>
{:else}
	<WeaponPanel
		weapons={weaponIndex.weapons}
		attachments={weaponIndex.attachments}
		meta={weaponIndex.stats}
		state={weapon}
		onchange={(next) => (weapon = next)}
		{lang}
	/>
{/if}

<ConnectPrompt action="publish" open={promptOpen} onclose={() => (promptOpen = false)} />

<PublishDialog
	open={publishOpen}
	query={encodeBuild(build, weapon).toString()}
	{name}
	tags={remote?.tags ?? []}
	visibility={remote?.visibility ?? 'public'}
	slug={remote?.slug}
	onclose={() => (publishOpen = false)}
	onpublished={onPublished}
	onunauthorised={() => (promptOpen = true)}
/>

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
		padding-bottom: var(--space-3);
		border-bottom: var(--border-width) solid var(--border);
	}

	.tabs {
		display: flex;
		gap: 2px;
		padding: 2px;
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		background: var(--surface-sunken);
	}

	.tabs button {
		padding: var(--space-1) var(--space-4);
		border: none;
		border-radius: var(--radius-1);
		background: none;
		color: var(--text-dim);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.tabs button.on {
		background: var(--surface-raised);
		color: var(--text);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.name {
		width: 12rem;
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

	.results {
		position: sticky;
		top: var(--space-3);
	}

	@media (max-width: 900px) {
		.results {
			position: static;
		}
	}

	section {
		display: grid;
		gap: var(--space-2);
	}

	h2 {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	h3 {
		margin: var(--space-2) 0 0;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.level {
		display: grid;
		gap: var(--space-1);
	}

	.level > span:first-child,
	.slots {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.level-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.level-row input {
		flex: 1;
	}

	.check {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--text-dim);
	}

	.reactions {
		display: grid;
		gap: var(--space-1);
	}

	/* Four checkboxes whose labels are "Reaction to burns", "…to chemical burns",
	   "…to electricity", "…to laceration" — a stack of near-identical strings
	   where the ringed flame, flask, bolt and claw are the difference. */
	.reactions :global(svg) {
		width: 15px;
		height: 15px;
		flex: none;
		color: var(--stat-tint, var(--text-faint));
	}

	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		margin: 0;
	}

	.facts div {
		display: grid;
		gap: 2px;
	}

	.facts dt {
		font-size: var(--text-xs);
		color: var(--text-faint);
	}

	.facts dd {
		margin: 0;
	}

	.hint {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-faint);
		max-width: 60ch;
	}

	.chosen {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-1);
	}

	.chosen li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-1);
		background: var(--surface);
		font-size: var(--text-sm);
	}

	.chosen-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chosen-note {
		font-size: var(--text-xs);
		color: var(--text-faint);
	}

	.chosen button {
		border: none;
		background: none;
		color: var(--text-faint);
		font-size: var(--text-base);
		line-height: 1;
		cursor: pointer;
	}

	.chosen button:hover {
		color: var(--danger);
	}

	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.loading,
	.error {
		color: var(--text-faint);
		font-size: var(--text-sm);
	}

	.error {
		color: var(--danger);
	}
</style>
