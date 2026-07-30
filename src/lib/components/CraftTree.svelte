<script lang="ts">
	/**
	 * A rooted craft graph: what you gather on the left, the finished item on the
	 * right, and a card for every workbench step in between.
	 *
	 * Two node kinds, and the distinction is the point. An ITEM card is an
	 * amount of something. A JOIN is a recipe — the place several ingredients
	 * become one output. Drawing only items would turn "3 iron AND 2 polymers
	 * AND a lubricant" into three unrelated arrows pointing at the same card,
	 * which is the one thing a crafting diagram has to get right.
	 *
	 * Same construction as TechTree: HTML cards over an inert SVG wire layer,
	 * with the wires routed orthogonally by grid-router at build time. Positions
	 * arrive absolute because the two kinds are different widths, so there is no
	 * single column pitch to derive them from.
	 *
	 * PAN AND ZOOM
	 *
	 * The widest chains run past 2 300px, so the graph fills whatever box it is
	 * given and you move around inside it: wheel zooms at the cursor, drag pans,
	 * two fingers pinch. One transform on the whole plane rather than scrolling
	 * it — scrolling cannot zoom, and re-laying-out at each scale would re-route
	 * every wire.
	 *
	 * This lived in a shared `PanZoom` for a while so the tech tree could reuse
	 * it. It is inline again: the extraction broke the graph and the cause was
	 * never pinned down, and a working diagram beats a tidy one. Worth retrying
	 * with a browser open rather than by reading the DOM.
	 */
	import { onMount } from 'svelte';
	import { perkIcon, perkTint } from '$lib/craft-icons';
	import { itemName, rankSlug } from '$lib/items';
	import ItemIcon from '$lib/components/ItemIcon.svelte';
	import type { Lang } from '$lib/types';
	import type { CraftItem } from '$lib/server/craft-tree';

	interface Node {
		id: string;
		kind: 'item' | 'recipe';
		ref: string;
		amount: number;
		base: boolean;
		x: number;
		y: number;
		w: number;
		h: number;
	}

	interface Conn {
		id: string;
		source: string;
		target: string;
		d: string;
	}

	interface Recipe {
		bench: string;
		ingredients: { item: string; amount: number }[];
		result: { item: string; amount: number }[];
		/** profession id → required level; the first is what the card wears */
		perks?: Record<string, number>;
	}

	/** A recipe gates on one profession in all but a handful of cases; the mark
	 *  takes the first. Every one of the 368 recipes has at least one, so the
	 *  fallback below is a guard against upstream changing, not a real case. */
	const perkOf = (r: Recipe | undefined) => Object.keys(r?.perks ?? {})[0] ?? '';

	/** `home_brewing` → `home brewing`, for the tooltip. The card itself carries
	 *  the mark; this is for anyone who does not yet know what it means. */
	const perkLabel = (r: Recipe | undefined) => pretty(perkOf(r)) || 'recipe';

	interface Props {
		nodes: Node[];
		conns: Conn[];
		width: number;
		height: number;
		items: Record<string, CraftItem>;
		recipes: Record<string, Recipe>;
		/** the item the graph is rooted at, drawn as the goal */
		root: string;
		lang?: Lang;
	}

	let { nodes, conns, width, height, items, recipes, root, lang = 'en' }: Props = $props();

	const uid = $props.id();

	let active = $state<string | null>(null);

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


	const touches = (c: Conn, id: string | null) =>
		Boolean(id) && (c.source === id || c.target === id);

	const neighbours = $derived.by(() => {
		const m = new Map<string, Set<string>>();
		const add = (a: string, b: string) => (m.get(a) ?? m.set(a, new Set()).get(a)!).add(b);
		for (const c of conns) {
			add(c.source, c.target);
			add(c.target, c.source);
		}
		return m;
	});

	const near = (id: string) =>
		Boolean(active) && (id === active || Boolean(neighbours.get(active!)?.has(id)));

	const wires = $derived(
		[...conns]
			.sort((a, b) => Number(touches(a, active)) - Number(touches(b, active)))
			.map((c) => ({ c, lit: touches(c, active) }))
	);

	const pretty = (s: string) => s.replace(/_/g, ' ');

	/* A card goes to the same question about the thing it names, not to that
	   thing's overview: following a chain means asking "and what makes THAT",
	   and landing on a stats page each time breaks the thread.

	   Base materials are the exception, and have to be: nothing crafts them, so
	   they have no craft tree to show. They go to the Craft tab instead, which
	   is where "what this is used for" lives — and they always have one, because
	   being in this graph at all means some recipe consumes them. */
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
	aria-label="Craft tree — drag to pan, scroll to zoom, arrow keys to move"
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
	class="canvas"
	style="width:{width}px; height:{height}px;
	       transform: translate({tx}px, {ty}px) scale({scale})"
