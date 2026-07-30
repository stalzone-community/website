<script lang="ts">
	/**
	 * Which region's market the auction pages price against, as a top-bar chip.
	 *
	 * WHY THERE ARE NO FLAGS
	 *
	 * Two of the four regions have a flag and two do not. RU and EU are real
	 * flags; NA is a continent, where any national flag picks one of three
	 * countries and drops the others; SEA has no emblem at all. A row mixing two
	 * national flags with two invented glyphs looks broken and makes a claim
	 * about places that a database of guns has no reason to make. The codes are
	 * what players already say out loud, so the text is the icon, and one neutral
	 * globe says what kind of control this is.
	 *
	 * A NATIVE <select>, DRESSED AS A CHIP
	 *
	 * The chip look is the visible part; the behaviour underneath is the
	 * browser's. A custom listbox would owe arrow keys, Home/End, Escape,
	 * type-ahead, focus return and a mobile story, and would end up a worse
	 * version of what the platform ships — on a phone this opens the native
	 * wheel, which is the right control for picking one of four. So the <select>
	 * is real and sits transparent over the chip; the chip is what you see.
	 *
	 * Kept in this repo rather than sveltekit-commons for now: it is the first of
	 * its kind and its shape is one site old. Nothing here is STALZONE-specific
	 * except the region list, so it can move as a generic ChipSelect the moment a
	 * second site wants one — which is the point at which the API would actually
	 * be tested by two callers instead of guessed at from one.
	 */
	import { invalidateAll } from '$app/navigation';
	import { readStoredRegion, region, setRegion } from '$lib/region.svelte';
	import { REGIONS, regionName, type RegionId } from '$lib/regions';

	interface Props {
		/** drop the code and show the globe alone, as the search chip does */
		compact?: boolean;
	}
	let { compact = false }: Props = $props();

	/* The shell is prerendered, so the served HTML always has the default
	   selected; the visitor's actual cookie is only readable here. */
	$effect(() => {
		readStoredRegion();
	});

	let busy = $state(false);

	async function choose(next: RegionId) {
		if (!setRegion(next)) return;
		// The prices come from the server, so the new region means a new fetch.
		// Without this the heading would change and the numbers would not.
		busy = true;
		try {
			await invalidateAll();
		} finally {
			busy = false;
		}
	}
</script>

<div class="region-chip" class:compact class:busy title="Auction region — {regionName(region())}">
	<span class="glyph" aria-hidden="true">
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<circle cx="12" cy="12" r="9" />
			<ellipse cx="12" cy="12" rx="4" ry="9" />
			<line x1="3.2" y1="9" x2="20.8" y2="9" />
			<line x1="3.2" y1="15" x2="20.8" y2="15" />
		</svg>
	</span>
	{#if !compact}
		<span class="label">{region()}</span>
	{/if}

	<!-- The real control. Transparent and stretched over the chip so every
	     platform behaviour — keyboard, mobile wheel, type-ahead — is the
	     browser's rather than a reimplementation of it. -->
	<select
		aria-label="Auction region"
		value={region()}
		disabled={busy}
		onchange={(e) => choose(e.currentTarget.value as RegionId)}
	>
		{#each REGIONS as r (r.id)}
			<option value={r.id}>{r.id} — {r.name}</option>
		{/each}
	</select>
</div>

<style>
	/* 30px and a 99px radius: the shape every other chip in this bar takes, so
	   the row reads as one set of controls rather than three sizes of them. */
	.region-chip {
		position: relative;
		display: flex;
		align-items: center;
		gap: 7px;
		height: 30px;
		padding: 0 8px 0 9px;
		color: var(--text-dim);
		background: var(--surface);
		border: var(--border-width) solid var(--border-strong);
		border-radius: 99px;
		cursor: pointer;
		transition:
			border-color 120ms ease,
			color 120ms ease,
			background 120ms ease;
	}

	/* :focus-within, not just :hover — the select underneath takes the focus, so
	   without this a keyboard user gets no ring at all. */
	.region-chip:hover,
	.region-chip:focus-within {
		color: var(--accent);
		border-color: var(--accent);
	}

	.region-chip.busy {
		opacity: 0.6;
		cursor: progress;
	}

	.region-chip.compact {
		width: 30px;
		padding: 0;
		justify-content: center;
	}

	.glyph {
		display: flex;
		flex: none;
	}
	.glyph svg {
		width: 15px;
		height: 15px;
	}

	.label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 500;
		line-height: 1;
		letter-spacing: 0.03em;
	}

	select {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		/* invisible but still hit-testable and focusable — the chip is the
		   appearance, this is the control */
		opacity: 0;
		cursor: inherit;
		appearance: none;
		border: 0;
	}
</style>
