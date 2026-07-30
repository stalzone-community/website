<script lang="ts">
	/**
	 * Site-wide search. The panel, the cursor and the keys are commons'
	 * `SearchDialog`; what this adds is where the rows come from.
	 *
	 * It searches destinations as well as items. Typing "weap" should offer the
	 * Weapons category above the 338 individual weapons, because the category is
	 * one keystroke from all of them — so sections come first, as their own
	 * group, and the items follow under a seam.
	 *
	 * The index is fetched on first open, not at boot: it is per-language,
	 * 162–246 KB, and most visits never search. `loadIndex` holds one in-flight
	 * promise per language, so a fast typist does not start several.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SearchDialog } from 'sveltekit-commons';
	import { rankRows, type PaletteRow, type RowGroup } from 'sveltekit-commons/palette';

	import { tabSegment } from '$lib/entities';
	import { itemRows, sectionRows, type Section } from '$lib/palette';
	import { loadIndex, rank, type SearchEntry } from '$lib/search';
	import { lang as displayLang } from '$lib/lang.svelte';

	interface Props {
		/** categories and standing pages, supplied by the layout */
		sections: Section[];
	}

	let { sections }: Props = $props();

	const lang = $derived(displayLang());

	let dialog = $state<ReturnType<typeof SearchDialog> | null>(null);
	let q = $state('');
	let entries = $state<SearchEntry[]>([]);
	/** Up until the index has landed, the items half genuinely has nothing yet. */
	let loading = $state(false);

	/* Switching language mid-session means the loaded index is the wrong one.
	   Reading `lang` here is what subscribes this to that change. */
	$effect(() => {
		lang;
		entries = [];
		if (q) void ensureIndex();
	});

	async function ensureIndex() {
		const wanted = lang;
		loading = true;
		try {
			const loaded = await loadIndex(wanted);
			// a language switch while this was in flight makes it the wrong index
			if (wanted === lang) entries = loaded;
		} catch {
			// transient — the destinations half of the palette still answers
		} finally {
			if (wanted === lang) loading = false;
		}
	}

	const rows = $derived<PaletteRow[]>(sectionRows(sections));

	/* Searching from an entity tab stays on that tab — see `itemRows`. Null
	   anywhere else on the site, and that reads as "no tab to keep". */
	const tab = $derived(tabSegment(page.route.id) ?? '');

	/** With nothing typed, the palette offers the destinations. */
	const groups = $derived<RowGroup[]>(
		q.trim()
			? [
					{ rows: rankRows(rows, q, 4) },
					{
						label: 'Items',
						rows: itemRows(rank(entries, q, 8), tab),
						busy: loading,
						pending: 'Loading the item index…'
					}
				]
			: [{ rows: rows.slice(0, 6) }]
	);

	export function open() {
		dialog?.open();
	}
</script>

<SearchDialog
	bind:this={dialog}
	bind:query={q}
	{groups}
	pixelated
	placeholder="Search items and categories…"
	onopen={ensureIndex}
	onselect={(row) => goto(row.href)}
/>
