<script lang="ts">
	/**
	 * One tech tree: each column is a tier, each card is an item, and each wire
	 * is a barter that turns one into the next. Drawn right to left — see the
	 * note below.
	 *
	 * HTML cards over an SVG wire layer, rather than one SVG with foreignObject
	 * or <text>. The cards are links with icons and wrapping five-language
	 * names — everything HTML already does and SVG does badly — and only the
	 * wires need paths, so the SVG is inert and `pointer-events: none` above it.
	 *
	 * The wires arrive already routed. They are orthogonal A* paths from
	 * grid-router, computed at build time by the route: a parent's steps share a
	 * bus so they leave as one trunk and branch off it, and no two runs share a
	 * lane. Hand-rolled routing put every fan-out's verticals at the same
	 * mid-column x, which read as one ambiguous line the moment a tier had more
	 * than two children.
	 *
	 * The plane is read through `PanZoom`, the same box the craft tree uses: a
	 * tree eight tiers wide does not fit a content column, so the box moves over
	 * it — wheel to zoom, drag to pan — rather than the page scrolling sideways
	 * and taking the heading and the filter with it.
	 *
	 * Drawn RIGHT TO LEFT: `cardLeft` mirrors the column, so the tier you start
	 * from is on the right and the line runs leftwards into what you upgrade
	 * into. The layout still numbers columns from the base tier — that is the
	 * semantics, and only the drawing is mirrored.
	 */
	import PanZoom from '$lib/components/PanZoom.svelte';
	import { itemName, rankSlug } from '$lib/items';
	import FactionMarks from '$lib/components/FactionMarks.svelte';
	import ItemIcon from '$lib/components/ItemIcon.svelte';
	import { CARD_H, CARD_W, ICON, cardLeft, cardTop } from '$lib/tech-geometry';
	import type { Lang, Localized } from '$lib/types';
	import type { TreeLayout } from '$lib/tech-tree';
	import type { TechItem } from '$lib/server/tech-tree';

	/** A routed wire, as the route hands it over. */
	interface Conn {
		id: string;
		source: string;
		target: string;
		d: string;
		sidegrade: boolean;
		settlements: string[];
	}

	interface Props {
		layout: TreeLayout;
		conns: Conn[];
		width: number;
		height: number;
		items: Record<string, TechItem>;
		/** node id → the settlements that hand it over */
		settlements: Record<string, string[]>;
		/** localised settlement names, for the pip tooltips */
		labels: Record<string, Localized>;
		/** highlighted node — the item whose page linked here */
		focus?: string | null;
		/** when set, anything not sold at this settlement is dimmed */
		only?: string | null;
		lang?: Lang;
	}

	let {
		layout,
		conns,
		width,
		height,
		items,
		settlements,
		labels,
		focus = null,
		only = null,
		lang = 'en'
	}: Props = $props();

	/** Marker ids are document-global, and a page carries up to sixteen trees. */
	const uid = $props.id();

	/** Hovered or keyboard-focused card. Drives the highlight; null when idle. */
	let active = $state<string | null>(null);

	const touches = (c: Conn, id: string | null) =>
		Boolean(id) && (c.source === id || c.target === id);

	const dimmed = (id: string) => Boolean(only) && !(settlements[id] ?? []).includes(only!);

	/** id → the ids one step away, either direction. */
	const neighbours = $derived.by(() => {
		const m = new Map<string, Set<string>>();
		const add = (a: string, b: string) => {
			const s = m.get(a) ?? m.set(a, new Set()).get(a)!;
			s.add(b);
		};
		for (const c of conns) {
			add(c.source, c.target);
			add(c.target, c.source);
		}
		return m;
	});

	/** The highlight: the card you are on, plus everything it trades with. */
	const near = (id: string) =>
		Boolean(active) && (id === active || Boolean(neighbours.get(active!)?.has(id)));

	const wires = $derived(
		[...conns]
			// the lit wires paint last, so they sit above the rest
			.sort(
				(a, b) =>
					Number(touches(a, focus) || touches(a, active)) -
					Number(touches(b, focus) || touches(b, active))
			)
			.map((c) => ({
				c,
				lit: touches(c, focus) || touches(c, active),
				// a step is dimmed on its own availability, not its endpoints':
				// Samson → Mule is a Frontier/Rise trade even though Samson is
				// sold to everyone
				dim: Boolean(only) && !c.settlements.includes(only!)
			}))
	);
</script>

