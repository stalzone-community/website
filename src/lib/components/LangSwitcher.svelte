<script lang="ts">
	/**
	 * A plain <select>. Five options is under the threshold where a custom
	 * listbox earns its keyboard handling, and the native control already
	 * knows how to open upward near the bottom of a phone screen.
	 */
	import { LANG_LABEL, lang, readStoredLang, setLang } from '$lib/lang.svelte';
	import { LANGS, type Lang } from '$lib/types';

	// the server rendered English; the visitor's real preference is client-side
	$effect(() => {
		readStoredLang();
	});
</script>

<label class="lang">
	<span class="visually-hidden">Language</span>
	<select
		value={lang()}
		onchange={(e) => setLang(e.currentTarget.value as Lang)}
		title="Item names and stat labels come from the game in five languages"
	>
		{#each LANGS as l (l)}
			<option value={l}>{LANG_LABEL[l]}</option>
		{/each}
	</select>
</label>

<style>
	.lang select {
		padding: var(--space-1) var(--space-2);
		font-size: var(--text-xs);
		color: var(--text-dim);
		background: transparent;
		border-color: transparent;
	}

	.lang select:hover {
		color: var(--text);
		border-color: var(--border);
	}
</style>
