<script lang="ts">
	/**
	 * An item's art in its cell — the one place that decides what to draw when an
	 * item has no icon, and how the cell meets whatever contains it.
	 *
	 * The *look* is not here: `.icon` is styled globally in $lib/styles/site.css,
	 * because the same treatment has to reach art this component does not render
	 * — commons' FactsCard portrait, the recipe rows, the search hits. This owns
	 * the markup and the geometry; that owns the plate.
	 *
	 * `flush` is the tech-tree variant: the cell fills its parent's height and
	 * butts against the card's edges with no gap, the way an inventory slot does.
	 * The parent supplies the rounding by clipping (`overflow: hidden`), so the
	 * cell drops its own radius rather than trying to match the card's corner.
	 */
	interface Props {
		src: string | null;
		/** cell edge in px; square */
		size: number;
		/** stretch to the parent's height and square off the corners */
		flush?: boolean;
		/** above the fold — skips lazy loading */
		eager?: boolean;
	}

	let { src, size, flush = false, eager = false }: Props = $props();
</script>

{#if src}
	<img
		class="icon"
		class:flush
		{src}
		alt=""
		width={size}
		height={size}
		style="--cell:{size}px"
		loading={eager ? 'eager' : 'lazy'}
	/>
{:else}
	<span class="icon empty" class:flush style="--cell:{size}px" aria-hidden="true"></span>
{/if}

<style>
	.icon {
		flex: none;
		width: var(--cell);
		height: var(--cell);
		object-fit: contain;
	}

	.flush {
		align-self: stretch;
		height: auto;
		border-radius: 0;
	}

	/* an item with no art still occupies its slot, or the row would jump */
	.empty {
		border: 1px dashed var(--border);
	}
</style>
