<script lang="ts">
	import { damageCurve } from '$lib/items';
	import type { DamageRamp } from '$lib/types';

	interface Props {
		damage: DamageRamp;
		/** level 0 ramp, drawn faintly behind, when viewing an upgraded level */
		base?: DamageRamp | null;
	}

	let { damage, base = null }: Props = $props();

	const W = 520;
	const H = 180;
	const PAD = { top: 12, right: 14, bottom: 26, left: 38 };

	// Both curves share a scale, so the upgrade's gain is visible as a gap
	// rather than as two charts that happen to look identical.
	let maxY = $derived(Math.ceil(Math.max(damage.startDamage, base?.startDamage ?? 0) * 1.1));
	let maxX = $derived(Math.max(damage.maxDistance, base?.maxDistance ?? 0));

	const sx = (x: number) => PAD.left + (x / maxX) * (W - PAD.left - PAD.right);
	const sy = (y: number) => H - PAD.bottom - (y / maxY) * (H - PAD.top - PAD.bottom);
	const path = (d: DamageRamp) =>
		damageCurve(d)
			.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`)
			.join(' ');

	let ticksY = $derived([0, maxY / 2, maxY]);
	let ticksX = $derived([0, damage.damageDecreaseStart, damage.damageDecreaseEnd, damage.maxDistance]);
</script>

<figure>
	<svg viewBox="0 0 {W} {H}" role="img" aria-label="Damage against distance">
		{#each ticksY as t (t)}
			<line class="grid" x1={PAD.left} y1={sy(t)} x2={W - PAD.right} y2={sy(t)} />
			<text class="axis" x={PAD.left - 6} y={sy(t)} text-anchor="end" dominant-baseline="middle">
				{Math.round(t)}
			</text>
		{/each}

		{#each ticksX as t (t)}
			<text class="axis" x={sx(t)} y={H - 8} text-anchor="middle">{Math.round(t)}</text>
		{/each}

		{#if base}
			<path class="base" d={path(base)} />
		{/if}
		<path class="curve" d={path(damage)} />
	</svg>
	<figcaption>
		Damage against distance (m){#if base}, level 0 shown faint{/if}
	</figcaption>
</figure>

<style>
	figure {
		margin: 0;
	}

	svg {
		width: 100%;
		height: auto;
		overflow: visible;
	}

	.grid {
		stroke: var(--border);
		stroke-width: 1;
	}

	.axis {
		fill: var(--text-faint);
		font-size: 10px;
		font-family: var(--font-mono);
	}

	.curve {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
		stroke-linejoin: round;
	}

	.base {
		fill: none;
		stroke: var(--text-faint);
		stroke-width: 1.5;
		stroke-dasharray: 3 3;
	}

	figcaption {
		margin-top: var(--space-2);
		font-size: var(--text-xs);
		color: var(--text-faint);
	}
</style>
