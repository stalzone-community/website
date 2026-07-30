<script lang="ts">
	/**
	 * The totals, with where each one came from.
	 *
	 * The breakdown is the point. A single number for radiation protection is
	 * unfalsifiable; "suit 30, artefact −12, container halved it" can be checked
	 * against the game, and is what makes a wrong assumption in the maths
	 * visible instead of authoritative.
	 */
	import { formatValue, statLabel } from '$lib/calc/format';
	import { statIcon, statTint } from '$lib/stat-icons';
	import type { StatTotal } from '$lib/calc/build';
	import type { CalcStatMeta } from '$lib/calc/types';
	import type { StatOrigin } from '$lib/calc/keys';

	interface Props {
		stats: StatTotal[];
		meta: Record<string, CalcStatMeta>;
		lang?: string;
		empty?: string;
	}

	let { stats, meta, lang = 'en', empty = 'Pick some gear to see its numbers.' }: Props = $props();

	const ORIGIN_LABEL: Record<StatOrigin, string> = {
		artefact: 'artefacts',
		armor: 'suit',
		container: 'container',
		buff: 'buffs',
		reaction: 'reaction',
		debuff: 'bleeding/burning',
		unknown: 'other'
	};

	let expanded = $state<string | null>(null);

	function sources(row: StatTotal): [StatOrigin, number][] {
		return Object.entries(row.sources).filter(([, v]) => v !== 0) as [StatOrigin, number][];
	}
</script>

{#if stats.length === 0}
	<p class="empty">{empty}</p>
{:else}
	<ul class="stats">
		{#each stats as row (row.slug)}
			{@const breakdown = sources(row)}
			<li>
				<button
					type="button"
					class="row"
					style="--stat-tint: {statTint(row.slug)}"
					class:multi={breakdown.length > 1}
					aria-expanded={expanded === row.slug}
					onclick={() => (expanded = expanded === row.slug ? null : row.slug)}
				>
					{@html statIcon(row.slug)}<span class="name">{statLabel(row.slug, meta[row.slug])}</span>
					<span class="value" class:good={row.benefit} class:bad={!row.benefit}>
						{formatValue(row.value, meta[row.slug], lang, { sign: true })}
					</span>
					{#if breakdown.length > 1}
						<span class="count" aria-hidden="true">{breakdown.length}</span>
					{/if}
				</button>

				{#if expanded === row.slug}
					<ul class="breakdown">
						{#each breakdown as [origin, value] (origin)}
							<li>
								<span>{ORIGIN_LABEL[origin]}</span>
								<span class="mono">{formatValue(value, meta[row.slug], lang, { sign: true })}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.empty {
		color: var(--text-faint);
		font-size: var(--text-sm);
	}

	.stats {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.row {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-1) var(--space-2);
		border: none;
		border-bottom: var(--border-width) solid var(--border);
		background: none;
		color: var(--text);
		text-align: left;
		font-size: var(--text-sm);
		cursor: default;
	}

	.row.multi {
		cursor: pointer;
	}

	.row.multi:hover {
		background: var(--surface-raised);
	}

	.name {
		flex: 1;
		min-width: 0;
		color: var(--text-dim);
	}

	/* The totals list is the longest stat table on the site — a full build runs
	   past thirty rows — and it is the one you scan for a single number. Sized off
	   the row's own font so it holds when the panel is narrow. */
	.row :global(svg) {
		width: 15px;
		height: 15px;
		flex: none;
		align-self: center;
		color: var(--stat-tint, var(--text-faint));
		opacity: 0.85;
	}

	.row.multi:hover :global(svg) {
		opacity: 1;
	}

	.value {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.good {
		color: var(--ok);
	}

	.bad {
		color: var(--danger);
	}

	.count {
		width: 1.2em;
		text-align: center;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-faint);
	}

	.breakdown {
		list-style: none;
		margin: 0;
		padding: var(--space-1) var(--space-2) var(--space-2) var(--space-4);
		background: var(--surface-sunken);
		font-size: var(--text-xs);
		color: var(--text-faint);
	}

	.breakdown li {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
</style>
