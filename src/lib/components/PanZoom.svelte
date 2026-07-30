<script lang="ts">
	/**
	 * A pannable, zoomable plane — the box a graph is read through.
	 *
	 * A craft chain runs past 2 300px and a tech tree past eight tiers, so
	 * neither fits a content column and neither is worth shrinking to. The plane
	 * keeps its own coordinates and the box moves over it: wheel zooms at the
	 * cursor, drag pans, two fingers pinch. One transform on the whole plane
	 * rather than scrolling it — scrolling cannot zoom, and re-laying-out at each
	 * scale would re-route every wire.
	 *
	 * Four details are what make it feel right rather than merely work. Zoom is
	 * anchored at the pointer, not the centre, or whatever you were looking at
	 * slides away as you scroll. A drag that starts on a card must not follow the
	 * link, so a click is swallowed once the pointer has travelled a few pixels.
	 * The view fits on first paint, because 1:1 on a wide graph opens on a corner
	 * of it. And a card reached with the keyboard pans itself into view.
	 *
	 * The caller owns the plane's contents and its own card styles; this owns the
	 * box, the transform and the gestures.
	 */
	import { onMount, type Snippet } from 'svelte';

	interface Props {
		/** the plane's own size, in its own coordinates */
		width: number;
		height: number;
		/** accessible name — say what the graph is; the gestures are appended */
		label: string;
		children: Snippet;
	}

	let { width, height, label, children }: Props = $props();

	let viewport = $state<HTMLDivElement | null>(null);

	/* ---- the view ---------------------------------------------------------- */

	/** Far enough out for the deepest chain, far enough in to read a 10px tag. */
	const MIN_SCALE = 0.1;
	const MAX_SCALE = 3;
	/** Pointer travel that turns a click into a drag. */
	const DRAG_SLOP = 4;

	let scale = $state(1);
	let tx = $state(0);
	let ty = $state(0);
	/** Once the reader has moved the view, stop re-fitting it under them. */
	let touched = $state(false);
	let grabbing = $state(false);

	const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

	/**
	 * Zoom about a point, in viewport coordinates.
	 *
	 * Keeping that point still is the whole trick: the model position under the
	 * cursor is `(p - t) / k`, and holding it fixed across the change gives
	 * `t2 = p - (p - t) * k2 / k`. Zoom about the centre instead and whatever you
	 * were looking at slides away as you scroll.
	 */
	function zoomAbout(px: number, py: number, next: number) {
		const k2 = clamp(next, MIN_SCALE, MAX_SCALE);
		if (k2 === scale) return;
		tx = px - (px - tx) * (k2 / scale);
		ty = py - (py - ty) * (k2 / scale);
		scale = k2;
		touched = true;
	}

	/** The whole graph, centred. Never past 1:1 — a two-card chain blown up to
	 *  fill a 900px panel reads as a bug rather than a feature. */
	function fit(markTouched = true) {
		const box = viewport?.getBoundingClientRect();
		if (!box?.width || !box.height) return;
		const k = clamp(Math.min(box.width / width, box.height / height), MIN_SCALE, 1);
		scale = k;
		tx = (box.width - width * k) / 2;
		ty = (box.height - height * k) / 2;
		if (markTouched) touched = true;
	}

	function nudgeZoom(factor: number) {
		const box = viewport?.getBoundingClientRect();
		if (!box) return;
		zoomAbout(box.width / 2, box.height / 2, scale * factor);
	}

	/* The wheel listener is attached by hand because it must not be passive:
	   without preventDefault the page scrolls behind the zoom and you get both. */
	onMount(() => {
		const el = viewport;
		if (!el) return;

		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const box = el.getBoundingClientRect();
			// deltaY arrives in pixels, lines or pages depending on the device
			const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? box.height : 1;
			zoomAbout(
				e.clientX - box.left,
				e.clientY - box.top,
				scale * Math.exp(-e.deltaY * unit * 0.0015)
			);
		};
		el.addEventListener('wheel', onWheel, { passive: false });

		/* Fit immediately, and again on resize until the reader takes over.
		   Both, not just the observer: the server renders the plane at 1:1 with
		   no offset, because it has no box to measure against, so anything that
		   delays the first callback leaves the reader looking at the top-left
		   corner of a plane several times the width of the box — which reads as
		   a broken page rather than as one that has not finished loading. */
		fit(false);
		const ro = new ResizeObserver(() => {
			if (!touched) fit(false);
		});
		ro.observe(el);

		return () => {
			el.removeEventListener('wheel', onWheel);
			ro.disconnect();
		};
	});

	/* ---- pointers ---------------------------------------------------------- */

	const pointers = new Map<number, { x: number; y: number }>();
	let last = { x: 0, y: 0 };
	let pinch = 0;
	/** Set once a drag passes the slop; read by the click guard, then cleared. */
	let dragged = false;

	const spread = () => {
		const [a, b] = [...pointers.values()];
		return Math.hypot(a.x - b.x, a.y - b.y);
	};
	const midpoint = () => {
		const [a, b] = [...pointers.values()];
		return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
	};

	function onPointerDown(e: PointerEvent) {
		// left button only for a mouse; touch and pen have no button to check
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointers.size === 1) {
			grabbing = true;
			dragged = false;
			last = { x: e.clientX, y: e.clientY };
			// capture, so a drag that leaves the box keeps panning
			viewport?.setPointerCapture(e.pointerId);
		} else if (pointers.size === 2) {
			grabbing = false;
			pinch = spread();
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (!pointers.has(e.pointerId)) return;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

		if (pointers.size >= 2) {
			const now = spread();
			if (pinch && now) {
				const box = viewport!.getBoundingClientRect();
				const m = midpoint();
				zoomAbout(m.x - box.left, m.y - box.top, scale * (now / pinch));
			}
			pinch = now;
			dragged = true;
			return;
		}

		if (!grabbing) return;
		const dx = e.clientX - last.x;
		const dy = e.clientY - last.y;
		if (Math.abs(dx) + Math.abs(dy) > DRAG_SLOP) dragged = true;
		tx += dx;
		ty += dy;
		last = { x: e.clientX, y: e.clientY };
		touched = true;
	}

	function onPointerUp(e: PointerEvent) {
		pointers.delete(e.pointerId);
		if (pointers.size < 2) pinch = 0;
		if (pointers.size === 0) grabbing = false;
	}

	/* Capture phase, so it runs before the anchor's own handling: a drag that
	   began on a card was a drag, and must not also open the card. */
	function onClickCapture(e: MouseEvent) {
		if (!dragged) return;
		e.preventDefault();
		e.stopPropagation();
		dragged = false;
	}

	function onKeydown(e: KeyboardEvent) {
		const step = e.shiftKey ? 120 : 40;
		const moves: Record<string, [number, number]> = {
			ArrowLeft: [step, 0],
			ArrowRight: [-step, 0],
			ArrowUp: [0, step],
			ArrowDown: [0, -step]
		};
		if (moves[e.key]) {
			e.preventDefault();
			tx += moves[e.key][0];
			ty += moves[e.key][1];
			touched = true;
		} else if (e.key === '+' || e.key === '=') {
			e.preventDefault();
			nudgeZoom(1.2);
		} else if (e.key === '-' || e.key === '_') {
			e.preventDefault();
			nudgeZoom(1 / 1.2);
		} else if (e.key === '0') {
			e.preventDefault();
			fit();
		}
	}

	/* Tabbing reaches every card in the plane, including the ones currently
	   off-screen. Pan the focused one into the box rather than leaving the reader
	   on something they cannot see. Any focusable descendant, not a class this
	   component knows: the two trees name their cards differently. */
	function onFocusIn(e: FocusEvent) {
		const el = e.target as HTMLElement | null;
		const box = viewport?.getBoundingClientRect();
		if (!el || !box) return;
		const r = el.getBoundingClientRect();
		const pad = 24;
		if (r.left < box.left + pad) tx += box.left + pad - r.left;
		else if (r.right > box.right - pad) tx -= r.right - (box.right - pad);
		if (r.top < box.top + pad) ty += box.top + pad - r.top;
		else if (r.bottom > box.bottom - pad) ty -= r.bottom - (box.bottom - pad);
	}
