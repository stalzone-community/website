<script lang="ts">
	/* Order matters. The contract names the scale and shape but no colour; the
	   palette supplies the colours and may override anything above it, which
	   only works because it comes second. See sveltekit-commons/tokens.css.
	   The fonts the palette names load first, so nothing renders in a fallback
	   and then reflows — same arrangement, and the same two faces, as UAR. */
	import '@fontsource-variable/inter';
	import '@fontsource-variable/jetbrains-mono';
	import 'sveltekit-commons/tokens.css';
	import '$lib/styles/palette.css';
	import 'sveltekit-commons/base.css';
	import '$lib/styles/site.css';

	import { page } from '$app/state';
	import { MadeBy } from 'cedricdessalles-commons';
	import { SearchChip } from 'sveltekit-commons';
	import { isSearchShortcut } from 'sveltekit-commons/palette';
	import { AppShell, NavItem, NavProgress, NavSection } from 'sveltekit-commons/app';

	import { itemName } from '$lib/items';
	import { groupLabel } from '$lib/palette';
	import { lang } from '$lib/lang.svelte';
	import ExboButton from '$lib/components/ExboButton.svelte';
	// language switching is parked for now — see the tools snippet below
	// import LangSwitcher from '$lib/components/LangSwitcher.svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import RegionSwitcher from '$lib/components/RegionSwitcher.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { latestVersionInfo } from 'sveltekit-commons/changelog';
	import {
		buildsIcon,
		changelogIcon,
		emissionIcon,
		feedbackIcon,
		homeIcon,
		itemsIcon,
		searchIcon,
		techTreeIcon
	} from '$lib/nav-icons';

	let { children, data } = $props();

	const groups = $derived(data.groups ?? []);

	let palette = $state<ReturnType<typeof CommandPalette> | null>(null);

	/* Every category, plus the standing pages, so the palette answers "where do
	   I go" as well as "which item is this". The English group name rides along
	   as an alias: a French reader typing "weapon" should still land on Armes. */
	const sections = $derived([
		...groups.map((g) => ({
			kind: 'group' as const,
			id: g.name,
			label: groupLabel(g.name),
			href: `/items/${g.name}`,
			count: g.count,
			alias: [g.name.replace(/_/g, ' ')]
		})),
		{ kind: 'page' as const, id: 'search', label: 'Search', href: '/search', alias: ['all items'] },
		{ kind: 'page' as const, id: 'tech-tree', label: 'Tech tree', href: '/tech-tree' },
		{ kind: 'page' as const, id: 'emission', label: 'Emissions', href: '/emission' }
	]);

	/* Ctrl/Cmd+F, Ctrl/Cmd+K and "/" — the binding set lives in commons so this
	   site and UAR cannot drift on which keys open search. The chip in the bar
	   names the first of them. */
	function onWindowKeydown(e: KeyboardEvent) {
		if (!isSearchShortcut(e)) return;
		e.preventDefault();
		palette?.open();
	}

	/* The bar's heading, the way UAR's works: a section crumb, the subject's own
	   picture, and the page's <h1>. It lives here rather than in each page so
	   there is exactly one heading on screen and it is always in the same place
	   — which is why the entity page no longer renders its own breadcrumb.

	   The subject is read off `page.data`: an entity page already loads the item
	   it is about, so the bar can show that item's icon without a second lookup
	   or a store to keep in sync. */
	const crumbFor = $derived.by(() => {
		const p = page.url.pathname;
		const entity = page.data.entity as
			| { name?: Record<string, string>; icon?: string | null; group?: string }
			| undefined;

		// the overview names itself: the bar is the site's one heading slot, and a
		// bare bar on the page every visitor lands on first reads as unfinished
		if (p === '/') return { section: null, title: 'Overview', icon: null };

		if (p.startsWith('/entities/') || p.startsWith('/item/')) {
			return {
				section: entity?.group?.replace(/_/g, ' ') ?? 'Item',
				title: entity ? itemName(entity as never, lang()) : null,
				icon: entity?.icon ?? null
			};
		}
		if (p.startsWith('/craft/')) {
			// the craft page is about one item, so the bar names that item — the
			// root is in `page.data`, already resolved
			const root = page.data.items?.[page.data.root as string];
			return {
				section: 'Crafting',
				title: root ? itemName(root, lang()) : null,
				icon: root?.icon ?? null
			};
		}
		if (p.startsWith('/tech-tree')) {
			// /tech-tree/<group> — the group is the page's subject, so it is the
			// title, exactly as the item is on an entity page
			const group = page.data.group as string | undefined;
			return {
				section: 'Tech tree',
				title: group ? `${group.replace(/_/g, ' ')} tech tree` : null,
				icon: null
			};
		}
		if (p.startsWith('/builds/create'))
			return { section: 'Builds', title: 'Build calculator', icon: null };
		if (p.startsWith('/builds')) return { section: 'Builds', title: null, icon: null };
		if (p.startsWith('/account')) return { section: 'Account', title: null, icon: null };
		if (p.startsWith('/changelog')) return { section: 'Site', title: 'Changelog', icon: null };
		if (p.startsWith('/emission')) return { section: 'Emissions', title: null, icon: null };
		if (p.startsWith('/items')) {
			const group = page.data.group as string | undefined;
			return { section: 'Items', title: group?.replace(/_/g, ' ') ?? null, icon: null };
		}
		return { section: null, title: null, icon: null };
	});

	const onItems = $derived(page.url.pathname === '/items');
	const onSearch = $derived(page.url.pathname === '/search');
	const onTechTree = $derived(page.url.pathname.startsWith('/tech-tree'));
	const onEmission = $derived(page.url.pathname.startsWith('/emission'));
	const onFeedback = $derived(page.url.pathname === '/feedback');
	const onBuilds = $derived(page.url.pathname.startsWith('/builds'));
	const onChangelog = $derived(page.url.pathname === '/changelog');

	// Changelog badge: latest released version, and a dot when it is new to this
	// visitor. Globbing release.json rather than importing $lib/changelog-data
	// on purpose — that module pulls every entry's prose into whatever chunk
	// touches it, and the layout is in every chunk. This is a few hundred bytes.
	const badge = latestVersionInfo(
		import.meta.glob('/changelog/v*/release.json', { eager: true, import: 'default' }) as Record<
			string,
			{ notable?: number }
		>
	);
	const siteVersion = badge.version;

	let newChanges = $state(false);
	$effect(() => {
		if (!siteVersion) return;
		const seen = localStorage.getItem('sz:seen-version');
		// A first-ever visitor is not "behind" — mark them current rather than
		// greeting them with an unread dot for a release they have never missed.
		if (onChangelog || seen === null) {
			localStorage.setItem('sz:seen-version', siteVersion);
			newChanges = false;
		} else {
			newChanges = badge.notable && seen !== siteVersion;
		}
	});