>

	<svg {width} {height} aria-hidden="true">
		<defs>
			{#each [['plain', 'var(--border-strong)'], ['lit', 'var(--accent)']] as [kind, colour] (kind)}
				<marker
					id="{uid}-{kind}"
					viewBox="0 0 8 8"
					refX="7"
					refY="4"
					markerWidth="5"
					markerHeight="5"
					orient="auto"
				>
					<path d="M0 1 L7 4 L0 7 Z" fill={colour} />
				</marker>
			{/each}
		</defs>

		{#each wires as w (w.c.id)}
			<path
				d={w.c.d}
				class:lit={w.lit}
				class:faded={active && !w.lit}
				fill="none"
				marker-end="url(#{uid}-{w.lit ? 'lit' : 'plain'})"
			/>
		{/each}
	</svg>

	{#each nodes as n (n.id)}
		{#if n.kind === 'item'}
			{@const item = items[n.ref]}
			{#if item}
				<a
					class="card"
					class:goal={n.ref === root}
					class:base={n.base}
					class:near={near(n.id)}
					class:faded={active && !near(n.id)}
					href="/entities/{item.slug}{item.base ? '/craft' : '/craft-tree'}"
					style="left:{n.x}px; top:{n.y}px; width:{n.w}px; height:{n.h}px;
					       --icon-size:{n.h}px; --rank: var(--rank-{rankSlug(item.rank)})"
					onmouseenter={() => (active = n.id)}
					onmouseleave={() => (active = null)}
					onfocus={() => (active = n.id)}
					onblur={() => (active = null)}
				>
					<ItemIcon src={item.icon} size={n.h} flush />
					<span class="body">
						<span class="name">{itemName(item, lang)}</span>
						<span class="tag">
							{#if n.ref === root}goal{:else if n.base}gather{:else}craft{/if}
							{#if n.amount > 1}<span class="qty">×{n.amount}</span>{/if}
						</span>
					</span>
				</a>
			{/if}
		{:else}
			{@const recipe = recipes[n.ref]}
			<!-- the join. Not a link: a recipe has no page of its own, it is the
			     relationship between the cards either side of it -->
			<div
				class="join"
				class:near={near(n.id)}
				class:faded={active && !near(n.id)}
				style="left:{n.x}px; top:{n.y}px; width:{n.w}px; height:{n.h}px"
				title={recipe
					? `${perkLabel(recipe)}: ${recipe.ingredients.map((i) => `${i.amount}x ${itemName(items[i.item] ?? { name: {}, id: i.item }, lang)}`).join(' + ')}`
					: undefined}
				onmouseenter={() => (active = n.id)}
				onmouseleave={() => (active = null)}
				role="presentation"
			>
				{#if perkOf(recipe)}
					<span class="mark" style:color={perkTint(perkOf(recipe))}>
						{@html perkIcon(perkOf(recipe))}
					</span>
				{:else}
					<span class="bench">—</span>
				{/if}
				<span class="count">{recipe?.ingredients.length ?? 0}</span>
			</div>
		{/if}
	{/each}
</div>

	<div class="controls">
		<button type="button" onclick={() => nudgeZoom(1.25)} aria-label="Zoom in" title="Zoom in">+</button>
		<button type="button" onclick={() => nudgeZoom(1 / 1.25)} aria-label="Zoom out" title="Zoom out">−</button>
		<button type="button" onclick={() => fit()} aria-label="Fit the whole tree" title="Fit (0)">⤢</button>
	</div>
</div>

<style>
	/* Takes whatever the parent gives it, so a page can hand it the full content
	   area and a card can hand it 400px — the fit-on-mount makes either show the
	   whole graph.

	   `touch-action: none` is load bearing: without it the browser claims the
	   drag for page scrolling and the pinch for its own zoom, and neither gesture
	   ever reaches this component. */
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
	.canvas {
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
	svg {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	path {
		stroke: var(--border-strong);
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
		transition: opacity 120ms ease;
	}

	path.lit {
		stroke: var(--accent);
		stroke-width: 2;
	}

	path.faded {
		opacity: 0.12;
	}

	.card,
	.join {
		position: absolute;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		overflow: hidden;
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		background: var(--surface);
		text-decoration: none;
		color: var(--text);
		transition: opacity 120ms ease;
	}

	.card {
		border-left: 3px solid var(--rank);
	}

	.card:hover,
	.card.near,
	.join.near {
		background: var(--surface-raised);
		border-color: var(--accent);
	}

	.card.near {
		border-left-color: var(--rank);
	}

	/* the item you came to make */
	.card.goal {
		border-color: var(--accent);
		box-shadow: var(--shadow-2);
	}

	.faded {
		opacity: 0.25;
	}

	.body {
		flex: 1;
		min-width: 0;
		padding: 0 var(--space-2);
	}

	.name {
		display: block;
		font-size: var(--text-xs);
		line-height: 1.2;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tag {
		display: block;
		font-family: var(--font-mono);
		font-size: 10px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	/* a gathered material is where the chain stops, so it is the one worth
	   spotting from across the diagram */
	.card.base .tag {
		color: var(--accent);
	}

	.qty {
		color: var(--text-dim);
	}

	.join {
		flex-direction: column;
		justify-content: center;
		gap: 1px;
		background: var(--surface-sunken);
		border-style: dashed;
	}

	/* The profession, in its own hue. This is the card's whole content now — a
	   bench name clipped to four characters said "work", "kitc", "labo" and was
	   unreadable at this size anyway. The tooltip still carries the full bench
	   and its ingredients. */
	.mark :global(svg) {
		width: 18px;
		height: 18px;
		display: block;
	}

	/* the fallback, for a recipe that gates on no profession at all */
	.bench {
		font-family: var(--font-mono);
		font-size: 9px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.count {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--text-dim);
	}
</style>
