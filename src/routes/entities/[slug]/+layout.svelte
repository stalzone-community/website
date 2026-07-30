<script lang="ts">
	/**
	 * The entity page's frame: its own top bar of tabs, and — on the overview
	 * alone — the upgrade slider and the infobox.
	 *
	 * The bar is the only part that spans every tab, because it is the only part
	 * every tab needs. The other two follow the numbers they move, and the
	 * numbers are all on the overview: the infobox restates weight, price and
	 * durability, and the slider changes them. Beside a craft chain or a tech
	 * tree they were a column of stats nothing on screen referred to and a
	 * control with nothing to control, and they cost the wide graphs 290px of
	 * the room they most need.
	 */
	import { page } from '$app/state';
	import { FactsCard, type Fact } from 'sveltekit-commons';

	import LevelControl from '$lib/components/LevelControl.svelte';
	import { entityHref, INFOBOX_STATS, tabSegment, tabsFor } from '$lib/entities';
	import { provideUpgradeLevel } from '$lib/entity-level.svelte';
	import { formatStat, itemName, rankSlug, statsAtLevel } from '$lib/items';
	import { lang as displayLang } from '$lib/lang.svelte';

	let { data, children } = $props();

	const lang = $derived(displayLang());
	const entity = $derived(data.entity);
	/* The group is passed so the compatibility tab can name itself for the
	   direction you are reading it in — "Attachments" on a rifle, "Weapons" on a
	   scope. See ENTITY_TABS.labelByGroup. */
	const tabs = $derived(tabsFor(data.capabilities, entity.group));

	const level = provideUpgradeLevel();

	/* The router reuses this layout across a [slug] change, so the slider would
	   otherwise carry +12 from a rifle onto an item that only goes to +3. */
	let owner: string | null = null;
	$effect.pre(() => {
		if (owner === entity.id) return;
		owner = entity.id;
		level.value = 0;
	});

	const stats = $derived(statsAtLevel(entity, level.value));

	/* Which facts the level moved, highlighted in accent — the slider is above
	   the infobox, not in it, so without this the numbers change with nothing on
	   screen tying them to the control. */
	const changed = $derived(
		new Set(
			level.value === 0 ? [] : Object.keys(stats).filter((k) => stats[k] !== entity.stats[k])
		)
	);

	const label = (slug: string) =>
		data.statMeta[slug]?.label[lang] ?? data.statMeta[slug]?.label.en ?? slug;

	const facts = $derived.by((): Fact[] => {
		const out: Fact[] = [];
		for (const [slug, key] of Object.entries(entity.enums)) {
			const m = data.statMeta[slug];
			if (!m) continue;
			out.push({
				label: m.label[lang] ?? m.label.en ?? slug,
				value: data.enumLabels[key]?.[lang] ?? data.enumLabels[key]?.en ?? key
			});
		}
		for (const slug of INFOBOX_STATS) {
			if (stats[slug] === undefined || !data.statMeta[slug]) continue;
			out.push({
				label: label(slug),
				value: formatStat(stats[slug], data.statMeta[slug], lang),
				changed: changed.has(slug)
			});
		}
		return out;
	});

	const active = $derived(tabSegment(page.route.id) ?? '');

	const href = (segment: string) => entityHref(data.slug, segment);

	/** The overview is the empty segment — see `active` above. */
	const onOverview = $derived(active === '');

	/* Published as --entity-chrome-h so a tab can size itself against what is
	   left of the window. Zero when the bar is not rendered at all. */
	let tabsH = $state(0);
</script>

