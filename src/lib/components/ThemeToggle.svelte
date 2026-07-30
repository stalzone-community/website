<script lang="ts">
	/**
	 * Cycles system → light → dark. Three states rather than two because
	 * "follow the device" is the sensible default and a two-way switch gives
	 * a visitor no way back to it once they have touched the control.
	 */
	import { cycleTheme, readStoredTheme, theme } from '$lib/theme.svelte';

	const TITLE = {
		system: 'Theme: follows your device',
		light: 'Theme: light',
		dark: 'Theme: dark'
	} as const;

	// the server rendered "system"; the real answer only exists in the browser
	$effect(() => {
		readStoredTheme();
	});

	const current = $derived(theme());
	const title = $derived(TITLE[current]);
</script>

<button class="toggle" onclick={cycleTheme} title="{title} — click to change">
	<!-- drawn rather than typed: `◐` fills one half and leaves the other as bare
	     background, so on a dark surface the unlit face has no edge to read and the
	     glyph looks like a blob instead of a half-and-half circle -->
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		{#if current === 'system'}
			<!-- the full circle is stroked, then one half filled: both faces are
			     visible in either theme, and the split says "whichever the device is" -->
			<circle cx="12" cy="12" r="8" />
			<path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none" />
		{:else if current === 'light'}
			<circle cx="12" cy="12" r="5" />
			<line x1="12" y1="1" x2="12" y2="3" />
			<line x1="12" y1="21" x2="12" y2="23" />
			<line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
			<line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
			<line x1="1" y1="12" x2="3" y2="12" />
			<line x1="21" y1="12" x2="23" y2="12" />
			<line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
			<line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
		{:else}
			<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
		{/if}
	</svg>
	<span class="visually-hidden">{title}. Click to change.</span>
</button>

<style>
	/* the same 30px round chip as the search control beside it, so the top bar
	   reads as one row of controls rather than a chip and a bare glyph */
	.toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		padding: 0;
		border: var(--border-width) solid var(--border-strong);
		border-radius: 99px;
		background: var(--surface);
		color: var(--text-dim);
		line-height: 1;
		cursor: pointer;
		transition:
			color 120ms ease,
			border-color 120ms ease,
			background 120ms ease;
	}

	.toggle:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	/* 15px, the size the search chip's magnifier takes beside it */
	.toggle svg {
		width: 15px;
		height: 15px;
	}
</style>
