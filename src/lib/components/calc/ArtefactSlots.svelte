<script lang="ts">
	/**
	 * The artefacts in the container.
	 *
	 * Each one carries three numbers of its own — quality, rarity and upgrade
	 * level — and all three change what it contributes, so the slot has to edit
	 * them in place rather than just name an item. Quality above 100 implies a
	 * rarity, so choosing one sets the other unless the player overrides it.
	 */
	import ItemPicker from './ItemPicker.svelte';
	import { formatValue, statLabel } from '$lib/calc/format';
	import { statIcon, statTint } from '$lib/stat-icons';
	import {
		rarityForQuality,
		resolveArtefact,
		QUALITY_MAX,
		MAX_LEVEL,
		type ArtefactSlot,
		type Rarity
	} from '$lib/calc/artefact';
	import type { CalcArtefact, CalcStatMeta } from '$lib/calc/types';

	interface Props {
		artefacts: CalcArtefact[];
		meta: Record<string, CalcStatMeta>;
		slots: ArtefactSlot[];
		/** how many the chosen container holds; 0 when none is chosen */
		capacity: number;
		effectiveness: number;
		onchange: (slots: ArtefactSlot[]) => void;
		lang?: string;
	}

	let { artefacts, meta, slots, capacity, effectiveness, onchange, lang = 'en' }: Props = $props();

	const RARITIES: Rarity[] = [
		'ordinary',
		'unordinary',
		'special',
		'rare',
		'exclusive',
		'legendary',
		'unique'
	];

	const byId = $derived(new Map(artefacts.map((a) => [a.id, a])));

	const options = $derived(
		[...artefacts]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((a) => ({ id: a.id, name: a.name, icon: a.icon, rank: a.rank, note: a.kind }))
	);

	function update(i: number, patch: Partial<ArtefactSlot>) {
		onchange(slots.map((s, n) => (n === i ? { ...s, ...patch } : s)));
	}

	/** Quality picks the rarity, unless the player has already stated one that
	 *  still fits the number. */
	function setQuality(i: number, quality: number) {
		const derived = rarityForQuality(quality);
		update(i, { quality, rarity: derived });
	}

	function remove(i: number) {
		onchange(slots.filter((_, n) => n !== i));
	}

	function add() {
		onchange([...slots, { id: '', quality: 100, rarity: 'ordinary', level: 0 }]);
	}

	/** What this artefact contributes right now, for the slot's own summary. */
	function effects(slot: ArtefactSlot) {
		const a = slot.id ? byId.get(slot.id) : undefined;
		if (!a) return [];
		return resolveArtefact(a, slot, effectiveness)
			.filter((r) => r.value !== 0)
			.slice(0, 6);
	}
</script>

<div class="slots">
	{#each slots as slot, i (i)}
		{@const rows = effects(slot)}
		<article class="slot" class:over={capacity > 0 && i >= capacity}>
			<div class="head">
				<ItemPicker
					label="Artefact {i + 1}"
					{options}
					value={slot.id || null}
					onchange={(id) => update(i, { id: id ?? '' })}
					empty="No artefacts loaded"
				/>
				<button type="button" class="remove" onclick={() => remove(i)} aria-label="Remove artefact">
					×
				</button>
			</div>

			{#if slot.id}
				<div class="controls">
					<label>
						<span>Quality</span>
						<input
							type="number"
							min="0"
							max={QUALITY_MAX}
							step="0.5"
							value={slot.quality}
							oninput={(e) => setQuality(i, Number(e.currentTarget.value))}
						/>
					</label>

					<label>
						<span>Rarity</span>
						<select
							value={slot.rarity}
							onchange={(e) => update(i, { rarity: e.currentTarget.value as Rarity })}
						>
							{#each RARITIES as r (r)}
								<option value={r}>{r}</option>
							{/each}
						</select>
					</label>

					<label>
						<span>Level</span>
						<input
							type="number"
							min="0"
							max={MAX_LEVEL}
							value={slot.level}
							oninput={(e) => update(i, { level: Number(e.currentTarget.value) })}
						/>
					</label>
				</div>

				{#if rows.length}
					<ul class="effects">
						{#each rows as row (row.slug)}
							<li>
								<span class="what" style="--stat-tint: {statTint(row.slug)}"
									>{@html statIcon(row.slug)}<span>{statLabel(row.slug, meta[row.slug])}</span></span
								>
								<span class="mono" class:good={row.benefit} class:bad={!row.benefit}>
									{formatValue(row.value, meta[row.slug], lang, { sign: true })}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}

			{#if capacity > 0 && i >= capacity}
				<p class="warn">Beyond what this container holds ({capacity})</p>
			{/if}
		</article>
	{/each}

	<!-- no count on the label: the totals panel already states how many slots are
	     filled, and a second counter here disagreed with it whenever a row was
	     open but empty -->
	<button type="button" class="add" onclick={add} disabled={capacity > 0 && slots.length >= capacity}>
		{#if capacity > 0 && slots.length >= capacity}
			Container full — {capacity} slot{capacity === 1 ? '' : 's'}
		{:else}
			Add artefact
		{/if}
	</button>
</div>

<style>
	.slots {
		display: grid;
		gap: var(--space-3);
	}

	.slot {
		padding: var(--space-3);
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-2);
		background: var(--surface);
	}

	.slot.over {
		border-color: var(--warn);
	}

	.head {
		display: flex;
		align-items: end;
		gap: var(--space-2);
	}

	.head :global(.picker) {
		flex: 1;
		min-width: 0;
	}

	.remove {
		flex: none;
		width: 2rem;
		height: 2rem;
		border: var(--border-width) solid var(--border);
		border-radius: var(--radius-1);
		background: none;
		color: var(--text-faint);
		font-size: var(--text-lg);
		line-height: 1;
		cursor: pointer;
	}

	.remove:hover {
		color: var(--danger);
		border-color: var(--danger);
	}

	.controls {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr));
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.controls label {
		display: grid;
		gap: 2px;
	}

	.controls span {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-faint);
	}

	.effects {
		list-style: none;
		margin: var(--space-2) 0 0;
		padding: var(--space-2) 0 0;
		border-top: var(--border-width) solid var(--border);
		display: grid;
		gap: 1px;
		font-size: var(--text-xs);
	}

	.effects li {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		color: var(--text-dim);
	}

	/* An artefact's own effects, in a 290px column beside four more slots: the
	   marks are how you tell one slot's radiation from the next one's frost
	   without reading either. */
	.what {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}

	.what :global(svg) {
		width: 14px;
		height: 14px;
		flex: none;
		color: var(--stat-tint, var(--text-faint));
	}

	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.good {
		color: var(--ok);
	}

	.bad {
		color: var(--danger);
	}

	.warn {
		margin: var(--space-2) 0 0;
		font-size: var(--text-xs);
		color: var(--warn);
	}

	.add {
		padding: var(--space-2);
		border: var(--border-width) dashed var(--border-strong);
		border-radius: var(--radius-2);
		background: none;
		color: var(--text-dim);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.add:disabled {
		cursor: not-allowed;
		color: var(--text-faint);
	}

	.add:not(:disabled):hover {
		background: var(--surface);
		color: var(--text);
	}
</style>