</script>

<svelte:window onkeydown={onWindowKeydown} />

<CommandPalette bind:this={palette} {sections} />

<AppShell navKey="sz:nav-open" navLabel="Sections">
	{#snippet brand()}
		<a class="brand-home" href="/" aria-label="Stalzone — home">
			<span class="brand-mark">SZ</span>
		</a>
	{/snippet}

	{#snippet crumb()}
		<NavProgress />
		<!-- the page heading lives here, and it is the page's <h1>: one heading,
		     in the one place the design shows it -->
		{#if crumbFor.section}<span class="crumb-section">{crumbFor.section} /</span>{/if}
		{#if crumbFor.icon}
			<img class="crumb-icon" src={crumbFor.icon} alt="" width="24" height="24" />
		{/if}
		{#if crumbFor.title}<h1 class="crumb-title">{crumbFor.title}</h1>{/if}
	{/snippet}

	{#snippet tools(compactChips)}
		<!-- the palette, not a field of its own: one search on the site, reachable
		     the same way from the keyboard and from a phone with none -->
		<SearchChip onopen={() => palette?.open()} compact={compactChips} />
		<!-- Auction prices are per region and the regions do not agree: RU carries
		     several times EU's listings, so a visitor left on the default is
		     reading the thinnest market. It sits in the bar rather than on the
		     auction tab because it is a standing preference, not a per-page one. -->
		<RegionSwitcher compact={compactChips} />
		<!-- the switcher is hidden for now, so nothing calls readStoredLang() and
		     the site stays on the English `lang.svelte.ts` default everywhere -->
		<!-- <LangSwitcher /> -->
		<ThemeToggle />
		<ExboButton />
	{/snippet}

	{#snippet nav(close)}
		<NavItem href="/" label="Overview" active={page.url.pathname === '/'} onclick={close}>
			{#snippet icon()}{@html homeIcon}{/snippet}
		</NavItem>
		<NavItem href="/search" label="Search" active={onSearch} onclick={close}>
			{#snippet icon()}{@html searchIcon}{/snippet}
		</NavItem>
		<NavItem href="/tech-tree" label="Tech tree" active={onTechTree} onclick={close}>
			{#snippet icon()}{@html techTreeIcon}{/snippet}
		</NavItem>
		<NavItem href="/emission" label="Emissions" active={onEmission} onclick={close}>
			{#snippet icon()}{@html emissionIcon}{/snippet}
		</NavItem>
		<NavItem href="/builds" label="Builds" active={onBuilds} onclick={close}>
			{#snippet icon()}{@html buildsIcon}{/snippet}
		</NavItem>
		<NavItem href="/feedback" label="Feedback" active={onFeedback} onclick={close}>
			{#snippet icon()}{@html feedbackIcon}{/snippet}
		</NavItem>

		{#if siteVersion}
			<!-- the release the site is running: this is where the site's news
			     lives rather than another place to go. The dot is the only loud
			     part, and only until it is read. -->
			<NavItem
				href="/changelog"
				label="Changelog"
				active={onChangelog}
				onclick={close}
				title={newChanges
					? `Changelog — ${siteVersion} is new`
					: `Changelog — running ${siteVersion}`}
			>
				{#snippet icon()}
					{@html changelogIcon}
					{#if newChanges}<span
							class="ver-dot"
							class:inverted={onChangelog}
							aria-hidden="true"
						></span>{/if}
				{/snippet}
				{#snippet trailing()}{siteVersion}{/snippet}
			</NavItem>
		{/if}
	{/snippet}

	{#snippet foot()}
		<b class="foot-title">Stalzone</b>
		<span class="foot-note">Unofficial fan reference.</span>
		<!-- EXBO's database is Apache-2.0 and the licence requires the attribution
		     to be carried, so it cannot simply go. It moved out of the content
		     column because a paragraph of licence text under a full-bleed craft
		     tree is in the way of the thing the page is for. The link keeps its
		     own display rather than folding with `--label-display`: collapsed to
		     the rail the prose is gone but the credit still has to be reachable. -->
		<a class="foot-credit" href="https://github.com/EXBO-Studio/stalzone-database" rel="noreferrer">
			<span class="foot-note">Item data: </span>EXBO<span class="foot-note"> (Apache-2.0)</span>
		</a>
		<!-- collapsed, the credit keeps only its marks: they carry the links on
		     their own, the prose does not. AppShell's --label-display and
		     --foot-dir drive that, mapped onto the component's own names in the
		     stylesheet below — the wrapper exists to give those a scoped anchor,
		     since a rule cannot cross into the component itself. -->
		<div class="credit">
			<MadeBy repo="stalzone-community/website" kofi="cedricdessalles" />
		</div>
	{/snippet}

	{@render children()}
</AppShell>

<style>
	.brand-home {
		display: flex;
		text-decoration: none;
	}

	.brand-mark {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-2);
		background: var(--accent);
		color: var(--accent-contrast);
		font: 700 11px/1 var(--font-mono);
		letter-spacing: 0.03em;
	}

	.crumb-section {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-dim);
		white-space: nowrap;
	}

	/* The subject's own picture, level with the heading rather than its baseline.
	   Round, as UAR does it — and `contain` rather than `cover` is what makes
	   that safe here: an item icon is a wide transparent gun or vest, so the
	   circle is the chip it sits in, not a crop through the artwork. */
	.crumb-icon {
		width: 26px;
		height: 26px;
		align-self: center;
		flex: none;
		object-fit: contain;
		padding: 2px;
		border-radius: 50%;
		border: 1px solid var(--border);
		/* the same cell every other item icon sits in — it was --surface-sunken,
		   i.e. darker than the bar, which is the wrong way round for art that is
		   drawn as a dark silhouette. See the note in site.css. */
		background: var(--icon-cell);
		image-rendering: pixelated;
	}

	/* an <h1> in the bar: the page's one heading, sized like a crumb */
	.crumb-title {
		margin: 0;
		font-size: 15.5px;
		font-weight: 650;
		letter-spacing: -0.01em;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Unread release: a dot on the icon — visible collapsed to the rail too,
	   and gone for good once the changelog has been opened. The ring takes the
	   rail's own colour rather than following the row's hover state, because
	   the row belongs to NavItem and reaching into another component's classes
	   to track its state is the coupling the extraction removed. */
	.ver-dot {
		position: absolute;
		top: -1px;
		right: 0;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--accent);
		box-shadow: 0 0 0 2px var(--surface-sunken);
	}

	/* on the selected row the dot inverts, or it vanishes into the accent */
	.ver-dot.inverted {
		background: var(--accent-contrast);
		box-shadow: 0 0 0 2px var(--accent);
	}

	.foot-title {
		display: var(--label-display);
		font-size: 12px;
		font-weight: 650;
		color: var(--text-dim);
	}

	.foot-note {
		display: var(--label-display);
	}

	/* The credit row is cedricdessalles-commons' MadeBy, the same signature the
	   UAR and Guild Wars sites carry. Its geometry is set through the
	   component's own custom properties rather than by styling its insides:
	   scoped rules stop at the boundary, and reaching past it would break
	   silently the next time that package renamed a class.

	   The colours are the deliberate exception. The signature keeps its brand
	   accent on hover instead of this site's — it is the one element on the page
	   that is the author's rather than STALZONE's. At rest it takes the footer
	   ink, so it reads as part of the footer and not as a badge. */
	.credit :global(.made-by) {
		--madeby-label-display: var(--label-display);
		--madeby-dir: var(--foot-dir);
		--madeby-align: var(--nav-justify);
		--madeby-glyph: calc(var(--nav-glyph) - 3px);
		--madeby-ink: var(--text-dim);
		margin-top: 6px;
	}

	/* Always shown, in both rail states — see the note on the markup. Only the
	   words around it fold, which is what --label-display does for the rest of
	   the footer. */
	.foot-credit {
		display: block;
		margin-top: 4px;
		font-size: var(--text-xs);
		color: var(--text-faint);
		text-decoration: none;
	}

	.foot-credit:hover {
		color: var(--accent);
	}
</style>
