<script lang="ts">
	/**
	 * The reverse direction, on both tabs: what this item is *for*.
	 *
	 * "Used to craft" and "Accepted as payment for" are the same shape — a plain
	 * roll of items with no structure to read down, and one that runs to dozens
	 * for a common material, so it is capped until asked. The forward direction
	 * gets cards; this gets a grid, because there is nothing here to compare row
	 * against row.
	 */
	import { Card } from 'sveltekit-commons';
	import type { ItemAmount, Lang, Localized } from '$lib/types';
	import ItemRefs from './ItemRefs.svelte';

	interface Props {
		rows: ItemAmount[];
		names: Record<string, { name: Localized; icon: string | null; slug: string }>;
		lang?: Lang;
		/** how many to show before the "show more" */
		cap?: number;
	}

	let { rows, names, lang = 'en', cap = 12 }: Props = $props();

	/* Expanded is the state; the count is derived from it. The other way round —
	   `$state(cap)` — reads the prop once at init and then never again, which is
	   both a compiler warning and wrong the moment a caller passes a different
	   cap. */
	let expanded = $state(false);
	const shown = $derived(expanded ? rows.length : cap);

	/* A new item under the same route reuses this component, so without this a
	   list opened up on a screw stays open on the next thing you look at. */
	$effect(() => {
		rows;
		expanded = false;
	});
</script>

<Card pad={false}>
	<ItemRefs rows={rows.slice(0, shown)} {names} {lang} wrap />
</Card>

{#if rows.length > shown}
	<button onclick={() => (expanded = true)}>
		Show {rows.length - shown} more
	</button>
{/if}

<style>
	button {
		margin-top: var(--space-2);
		padding: var(--space-1) var(--space-3);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		background: var(--surface);
		font-size: var(--text-sm);
		color: var(--text-dim);
		cursor: pointer;
	}

	button:hover {
		border-color: var(--accent-dim);
		color: var(--text);
	}
</style>
