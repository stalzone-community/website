<script lang="ts">
	/**
	 * Choosing one item for a slot.
	 *
	 * A native <select> would be simpler, but the lists here run to 338 weapons
	 * and 280 attachments, and the thing a player wants is "the one whose name
	 * starts with SVD" — so this is a filterable list with the same fold-aware
	 * matching the site search uses, over the names already resolved to the
	 * display language.
	 */
	import { foldForSearch } from 'sveltekit-commons/text';
	import { rankSlug } from '$lib/items';
	import type { Rank } from '$lib/types';

	interface Option {
		id: string;
		name: string;
		icon: string | null;
		rank: Rank;
		/** small right-aligned note: the category, slot, or a headline stat */
		note?: string;
	}

	interface Props {
		label: string;
		options: Option[];
		value: string | null;
		onchange: (id: string | null) => void;
		placeholder?: string;
		/** shown when nothing is selected and the list is empty */
		empty?: string;
	}

	let {
		label,
		options,
		value,
		onchange,
		placeholder = 'Search…',
		empty = 'Nothing to choose from'
	}: Props = $props();

	let open = $state(false);
	let query = $state('');

	const selected = $derived(options.find((o) => o.id === value) ?? null);

	const matches = $derived.by(() => {
		const needle = foldForSearch(query);
		const rows = needle
			? options.filter((o) => foldForSearch(o.name).includes(needle))
			: options;
		// long lists are unusable in a popover; the filter is the way through them
		return rows.slice(0, 120);
	});

	function pick(id: string | null) {
		onchange(id);
		open = false;
		query = '';
	}

	/* On the window rather than the wrapper: the menu is closed by Escape no
	   matter which of its controls has focus, and a wrapper that listens for
	   keys is a div pretending to be a widget. */
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) open = false;
	}
</script>

<svelte:window onkeydown={onkeydown} />

<div class="picker">
	<span class="label">{label}</span>

	<button
		type="button"
		class="current"
		class:filled={Boolean(selected)}
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		{#if selected}
			{#if selected.icon}
				<img class="icon" src={selected.icon} alt="" width="28" height="28" loading="lazy" />
			{:else}
				<span class="icon placeholder" aria-hidden="true"></span>
			{/if}
			<span class="name" style="--rank: var(--rank-{rankSlug(selected.rank)})">{selected.name}</span>
		{:else}
			<span class="icon placeholder" aria-hidden="true"></span>
			<span class="name none">{options.length ? 'None' : empty}</span>
		{/if}
		<span class="chevron" aria-hidden="true">{open ? '▴' : '▾'}</span>
	</button>

	{#if open}
		<div class="menu">
			<!-- svelte-ignore a11y_autofocus -- the menu exists to be typed into -->
			<input type="search" bind:value={query} {placeholder} autofocus />
			<ul>
				{#if selected}
					<li>
						<button type="button" class="row clear" onclick={() => pick(null)}>Clear slot</button>
					</li>
				{/if}
				{#each matches as o (o.id)}
					<li>
						<button
							type="button"
							class="row"
							class:active={o.id === value}
							style="--rank: var(--rank-{rankSlug(o.rank)})"
							onclick={() => pick(o.id)}
						>
							{#if o.icon}
								<img class="icon" src={o.icon} alt="" width="24" height="24" loading="lazy" />
							{:else}
								<span class="icon placeholder" aria-hidden="true"></span>
							{/if}
							<span class="row-name">{o.name}</span>
							{#if o.note}<span class="note">{o.note}</span>{/if}
						</button>
					</li>
				{:else}
					<li class="none-found">No match for “{query}”</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<style>
	.picker {
		position: relative;
		display: grid;
		gap: var(--space-1);
	}

	.label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.current {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		background: var(--surface);
		color: var(--text);
		text-align: left;
		cursor: pointer;
	}

	.current:hover {
		border-color: var(--border-strong);
	}

	.current.filled {
		background: var(--surface-raised);
	}

	.icon {
		width: 28px;
		height: 28px;
		object-fit: contain;
		flex: none;
	}

	.placeholder {
		border: 1px dashed var(--border);
		border-radius: var(--radius-1);
	}

	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--text-sm);
		border-left: 2px solid var(--rank, transparent);
		padding-left: var(--space-2);
	}

	.name.none {
		color: var(--text-faint);
		border-left-color: transparent;
	}

	.chevron {
		color: var(--text-faint);
		font-size: var(--text-xs);
	}

	.menu {
		position: absolute;
		z-index: 20;
		top: 100%;
		left: 0;
		right: 0;
		margin-top: 2px;
		padding: var(--space-2);
		border: var(--border-width) solid var(--border-strong);
		border-radius: var(--radius-2);
		background: var(--surface-raised);
		box-shadow: var(--shadow-2);
	}

	.menu input {
		width: 100%;
		margin-bottom: var(--space-2);
	}

	.menu ul {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 18rem;
		overflow-y: auto;
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-1) var(--space-2);
		border: none;
		border-radius: var(--radius-1);
		background: none;
		color: var(--text);
		text-align: left;
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.row:hover,
	.row.active {
		background: var(--surface);
	}

	.row .icon {
		width: 24px;
		height: 24px;
	}

	.row-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		border-left: 2px solid var(--rank, transparent);
		padding-left: var(--space-2);
	}

	.clear {
		color: var(--text-dim);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.note {
		flex: none;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-faint);
	}

	.none-found {
		padding: var(--space-2);
		font-size: var(--text-sm);
		color: var(--text-faint);
	}
</style>
