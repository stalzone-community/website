<script lang="ts">
	/**
	 * The weapon half of a build: one gun, its upgrade level, and one attachment
	 * per slot it accepts.
	 *
	 * Slots are derived from the weapon rather than fixed, because they are: a
	 * pistol has no forend and 71 of the 338 weapons take nothing at all.
	 * Choosing a different weapon keeps the attachments it still accepts and
	 * drops the rest, which is what a player expects when comparing two rifles
	 * with the same optic.
	 */
	import DamageChart from '$lib/components/DamageChart.svelte';
	import ItemPicker from './ItemPicker.svelte';
	import { formatValue, statLabel } from '$lib/calc/format';
	import { statIcon, statTint } from '$lib/stat-icons';
	import { resolveWeapon, slotsFor, type WeaponState } from '$lib/calc/weapon';
	import type { CalcAttachment, CalcStatMeta, CalcWeapon } from '$lib/calc/types';

	interface Props {
		weapons: CalcWeapon[];
		attachments: CalcAttachment[];
		meta: Record<string, CalcStatMeta>;
		state: WeaponState | null;
		onchange: (next: WeaponState | null) => void;
		lang?: string;
	}

	let { weapons, attachments, meta, state, onchange, lang = 'en' }: Props = $props();

	const SLOT_LABEL: Record<string, string> = {
		barrel: 'Muzzle',
		mag: 'Magazine',
		collimator_sights: 'Sight',
		forend: 'Handguard',
		handgrips: 'Grip',
		pistol_handle: 'Pistol grip',
		accessory: 'Accessory',
		other: 'Other'
	};

	const byId = $derived(new Map(attachments.map((a) => [a.id, a])));
	const weaponById = $derived(new Map(weapons.map((w) => [w.id, w])));

	const options = $derived(
		[...weapons]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((w) => ({
				id: w.id,
				name: w.name,
				icon: w.icon,
				rank: w.rank,
				note: w.kind.replace(/_/g, ' ')
			}))
	);

	const weapon = $derived(state?.id ? (weaponById.get(state.id) ?? null) : null);
	const slots = $derived(weapon ? slotsFor(weapon, byId) : new Map<string, CalcAttachment[]>());
	const result = $derived(weapon && state ? resolveWeapon(weapon, state, byId) : null);

	/** Which attachment sits in a slot right now. */
	function inSlot(slot: string): string | null {
		if (!state) return null;
		return state.attachments.find((id) => byId.get(id)?.slot === slot) ?? null;
	}

	function setWeapon(id: string | null) {
		if (!id) return onchange(null);
		const next = weaponById.get(id);
		if (!next) return onchange(null);
		// keep what the new weapon can still take
		const fits = new Set(next.fits);
		onchange({
			id,
			level: state?.level ?? 0,
			attachments: (state?.attachments ?? []).filter((a) => fits.has(a))
		});
	}

	function setAttachment(slot: string, id: string | null) {
		if (!state) return;
		const others = state.attachments.filter((a) => byId.get(a)?.slot !== slot);
		onchange({ ...state, attachments: id ? [...others, id] : others });
	}
</script>

<div class="weapon">
	<div class="choose">
		<ItemPicker
			label="Weapon"
			{options}
			value={state?.id ?? null}
			onchange={setWeapon}
			empty="No weapons loaded"
		/>

		{#if weapon && state}
			<label class="level">
				<span>Upgrade level</span>
				<span class="level-row">
					<input
						type="range"
						min="0"
						max="15"
						value={state.level}
						oninput={(e) => onchange({ ...state, level: Number(e.currentTarget.value) })}
					/>
					<output class="mono">{state.level}</output>
				</span>
			</label>
		{/if}
	</div>

	{#if weapon && state}
		{#if slots.size}
			<div class="slots">
				{#each [...slots] as [slot, list] (slot)}
					<ItemPicker
						label={SLOT_LABEL[slot] ?? slot}
						options={list.map((a) => ({
							id: a.id,
							name: a.name,
							icon: a.icon,
							rank: a.rank,
							note: Object.keys(a.stats).length ? undefined : 'cosmetic'
						}))}
						value={inSlot(slot)}
						onchange={(id) => setAttachment(slot, id)}
					/>
				{/each}
			</div>
		{:else}
			<p class="note">This weapon takes no attachments.</p>
		{/if}
	{/if}

	{#if result && weapon && state}
		<div class="results">
			<h3>
				Stats
				<span class="weight mono">{formatValue(result.weight, undefined, lang)} kg</span>
			</h3>

			<ul class="stats">
				{#each result.stats as row (row.slug)}
					<li>
						<span class="name" style="--stat-tint: {statTint(row.slug)}"
							>{@html statIcon(row.slug)}<span>{statLabel(row.slug, meta[row.slug])}</span></span
						>
						{#if row.value !== row.base}
							<span class="was mono">{formatValue(row.base, meta[row.slug], lang)}</span>
							<span class="arrow" aria-hidden="true">→</span>
						{/if}
						<span class="value mono" class:changed={row.value !== row.base}>
							{formatValue(row.value, meta[row.slug], lang)}
						</span>
					</li>
				{/each}
			</ul>

			{#if result.unmapped.length}
				<h3>Also modified</h3>
				<p class="note">
					Attachment effects with no base stat in EXBO's data to apply them to — shown as stated.
				</p>
				<ul class="stats">
					{#each result.unmapped as row (row.slug)}
						<li>
							<span class="name" style="--stat-tint: {statTint(row.slug)}"
							>{@html statIcon(row.slug)}<span>{statLabel(row.slug, meta[row.slug])}</span></span
						>
							<span class="value mono">{formatValue(row.percent, meta[row.slug], lang, { sign: true })}</span>
						</li>
					{/each}
				</ul>
			{/if}

			{#if result.damage}
				<h3>Damage over distance</h3>
				<DamageChart
					damage={result.damage}
					base={state.level > 0 ? weapon.damage : null}
				/>
			{/if}

			{#if weapon.ammo}
				<p class="note">Ammunition: {weapon.ammo}</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.weapon {
		display: grid;
		gap: var(--space-4);
	}

	.choose {
		display: grid;
		gap: var(--space-3);
	}

	.slots {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
		gap: var(--space-3);
	}

	.level {
		display: grid;
		gap: var(--space-1);
	}

	.level > span:first-child {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.level-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.level-row input {
		flex: 1;
	}

	h3 {
		margin: 0 0 var(--space-2);
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
		font-weight: 500;
	}

	.results {
		display: grid;
		gap: var(--space-2);
	}

	.stats {
		list-style: none;
		margin: 0 0 var(--space-3);
		padding: 0;
	}

	.stats li {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		border-bottom: var(--border-width) solid var(--border);
		font-size: var(--text-sm);
	}

	.name {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-dim);
	}

	.name :global(svg) {
		width: 15px;
		height: 15px;
		flex: none;
		color: var(--stat-tint, var(--text-faint));
		opacity: 0.85;
	}

	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.was {
		color: var(--text-faint);
		text-decoration: line-through;
	}

	.arrow {
		color: var(--text-faint);
		font-size: var(--text-xs);
	}

	.changed {
		color: var(--accent);
	}

	.note {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-faint);
		max-width: 60ch;
	}
</style>
