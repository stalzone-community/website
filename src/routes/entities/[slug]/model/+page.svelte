<script lang="ts">
	import ModelViewer from '$lib/components/ModelViewer.svelte';
	import { itemName } from '$lib/items';
	import { lang as displayLang } from '$lib/lang.svelte';

	let { data } = $props();

	const lang = $derived(displayLang());
	const name = $derived(itemName(data.entity, lang));
</script>

<svelte:head>
	<title>{name} 3D model — Stalzone</title>
	<meta
		name="description"
		content="Turntable view of the {name} in STALZONE — the in-game mesh with its diffuse and normal maps."
	/>
	<!-- The diffuse map is the largest single file and the one whose absence
	     shows, so it is fetched alongside the mesh instead of after it. The glb
	     itself is not preloaded: <model-viewer> requests it the moment it
	     upgrades, and a preload would only race its own fetch.
	     Conditional because a few weapons ship as an untextured mesh — see
	     modelUrls(); preloading a map that does not exist fails the prerender. -->
	{#if data.model.diff}
		<link rel="preload" as="image" href={data.model.diff} type="image/webp" />
	{/if}
</svelte:head>

<!-- No heading, and no card. The tab bar directly above already says "Model",
     the infobox is hidden on every tab but the overview, and a turntable at this
     size needs no label to explain what it is.

     Full-bleed by the same arithmetic as the craft tree — see that file for the
     long version. The three negative margins hand back exactly what the chrome
     charges (the column's side padding, the gap under the tab bar, the column's
     bottom padding) so the viewer runs to the window edges on three sides and
     stops under the tabs on the fourth. Only the top padding is left standing,
     because the tab bar sits in it. -->
<div class="stage">
	<ModelViewer src={data.model.src} alt="3D model of {name}" />
</div>

<style>
	.stage {
		margin-inline: calc(-1 * var(--content-pad-x, 36px));
		margin-top: calc(-1 * var(--space-4));
		margin-bottom: calc(-1 * var(--content-pad-bottom, 72px));
		height: calc(
			100dvh - var(--chrome-h) - var(--content-pad-top, 26px) - var(--entity-chrome-h, 0px)
		);
		min-height: 22rem;
	}

	/* Bled to the window edges the viewer *is* the page, so the border and the
	   radius go — they would draw a floating card around something with no
	   margin to float in. The rule under the tab bar is the only edge left. */
	.stage :global(.frame) {
		height: 100%;
		border: none;
		border-radius: 0;
	}
</style>
