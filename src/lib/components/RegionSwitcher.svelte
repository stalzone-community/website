<script lang="ts">
	/**
	 * Which region's market the auction pages price against, as a top-bar chip.
	 *
	 * WHY THERE ARE NO FLAGS
	 *
	 * Two of the four regions have a flag and two do not. RU and EU are real
	 * flags; NA is a continent, where any national flag picks one of three
	 * countries and drops the others; SEA has no emblem at all. A row mixing two
	 * national flags with two invented glyphs looks broken and makes a claim
	 * about places that a database of guns has no reason to make. The codes are
	 * what players already say out loud, so the text is the icon, and one neutral
	 * globe says what kind of control this is.
	 *
	 * A HAND-BUILT LISTBOX, AND WHAT THAT COSTS
	 *
	 * A native <select> cannot be styled open, so a menu that matches the chips
	 * has to be built. What the platform was giving away for free, and is
	 * therefore implemented below, is the whole of it: roving highlight on the
	 * arrows, Home/End, Enter and Space to commit, Escape to abandon, click and
	 * focus outside to dismiss, focus returned to the chip on close, and the
	 * aria-activedescendant wiring a screen reader needs to announce the
	 * highlighted option without the focus ever leaving the list.
	 *
	 * Kept in this repo rather than sveltekit-commons for now: it is the first of
	 * its kind and its shape is one site old. Nothing here is STALZONE-specific
	 * except the region list, so it can move as a generic ChipSelect the moment a
	 * second site wants one — which is when its API would be tested by two
	 * callers instead of guessed at from one.
	 */
	import { invalidateAll } from '$app/navigation';
	import { readStoredRegion, region, setRegion } from '$lib/region.svelte';
	import { REGIONS, regionName, type RegionId } from '$lib/regions';

	interface Props {
		/** drop the code and show the globe alone, as the search chip does */
		compact?: boolean;
	}
	let { compact = false }: Props = $props();

	/* The shell is prerendered, so the served HTML always has the default
	   selected; the visitor's actual cookie is only readable here. */
	$effect(() => {
		readStoredRegion();
	});

	let open = $state(false);
	let busy = $state(false);
	/** highlighted row while the list is open — not the choice until committed */
	let active = $state(0);

	let chip = $state<HTMLButtonElement | null>(null);
	let list = $state<HTMLUListElement | null>(null);

	const IDS = REGIONS.map((r) => r.id);
	const optionId = (i: number) => `region-opt-${IDS[i]}`;

	function show() {
		// open on the current choice, so the first arrow press moves from where
		// the visitor already is rather than from the top of the list
		active = Math.max(0, IDS.indexOf(region()));
		open = true;
	}

	function hide(returnFocus = true) {
		open = false;
		if (returnFocus) chip?.focus();
	}

	async function commit(next: RegionId) {
		hide();
		if (!setRegion(next)) return;
		// The prices come from the server, so a new region means a new fetch.
		// Without this the chip would change and the numbers would not.
		busy = true;
		try {
			await invalidateAll();
		} finally {
			busy = false;
		}
	}

	/* Focus the list itself, not an option: the highlight is carried by
	   aria-activedescendant, which lets one focus stop own the whole list and
	   keeps Escape and Tab behaving like a menu rather than like four buttons. */
	$effect(() => {
		if (open) list?.focus();
	});

	/* Dismiss on anything that means "I am done here" — a click elsewhere, or
	   focus leaving the component entirely (Tab out, or another control taking
	   it). Both are registered only while open. */
	$effect(() => {
		if (!open) return;
		const outside = (e: Event) => {
			const target = e.target as Node | null;
			if (target && !chip?.parentElement?.contains(target)) hide(false);
		};
		document.addEventListener('pointerdown', outside, true);
		document.addEventListener('focusin', outside, true);
		return () => {
			document.removeEventListener('pointerdown', outside, true);
			document.removeEventListener('focusin', outside, true);
		};
	});

	function onChipKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			show();
		}
	}

	function onListKey(e: KeyboardEvent) {
		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				active = (active + 1) % IDS.length;
				break;
			case 'ArrowUp':
				e.preventDefault();
				active = (active - 1 + IDS.length) % IDS.length;
				break;
			case 'Home':
				e.preventDefault();
				active = 0;
				break;
			case 'End':
				e.preventDefault();
				active = IDS.length - 1;
				break;
			case 'Enter':
			case ' ':
				e.preventDefault();
				void commit(IDS[active]);
				break;
			case 'Escape':
				e.preventDefault();
				// abandons without committing — the point of a separate highlight
				hide();
				break;
			case 'Tab':
				hide(false);
				break;
		}
	}