<PanZoom {width} {height} label="Tech tree">
	<svg {width} {height} aria-hidden="true">
		<!--
			Three arrowheads rather than one with `context-stroke`: marker fill does
			not inherit the path's stroke in every engine, and a wire that lights up
			with a stale-coloured head is worse than no head. CSS picks the matching
			one per state. Ids carry the instance so five trees on a page do not all
			resolve to the first one's markers.
		-->
		<defs>
			{#each [['plain', 'var(--border-strong)'], ['lit', 'var(--accent)'], ['side', 'var(--text-faint)']] as [kind, colour] (kind)}
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
				class:sidegrade={w.c.sidegrade}
				class:lit={w.lit}
				class:dim={w.dim}
				class:faded={active && !w.lit}
				fill="none"
				marker-end="url(#{uid}-{w.lit ? 'lit' : w.c.sidegrade ? 'side' : 'plain'})"
				marker-start={w.c.sidegrade
					? `url(#${uid}-${w.lit ? 'lit' : 'side'})`
					: undefined}
			/>
		{/each}
	</svg>

	{#each layout.nodes as n (n.id)}
		{@const item = items[n.id]}
		{#if item}
			<a
				id={n.id}
				class="card"
				class:focus={n.id === focus}
				class:dim={dimmed(n.id)}
				class:near={near(n.id)}
				class:faded={active && !near(n.id)}
				href="/entities/{item.slug}/tech-tree"
				style="left:{cardLeft(n.column, layout.columns)}px; top:{cardTop(n.row)}px; width:{CARD_W}px;
				       height:{CARD_H}px; --icon-size:{ICON}px;
				       --rank: var(--rank-{rankSlug(item.rank)})"
				aria-current={n.id === focus ? 'page' : undefined}
				onmouseenter={() => (active = n.id)}
				onmouseleave={() => (active = null)}
				onfocus={() => (active = n.id)}
				onblur={() => (active = null)}
			>
				<ItemIcon src={item.icon} size={ICON} flush />
				<span class="name">{itemName(item, lang)}</span>
				<span class="marks">
					<FactionMarks settlements={settlements[n.id] ?? []} {labels} {lang} />
				</span>
			</a>
		{/if}
	{/each}
</PanZoom>

<style>
	/* the plane is PanZoom's now, and it carries the positioning context */
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
	}

	path.sidegrade {
		stroke-dasharray: 3 4;
		stroke: var(--text-faint);
	}

	path.lit {
		stroke: var(--accent);
		stroke-width: 2;
	}

	path.dim {
		opacity: 0.15;
	}

	/* everything the highlight is not about, pushed back */
	path.faded {
		opacity: 0.12;
	}

	path,
	.card {
		transition: opacity 120ms ease;
	}

	.card {
		position: absolute;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		/* No padding and no gap: the icon fills its own cell hard against the
		   card's edges, and the text carries the spacing instead. `overflow`
		   clips the cell to the card's rounded corner so the two meet cleanly. */
		overflow: hidden;
		border: var(--border-width) solid var(--border);
		border-left: 3px solid var(--rank);
		border-radius: var(--radius-2);
		background: var(--surface);
		text-decoration: none;
		color: var(--text);
	}

	.card:hover {
		background: var(--surface-raised);
		border-color: var(--border-strong);
		border-left-color: var(--rank);
	}

	.card.focus {
		border-color: var(--accent);
		background: var(--surface-raised);
		box-shadow: var(--shadow-2);
	}

	/* Dimmed, not hidden: the filter answers "which of these can I get at my
	   base" and the answer is only legible against the ones you cannot. */
	.card.dim {
		opacity: 0.28;
	}

	/* Hovering a card lights it and everything it trades with, and pushes the
	   rest back. On a 40-node tree that is the difference between "there is a
	   line through here somewhere" and seeing the actual step. */
	.card.near {
		border-color: var(--accent);
		background: var(--surface-raised);
	}

	.card.faded {
		opacity: 0.25;
	}

	/* only present when the item carries emblems, so the inset lives here
	   rather than as trailing padding on a card that usually has none */
	.marks:not(:empty) {
		display: flex;
		gap: 2px;
		padding-right: var(--space-2);
	}

	/* Two lines at most: names run to "Aurora Jumpsuit with Gas Mask", and a
	   card that grew to fit would break the row pitch the layout assumes. */
	.name {
		flex: 1;
		min-width: 0;
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
		line-height: 1.25;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

</style>
