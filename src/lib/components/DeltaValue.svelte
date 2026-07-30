<script lang="ts">
	/**
	 * A value that an upgrade level has moved: `46.5 → 58.13`.
	 *
	 * Base and current rather than a delta chip. Three numbers in one cell —
	 * base, delta and total — makes the reader do the arithmetic to work out
	 * which is which; "was, now is" needs no key. At level 0 it renders the
	 * single value with the same metrics, so dragging the slider does not
	 * reflow the table.
	 *
	 * Direction is by comparison, never by sign: `spread` and `recoil` improve
	 * as they fall, so "bigger is better" would paint half a weapon's upgrades
	 * red.
	 */
	interface Props {
		/** formatted value at level 0 */
		base: string;
		/** formatted value at the current level */
		current: string;
		/** true when the change is an improvement; null when unknown/unchanged */
		better?: boolean | null;
	}

	let { base, current, better = null }: Props = $props();

	const changed = $derived(base !== current);
</script>

{#if changed}
	<span class="was">{base}</span>
	<span class="arrow" aria-hidden="true">→</span>
	<span class="now" class:better={better === true} class:worse={better === false}>{current}</span>
{:else}
	<span class="now">{current}</span>
{/if}

<style>
	.was {
		color: var(--text-faint);
	}

	.arrow {
		color: var(--text-faint);
		margin: 0 0.15em;
	}

	.now.better {
		color: var(--accent);
	}

	.now.worse {
		color: var(--danger);
	}
</style>
