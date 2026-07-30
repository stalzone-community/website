<script lang="ts">
	import { goto } from '$app/navigation';
	import { page as currentPage } from '$app/state';
	import { allGroupsIcon, groupIcon } from '$lib/group-icons';
	import {
		flagsParam,
		formatStat,
		ITEM_FLAGS,
		ITEM_FLAG_HINT,
		ITEM_FLAG_LABEL,
		itemName,
		rankSlug,
		toggleFlag,
		type ItemFlag
	} from '$lib/items';
	import { lang as displayLang } from '$lib/lang.svelte';
	import { Pager } from 'sveltekit-commons/app';

	let { data } = $props();

	const lang = $derived(displayLang());

	let searchTimer: ReturnType<typeof setTimeout>;

	/* Debounced, and replaceState: typing "assault" should leave one history
	   entry, not eight, or Back becomes useless. keepFocus holds the caret in
	   the box across the navigation. */
	function searchInput(event: Event) {
		clearTimeout(searchTimer);
		const value = (event.currentTarget as HTMLInputElement).value;
		searchTimer = setTimeout(() => {
			const params = new URLSearchParams(currentPage.url.search);
			if (value.trim()) params.set('q', value.trim());
			else params.delete('q');
			params.delete('page'); // a new search starts from the first page
			const query = params.toString();
			void goto(query ? `?${query}` : currentPage.url.pathname, {
				keepFocus: true,
				replaceState: true,
				noScroll: true
			});
		}, 300);
	}

	function withParam(name: string, value: string): string {
		const params = new URLSearchParams(currentPage.url.search);
		if (value) params.set(name, value);
		else params.delete(name);
		params.delete('page');
		const q = params.toString();
		return q ? `?${q}` : currentPage.url.pathname;
	}

	/* A checkable is still a link: it goes to a different URL, so it stays
	   shareable, back-able and works with JavaScript off — the same mechanism as
	   the category chips, applied to a set instead of a single value. */
	function flagHref(flag: ItemFlag): string {
		return withParam('has', flagsParam(toggleFlag(data.flags, flag)));
	}

	function sortHref(key: string): string {
		const params = new URLSearchParams(currentPage.url.search);
		// clicking the active column flips it; a fresh column starts in the
		// direction that column is usually read
		const flip = data.sort === key && data.dir === 'desc';
		params.set('sort', key);
		params.set('dir', flip || (key === 'name' && data.sort !== key) ? 'asc' : 'desc');
		params.delete('page');
		return `?${params.toString()}`;
	}

	const columns = [
		{ key: 'name', label: 'Item', num: false },
		{ key: 'rank', label: 'Rank', num: false },
		{ key: 'weight', label: 'Weight', num: true },
		{ key: 'base_price', label: 'Price', num: true },
		{ key: 'max_durability', label: 'Durability', num: true }
	];

	const fmt = (v: number | null, slug: string) =>
		v == null ? '—' : formatStat(v, data.statMeta[slug], lang);
</script>

<svelte:head>
	<title>Search — Stalzone</title>
	<meta name="description" content="Search every STALZONE item by name, category and rank." />
</svelte:head>

