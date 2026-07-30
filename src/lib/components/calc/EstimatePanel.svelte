<script lang="ts">
	/**
	 * The derived numbers — and the fact that they are derived.
	 *
	 * EXBO's database states stats, not the rules that combine them, so
	 * effective health and healing per second come from a model rather than from
	 * the data. The formulas are printed next to the results on purpose: a
	 * number a player cannot check is a number they cannot correct.
	 */
	import { formatValue, statLabel } from '$lib/calc/format';
	import { statIcon } from '$lib/stat-icons';
	import type { BuildResult } from '$lib/calc/build';
	import type { CalcStatMeta } from '$lib/calc/types';

	interface Props {
		result: BuildResult;
		meta: Record<string, CalcStatMeta>;
		lang?: string;
	}

	let { result, meta, lang = 'en' }: Props = $props();

	let showFormulas = $state(false);

	const ehp = $derived(Math.round(result.effectiveHealth));
	const hps = $derived(result.healingPerSecond);
</script>

<section class="estimates">
	<header>
		<h2>Estimated</h2>
		<button type="button" class="how" onclick={() => (showFormulas = !showFormulas)}>
			{showFormulas ? 'hide formulas' : 'how is this worked out?'}
		</button>
	</header>

	<div class="figures">
		<div class="figure">
			<span class="value">{ehp.toLocaleString(lang)}</span>
			<span class="label">effective health</span>
		</div>
		<div class="figure">
			<span class="value">{formatValue(hps, undefined, lang)}</span>
			<span class="label">health / second</span>
		</div>
		<div class="figure">
			<span class="value">{formatValue(result.weight, undefined, lang)} kg</span>
			<span class="label">gear carried</span>
		</div>
	</div>

	{#if showFormulas}
		<dl class="formulas">
			<dt>effective health</dt>
			<dd class="mono">(vitality + 100) / 100 × (100 + bullet resistance)</dd>
			<dt>health / second</dt>
			<dd class="mono">(regeneration + 2.5) / 5 + artefact healing × (1 + heal efficiency / 100)</dd>
			<dt>stability</dt>
			<dd class="mono">(1 − 100 / (100 + tear resistance) × (1 − stability / 100)) × 100</dd>
		</dl>
		<p class="caveat">
			Recovered from how the game presents these numbers rather than from EXBO's data, which ships
			stat values only. Treat them as a good guide, not as exact — and tell us if a figure
			disagrees with what you see in the Zone.
		</p>
	{/if}

	{#if result.alerts.length}
		<ul class="alerts">
			{#each result.alerts as slug (slug)}
				<li>
					{@html statIcon(slug)}
					<span>{statLabel(slug, meta[slug])} is past the level where it starts hurting you</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.estimates {
		padding: var(--space-3);
		border: var(--border-width) dashed var(--border-strong);
		border-radius: var(--radius-2);
		background: var(--surface-sunken);
	}

	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
	}

	h2 {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.how {
		border: none;
		background: none;
		padding: 0;
		color: var(--text-dim);
		font-size: var(--text-xs);
		text-decoration: underline dotted;
		cursor: pointer;
	}

	.figures {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		gap: var(--space-3);
	}

	.figure {
		display: grid;
		gap: 2px;
	}

	.value {
		font-family: var(--font-mono);
		font-size: var(--text-xl);
		font-variant-numeric: tabular-nums;
		color: var(--accent);
	}

	.label {
		font-size: var(--text-xs);
		color: var(--text-faint);
	}

	.formulas {
		margin: var(--space-3) 0 0;
		display: grid;
		gap: 2px;
		font-size: var(--text-xs);
	}

	.formulas dt {
		color: var(--text-faint);
	}

	.formulas dd {
		margin: 0 0 var(--space-2);
		color: var(--text-dim);
	}

	.mono {
		font-family: var(--font-mono);
	}

	.caveat {
		margin: var(--space-2) 0 0;
		font-size: var(--text-xs);
		color: var(--text-faint);
		max-width: 60ch;
	}

	.alerts {
		list-style: none;
		margin: var(--space-3) 0 0;
		padding: 0;
		display: grid;
		gap: var(--space-1);
	}

	.alerts li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		border-left: 2px solid var(--warn);
		background: var(--surface);
		font-size: var(--text-xs);
		color: var(--warn);
	}

	/* The one place a mark does NOT take its family tint. Everywhere else the hue
	   is free information; here the row is already one amber object — border,
	   text and all — and dropping an acid-green trefoil into it would read as two
	   messages rather than one warning. So it inherits --warn from the row, and
	   the shape alone says which accumulation went over. */
	.alerts li :global(svg) {
		width: 15px;
		height: 15px;
		flex: none;
	}
</style>
