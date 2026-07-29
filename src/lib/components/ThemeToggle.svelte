<script lang="ts">
	/**
	 * Cycles system → light → dark. Three states rather than two because
	 * "follow the device" is the sensible default and a two-way switch gives
	 * a visitor no way back to it once they have touched the control.
	 */
	import { cycleTheme, readStoredTheme, theme } from '$lib/theme.svelte';

	const LABEL = {
		system: { icon: '◐', title: 'Theme: follows your device' },
		light: { icon: '☀', title: 'Theme: light' },
		dark: { icon: '☾', title: 'Theme: dark' }
	} as const;

	// the server rendered "system"; the real answer only exists in the browser
	$effect(() => {
		readStoredTheme();
	});

	const state = $derived(LABEL[theme()]);
</script>

<button class="toggle" onclick={cycleTheme} title="{state.title} — click to change">
	<span aria-hidden="true">{state.icon}</span>
	<span class="visually-hidden">{state.title}. Click to change.</span>
</button>

<style>
	.toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: var(--border-width) solid transparent;
		border-radius: var(--radius-2);
		background: transparent;
		color: var(--text-dim);
		font-size: var(--text-lg);
		line-height: 1;
		cursor: pointer;
		transition:
			color 120ms ease,
			border-color 120ms ease;
	}

	.toggle:hover {
		color: var(--accent);
		border-color: var(--border);
	}
</style>