<div class="datapage">
	<div class="dtools">
		<form method="GET" data-sveltekit-keepfocus>
			<input
				type="search"
				name="q"
				value={data.q}
				placeholder="Search items…"
				oninput={searchInput}
				aria-label="Search items"
			/>
			{#if data.sort !== 'name'}<input type="hidden" name="sort" value={data.sort} />{/if}
			{#if data.group}<input type="hidden" name="group" value={data.group} />{/if}
			{#if data.flags.length}
				<input type="hidden" name="has" value={flagsParam(data.flags)} />
			{/if}
		</form>

		<div class="chips">
			<a class="chip" class:on={!data.group} href={withParam('group', '')}>
				{@html allGroupsIcon}
				All
			</a>
			{#each data.groups as g (g.value)}
				<a
					class="chip"
					class:on={data.group === g.value}
					href={withParam('group', data.group === g.value ? '' : g.value)}
				>
					{@html groupIcon(g.value)}
					{g.value.replace(/_/g, ' ')} <span class="n">{g.count}</span>
				</a>
			{/each}
		</div>

		<!-- A second row, and deliberately not more chips in the first one. Above,
		     picking a category replaces the last: an item has exactly one. These
		     are properties an item either has or has not, so any number can be on
		     and each one narrows. The tick box is what says so before you click —
		     two controls that behave differently must not look the same. -->
		<div class="chips flags">
			{#each ITEM_FLAGS as flag (flag)}
				{@const on = data.flags.includes(flag)}
				<a
					class="chip check"
					class:on
					href={flagHref(flag)}
					title={ITEM_FLAG_HINT[flag]}
					aria-label="{ITEM_FLAG_LABEL[flag]} — {ITEM_FLAG_HINT[flag]} — {on
						? 'on, activate to remove'
						: 'off, activate to apply'}"
				>
					<span class="box" aria-hidden="true">{on ? '✓' : ''}</span>
					{ITEM_FLAG_LABEL[flag]}
					<span class="n">{data.flagCounts[flag]}</span>
				</a>
			{/each}
		</div>

		<div class="right">
			<Pager page={data.page} pages={data.pages} total={data.total} label="items" />
		</div>
	</div>

	<div class="rows">
		<table class="data" style="min-width: 640px">
			<thead>
				<tr>
					<th class="num">#</th>
					{#each columns as col (col.key)}
						<th class:num={col.num}>
							<a href={sortHref(col.key)} data-sveltekit-noscroll>
								{col.label}
								<span class="dir">
									{data.sort === col.key ? (data.dir === 'asc' ? '↑' : '↓') : ''}
								</span>
							</a>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each data.rows as r, i (r.id)}
					<tr>
						<td class="num rownum">{data.start + i + 1}</td>
						<td class="namecell">
							<a class="itemcell" href="/entities/{r.slug}">
								{#if r.icon}
									<img class="icon" src={r.icon} alt="" loading="lazy" />
								{:else}
									<span class="icon placeholder" aria-hidden="true"></span>
								{/if}
								<span class="names">
									<span class="iname">{itemName(r, lang)}</span>
									<span class="kind">{r.kind.replace(/_/g, ' ')}</span>
								</span>
							</a>
						</td>
						<td><span class="rank" style="--rank: var(--rank-{rankSlug(r.rank)})">{rankSlug(r.rank)}</span></td>
						<td class="num">{fmt(r.weight, 'weight')}</td>
						<td class="num">{fmt(r.price, 'base_price')}</td>
						<td class="num">{fmt(r.durability, 'max_durability')}</td>
					</tr>
				{/each}
			</tbody>
		</table>

		{#if !data.rows.length}
			<p class="empty">Nothing matches those filters.</p>
		{/if}
	</div>
</div>

<style>
	form {
		display: contents;
	}

	input[type='search'] {
		min-width: 16rem;
		padding: var(--space-2) var(--space-3);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		background: var(--surface);
		font-size: var(--text-sm);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-2);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		font-size: var(--text-xs);
		text-transform: capitalize;
		text-decoration: none;
		color: var(--text-dim);
		white-space: nowrap;
	}

	/* :global because the glyph arrives through {@html} and carries no scope
	   attribute. Sized in em so it tracks the chip's text rather than a fixed
	   pixel box, and dimmed a step so the label stays the thing being read. */
	.chip :global(svg) {
		width: 1.15em;
		height: 1.15em;
		flex: none;
		opacity: 0.75;
	}

	.chip:hover :global(svg),
	.chip.on :global(svg) {
		opacity: 1;
	}

	.chip:hover {
		border-color: var(--border-strong);
		color: var(--text);
	}

	.chip.on {
		border-color: var(--accent);
		color: var(--accent);
	}

	.chip .n {
		font-family: var(--font-mono);
		color: var(--text-faint);
	}

	/* the checkables sit under the categories rather than beside them, so the
	   row break itself says these are a different question */
	.flags {
		flex-basis: 100%;
	}

	/* written labels, not slugs — `capitalize` would give "Has Attachments" */
	.chip.check {
		text-transform: none;
	}

	/* The tick box does the work the category icon does above: it is what you
	   read before the label to know this control is a checkbox and not another
	   category. Empty when off — an unticked box is the whole point, and a
	   placeholder glyph would read as a state of its own. */
	.box {
		display: grid;
		place-items: center;
		width: 1.1em;
		height: 1.1em;
		flex: none;
		border: var(--border-width) solid var(--border-strong);
		border-radius: 2px;
		font-size: 0.85em;
		line-height: 1;
	}

	.chip.check:hover .box {
		border-color: var(--accent);
	}

	.chip.check.on .box {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-contrast);
	}

	th a {
		text-decoration: none;
		color: inherit;
		white-space: nowrap;
	}

	.dir {
		color: var(--accent);
	}

	.rownum {
		color: var(--text-faint);
		font-family: var(--font-mono);
		width: 1%;
	}

	/* The picture fills the row, UAR's board-table trick: a percentage height on
	   a child resolves against the *cell*, and the cell is the row — whereas
	   `height: 100%` on a normally-flowed image answers with its own intrinsic
	   height and stops short. So the cell is the containing block and the image
	   is taken out of flow, with the text inset past it. */
	.namecell {
		position: relative;
		padding-left: calc(var(--fig) + var(--space-3) * 2);
		--fig: 34px;
	}

	.itemcell {
		display: flex;
		align-items: center;
		text-decoration: none;
	}

	.icon {
		position: absolute;
		left: var(--space-3);
		top: 0;
		height: 100%;
		width: var(--fig);
		/* contain, never cover: an item icon cropped to fill is unrecognisable,
		   and these are drawings with their own margins already */
		object-fit: contain;
		image-rendering: pixelated;
	}

	.placeholder {
		border: var(--border-width) dashed var(--border);
		border-radius: var(--radius-1);
		height: 60%;
		top: 20%;
	}

	.names {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.iname {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.kind {
		font-size: var(--text-xs);
		color: var(--text-faint);
		text-transform: capitalize;
	}

	.rank {
		color: var(--rank);
		font-size: var(--text-xs);
		text-transform: capitalize;
	}

	.empty {
		padding: var(--space-5);
		color: var(--text-dim);
	}
</style>
