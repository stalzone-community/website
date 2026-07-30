<script lang="ts">
	/**
	 * The upgrade-level slider, as a card header.
	 *
	 * It rides on the first card of the main column rather than floating above
	 * everything, so it sits against the numbers it moves. Which card that is
	 * depends on the entity: an artefact leads with its effect bands (the level
	 * *is* the band — 102 of the 103 widen as they upgrade), a weapon leads with
	 * its stats table.
	 */
	interface Props {
		level?: number;
		max: number;
		label?: string;
	}

	let { level = $bindable(0), max, label = 'Upgrade level' }: Props = $props();
</script>

<div class="level">
	<label for="upgrade-level">{label}</label>
	<input id="upgrade-level" type="range" min="0" {max} step="1" bind:value={level} />
	<output for="upgrade-level"><b>{level}</b> / {max}</output>
</div>

<style>
	/* on the card's top edge, sharing the header rule with a table below it */
	.level {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-bottom: var(--border-width) solid var(--border-strong);
		background: var(--surface);
	}

	label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-faint);
		white-space: nowrap;
	}

	input {
		flex: 1;
		min-width: 0;
		accent-color: var(--accent);
	}

	output {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		color: var(--text-dim);
		white-space: nowrap;
	}

	output b {
		color: var(--accent);
	}
</style>