</script>

<div class="region">
	<button
		bind:this={chip}
		type="button"
		class="chip"
		class:compact
		class:busy
		disabled={busy}
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label="Auction region — {regionName(region())}"
		title="Auction region — {regionName(region())}"
		onclick={() => (open ? hide() : show())}
		onkeydown={onChipKey}
	>
		<span class="glyph" aria-hidden="true">
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.8"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<circle cx="12" cy="12" r="9" />
				<ellipse cx="12" cy="12" rx="4" ry="9" />
				<line x1="3.2" y1="9" x2="20.8" y2="9" />
				<line x1="3.2" y1="15" x2="20.8" y2="15" />
			</svg>
		</span>
		{#if !compact}<span class="label">{region()}</span>{/if}
	</button>

	{#if open}
		<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
		<ul
			bind:this={list}
			class="menu"
			role="listbox"
			tabindex="-1"
			aria-label="Auction region"
			aria-activedescendant={optionId(active)}
			onkeydown={onListKey}
		>
			{#each REGIONS as r, i (r.id)}
				<!-- No key handler here on purpose, and the rule is wrong about this
				     case: in an aria-activedescendant listbox the LIST owns the focus
				     and every key, and the options are never focusable. Giving each row
				     its own handler would mean four more tab stops and two places for
				     Enter to disagree about which row it takes. -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					id={optionId(i)}
					role="option"
					aria-selected={r.id === region()}
					class:active={i === active}
					class:chosen={r.id === region()}
					onclick={() => commit(r.id)}
					onmouseenter={() => (active = i)}
				>
					<span class="code">{r.id}</span>
					<span class="name">{r.name}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.region {
		position: relative;
		display: flex;
	}

	/* 30px and a 99px radius: the shape every other chip in this bar takes, so
	   the row reads as one set of controls rather than three sizes of them. */
	.chip {
		display: flex;
		align-items: center;
		gap: 7px;
		height: 30px;
		padding: 0 8px 0 9px;
		color: var(--text-dim);
		background: var(--surface);
		border: var(--border-width) solid var(--border-strong);
		border-radius: 99px;
		cursor: pointer;
		transition:
			border-color 120ms ease,
			color 120ms ease,
			background 120ms ease;
	}

	.chip:hover,
	.chip[aria-expanded='true'] {
		color: var(--accent);
		border-color: var(--accent);
	}

	.chip.busy {
		opacity: 0.6;
		cursor: progress;
	}

	.chip.compact {
		width: 30px;
		padding: 0;
		justify-content: center;
	}

	.glyph {
		display: flex;
		flex: none;
	}
	.glyph svg {
		width: 15px;
		height: 15px;
	}

	.label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 500;
		line-height: 1;
		letter-spacing: 0.03em;
	}

	/* Right-aligned: the chip sits near the end of the bar, so a left-aligned
	   panel would hang off the edge on a narrow window. */
	.menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 40;
		min-width: 168px;
		padding: 4px;
		margin: 0;
		list-style: none;
		background: var(--surface-raised, var(--surface));
		border: var(--border-width) solid var(--border-strong);
		border-radius: var(--radius-2, 8px);
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.28);
	}

	.menu:focus {
		outline: none;
	}

	li {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 6px 8px;
		font-size: var(--text-xs);
		color: var(--text-dim);
		cursor: pointer;
		border-radius: var(--radius-1, 4px);
	}

	/* One highlight, driven by keyboard and hover alike, so the two cannot
	   disagree about which row Enter would take. */
	li.active {
		color: var(--text);
		background: var(--surface);
	}

	li.chosen .code {
		color: var(--accent);
	}

	.code {
		font-family: var(--font-mono);
		font-weight: 500;
		letter-spacing: 0.03em;
		min-width: 2.4em;
	}

	.name {
		color: var(--text-faint);
	}

	li.active .name {
		color: var(--text-dim);
	}
</style>