</script>

<!-- `role="application"` is the honest description: this box handles the arrow
     keys, +, − and 0 itself, and a screen reader has to stop intercepting them
     for that to work. Both rules below assume a role with no interaction model,
     which is the one thing this is not. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="viewport"
	class:grabbing
	bind:this={viewport}
	role="application"
	aria-label="{label} — drag to pan, scroll to zoom, arrow keys to move"
	tabindex="0"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	onclickcapture={onClickCapture}
	onkeydown={onKeydown}
	onfocusin={onFocusIn}
>
	<div
		class="plane"
		style="width:{width}px; height:{height}px;
		       transform: translate({tx}px, {ty}px) scale({scale})"
	>
		{@render children()}
	</div>

	<div class="controls">
		<button type="button" onclick={() => nudgeZoom(1.25)} aria-label="Zoom in" title="Zoom in">+</button>
		<button type="button" onclick={() => nudgeZoom(1 / 1.25)} aria-label="Zoom out" title="Zoom out">−</button>
		<button type="button" onclick={() => fit()} aria-label="Fit the whole graph" title="Fit (0)">⤢</button>
	</div>
</div>

<style>
	.viewport {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 20rem;
		overflow: hidden;
		touch-action: none;
		overscroll-behavior: contain;
		cursor: grab;
		background: var(--surface-sunken);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-3);
	}

	.viewport.grabbing {
		cursor: grabbing;
	}

	/* `0 0` so the transform maths is in plain plane coordinates rather than
	   measured from a moving centre */
	.plane {
		position: relative;
		transform-origin: 0 0;
		/* cards are drawn at every scale rather than rasterised once, so text
		   stays sharp zoomed in; `will-change` keeps the layer promoted between
		   gestures instead of thrashing on every wheel tick */
		will-change: transform;
	}

	.controls {
		position: absolute;
		right: var(--space-3);
		bottom: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: 1px;
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		overflow: hidden;
		background: var(--border);
	}

	.controls button {
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		border: none;
		background: var(--surface);
		color: var(--text-dim);
		font-size: var(--text-sm);
		line-height: 1;
		cursor: pointer;
	}

	.controls button:hover {
		background: var(--surface-raised);
		color: var(--accent);
	}
</style>
