<script lang="ts">
	/**
	 * Emissions. Today this page is the alert opt-in and nothing else — live
	 * timings need production API access, and the countdown lands here when the
	 * poller does.
	 *
	 * ?region= is read through `browser` rather than at load time on purpose: the
	 * page is prerendered (see the root +layout.ts) and SvelteKit refuses to let a
	 * prerendered page look at search params, for the good reason that there is
	 * one build output and infinitely many query strings. Reading it after
	 * hydration costs nothing and is where the notification's own link points.
	 */
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import EmissionAlerts from '$lib/components/EmissionAlerts.svelte';
	import { isRegionId, REGIONS, type RegionId } from '$lib/regions';

	const region = $derived.by((): RegionId | undefined => {
		if (!browser) return undefined;
		const value = page.url.searchParams.get('region');
		return isRegionId(value) ? value : undefined;
	});
</script>

<svelte:head>
	<title>Emissions — Stalzone</title>
	<meta
		name="description"
		content="Get a notification when an emission starts and when it is safe to go outside, on desktop and mobile."
	/>
</svelte:head>

<section class="hero">
	<h1>Emissions</h1>
	<p class="lede">
		An emission sweeps the Zone and kills anything caught in the open. This page tells you when one
		starts and when it is over — on {REGIONS.length} regions, without the site being open.
	</p>
</section>

<EmissionAlerts {region} />

<section class="pending">
	<h2>What is not here yet</h2>
	<p>
		Live emission timings come from the official STALZONE API, which needs an approved production
		application. Alerts can be switched on now, and start arriving the moment that lands — nothing
		about the subscription changes.
	</p>
</section>

<style>
	.hero {
		margin-bottom: var(--space-5);
	}

	.lede {
		margin-top: var(--space-3);
		max-width: 52ch;
		color: var(--text-dim);
	}

	.pending {
		margin-top: var(--space-6);
		max-width: 52ch;
	}

	.pending h2 {
		font-size: var(--text-base);
	}

	.pending p {
		color: var(--text-dim);
		font-size: var(--text-sm);
	}
</style>