<!-- One tab is no choice, so it is not a tab bar — the overview alone renders
     bare, exactly as the page did before it was split. -->
{#if tabs.length > 1}
	<!-- measured, not guessed: a tab that wants the rest of the window has to
	     subtract this bar, and the bar changes height between the wide and the
	     icons-only layout -->
	<nav class="tabs" bind:clientHeight={tabsH} aria-label="{itemName(entity, lang)} sections">
		{#each tabs as t (t.segment)}
			<!-- The label is hidden below 900px, not removed, so `aria-label`
			     carries the name at every width and the tooltip covers a pointer
			     that cannot read the glyph either. -->
			<a
				href={href(t.segment)}
				aria-current={active === t.segment ? 'page' : undefined}
				aria-label={t.label}
				title={t.label}
			>
				{@html t.icon}
				<span class="label">{t.label}</span>
			</a>
		{/each}
	</nav>
{/if}

<!-- The overview only. Every number the level moves — the stats table, the
     effect bands, the infobox facts — is on that tab, so anywhere else this is
     a slider you can drag with nothing on screen responding to it. -->
{#if onOverview && data.capabilities.upgrades}
	<div class="level">
		<LevelControl bind:level={level.value} max={data.maxLevel} />
	</div>
{/if}

<!-- `full` when there is no second column, so the main one takes the width back
     rather than leaving a 290px gutter where the infobox used to be. -->
<div
	class="layout"
	class:full={!onOverview}
	style="--entity-chrome-h: {tabsH}px"
>
	<div class="main">{@render children()}</div>

	{#if onOverview}
		<aside class="infobox">
			<FactsCard
				portrait={entity.icon}
				portraitAlt=""
				title={itemName(entity, lang)}
				accent="var(--rank-{rankSlug(entity.rank)})"
				chip={entity.kind.replace(/_/g, ' ')}
				{facts}
			/>
		</aside>
	{/if}
</div>

<style>
	/* The page's own bar, and it behaves like one: pinned to the top of the
	   scrollport so only the content under it moves.

	   AppShell scrolls `main`, not the window, and its own header sits outside
	   that box — so `top: 0` here parks this bar directly beneath the shell's,
	   and the two read as one stack of chrome. It takes the header's surface and
	   rule for the same reason.

	   The margins are what make it a bar rather than a boxed widget: it bleeds
	   out through the content column's padding on both sides, so nothing scrolls
	   past in the gutters, and up through the top padding so there is no seam
	   between it and the header above. */
	.tabs {
		position: sticky;
		top: 0;
		/* under the drawer (--z-nav: 50), over the page */
		z-index: 20;
		display: flex;
		align-items: stretch;
		gap: var(--space-1);
		height: 36px;
		overflow-x: auto;
		scrollbar-width: none;
		margin: calc(-1 * var(--content-pad-top)) calc(-1 * var(--content-pad-x)) var(--space-4);
		padding: 0 var(--content-pad-x);
		background: var(--surface-sunken);
		border-bottom: var(--border-width) solid var(--border);
	}

	.tabs::-webkit-scrollbar {
		display: none;
	}

	.tabs a {
		flex: none;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 0 var(--space-3);
		color: var(--text-dim);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		text-decoration: none;
		white-space: nowrap;
	}

	.tabs a :global(svg) {
		width: 15px;
		height: 15px;
		flex: none;
	}

	.tabs a:hover {
		color: var(--text);
	}

	/* An inset shadow rather than a border: the link is stretched to the bar's
	   full height, so a real border would have to be juggled against the bar's
	   own bottom rule with negative margins. This just draws over it. */
	.tabs a[aria-current='page'] {
		box-shadow: inset 0 -2px 0 var(--accent);
		color: var(--text);
	}

	/* Icons only, at the width where the shell drops its own labels and folds
	   the rail into a drawer — the tab bar goes quiet at the same moment the
	   rest of the chrome does, rather than at a line of its own. */
	@media (max-width: 899.98px) {
		.tabs a {
			/* square, so a row of them reads as buttons and not a ragged strip */
			justify-content: center;
			padding: 0;
			min-width: 44px;
		}
		.tabs .label {
			display: none;
		}
		.tabs a :global(svg) {
			width: 18px;
			height: 18px;
		}
	}

	/* LevelControl draws itself as a card header — a bottom rule and no top one
	   — so it needs the other three sides to stand alone above the columns. */
	.level {
		margin-bottom: var(--space-4);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		overflow: hidden;
	}

	/* Same shape as UAR's entity page: a flexible main column and a fixed
	   infobox, collapsing to a block with the cards side by side. */
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 290px;
		gap: 0 var(--space-6);
		align-items: start;
	}

	/* no infobox, no second column — and no gutter left where it was */
	.layout.full {
		grid-template-columns: minmax(0, 1fr);
	}

	.main {
		min-width: 0;
	}

	/* The tabs render into .main, so the frame owns the rhythm between their
	   bands rather than each of them repeating it.

	   SectionHeading already carries the gap between bands (margin-top:
	   --space-7), so a card margin on top of it stacked to 4.5rem of dead space
	   above every heading — one of the two owns it, and it is the heading. The
	   first heading of a tab is the exception: it starts under the bar, not 3rem
	   below it. Same arrangement as UAR. */
	.main :global(.block) {
		margin-bottom: 0;
	}

	.main :global(.section:first-child) {
		margin-top: var(--space-1);
	}

	/* the row count beside a heading — "Stats 13", "Compatible 61" */
	.main :global(.count) {
		font-family: var(--font-mono);
		color: var(--text-faint);
		letter-spacing: 0;
	}

	@media (max-width: 1080px) {
		.layout {
			display: flex;
			flex-direction: column;
			/* `start` is for the grid, where it stops the infobox stretching to
			   the height of a long table. Left standing here it becomes the flex
			   cross axis, i.e. the *width*, and both columns collapse to their
			   content. */
			align-items: stretch;
		}
		/* Above the content, not below it. On a wide screen the infobox is level
		   with the first section; stacked, "below everything" would put the
		   weight and the price of the item at the bottom of a tech tree. */
		.infobox {
			order: -1;
			margin-bottom: var(--space-4);
			/* the portrait is square, so full width on a tablet would open with a
			   560px picture of a shotgun */
			max-width: 360px;
		}
	}
</style>
