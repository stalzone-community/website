<script lang="ts">
	import CraftPanel from '$lib/components/CraftPanel.svelte';
	import { itemName } from '$lib/items';
	import { lang as displayLang } from '$lib/lang.svelte';

	let { data } = $props();

	const lang = $derived(displayLang());
	const name = $derived(itemName(data.entity, lang));
</script>

<svelte:head>
	<title>How to get {name} — Stalzone</title>
	<meta
		name="description"
		content="How to get {name} in STALZONE: bench recipes, the parts they bottom out in, the traders who deal in it, and what it is used for."
	/>
</svelte:head>

<CraftPanel {...data.craft} {lang} />
