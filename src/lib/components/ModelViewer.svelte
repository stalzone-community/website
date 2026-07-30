<script lang="ts">
	/**
	 * A turntable for one extracted weapon mesh.
	 *
	 * Same arrangement as UAR's ModelCard: `<model-viewer>` is a custom element
	 * that touches `window` on import, so it is pulled in from `onMount` and
	 * never during SSR. The entity pages are prerendered, which means the import
	 * has to be client-side or the build would evaluate it in node.
	 *
	 * The mesh carries no lighting of its own — sc-file writes geometry and a
	 * flat material, and build-models.ts wires the diffuse and normal maps onto
	 * it. So the look here is entirely `environment-image` plus exposure.
	 *
	 * The backdrop is a light studio sweep in BOTH themes, which is the one place
	 * on the site that ignores the theme toggle. It has to: these are worn
	 * military models, almost all of them near-black, and on the site's sunken
	 * dark surface a rifle silhouette disappears into its own background. A pale
	 * cyclorama is what a product shot uses, for exactly this reason. The two
	 * overlay labels therefore carry fixed dark neutrals rather than --text-*,
	 * which would go white in dark mode and vanish.
	 */
	import { onMount } from 'svelte';

	let {
		src,
		alt,
		poster
	}: { src: string; alt: string; poster?: string } = $props();

	let loaded = $state(false);
	let failed = $state(false);

	onMount(async () => {
		try {
			await import('@google/model-viewer');
			loaded = true;
		} catch {
			/* The package is a ~300 KB client bundle and the only thing on the page
			   that can fail independently of the data. A missing viewer must not
			   take the tab down with it — the fallback below still names the file. */
			failed = true;
		}
	});
</script>

<div class="frame">
	{#if failed}
		<p class="fallback">
			The 3D viewer could not load. The model is still available as
			<a href={src} download>a glTF file</a>.
		</p>
	{:else}
		<!-- svelte-ignore element_invalid_self_closing_tag -->
		<model-viewer
			class="viewer"
			class:ready={loaded}
			{src}
			{alt}
			{poster}
			camera-controls
			auto-rotate
			auto-rotate-delay="1200"
			rotation-per-second="18deg"
			interaction-prompt="none"
			shadow-intensity="1"
			shadow-softness="0.75"
			exposure="1.15"
			environment-image="neutral"
			min-field-of-view="12deg"
			max-field-of-view="45deg"
		></model-viewer>
		{#if !loaded}
			<span class="loading">Loading model…</span>
		{/if}
	{/if}
	<span class="hint">drag to rotate · scroll to zoom</span>
</div>

<style>
	.frame {
		position: relative;
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		/* the sweep itself, so it is already correct behind a viewer that has not
		   upgraded yet and there is no dark flash before it fades in */
		background: linear-gradient(180deg, #f7f8f9 0%, #eceef0 62%, #dfe2e5 100%);
		overflow: hidden;
	}

	/* Fills whatever box the page gives it — the model tab bleeds this to the
	   window, so the height is decided there rather than here. The standalone
	   fallback keeps it from collapsing if the component is ever used in flow. */
	.viewer {
		display: block;
		width: 100%;
		height: 100%;
		min-height: 22rem;
		/* the contact shadow's floor, so the model sits on the sweep instead of
		   hovering in front of it */
		background: radial-gradient(
			ellipse 60% 26% at 50% 84%,
			rgb(0 0 0 / 12%),
			transparent 70%
		);
		/* fades in with `ready`, so the element does not flash unstyled while the
		   custom element definition is still downloading */
		opacity: 0;
		transition: opacity 220ms ease;
	}

	.viewer.ready {
		opacity: 1;
	}

	/* Fixed neutrals, not --text-faint: the sweep behind them is pale in both
	   themes, so a theme-aware colour would turn white and disappear. */
	.loading,
	.hint {
		position: absolute;
		font-family: var(--font-mono);
		font-size: 10px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: rgb(0 0 0 / 42%);
		pointer-events: none;
	}

	.loading {
		inset: 0;
		display: grid;
		place-items: center;
	}

	.hint {
		right: 12px;
		bottom: 9px;
	}

	/* Also on the pale sweep, so the same reasoning as .hint applies. */
	.fallback {
		margin: 0;
		padding: var(--space-6);
		text-align: center;
		color: rgb(0 0 0 / 62%);
	}

	.fallback a {
		color: #0b5cad;
	}
</style>
