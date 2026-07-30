<script lang="ts">
	/**
	 * The faction emblems an item carries — nothing when it is sold at every
	 * base, which is most gear.
	 *
	 * The emblem is a CSS mask rather than an <img>: EXBO ships it monochrome,
	 * so masking lets it take the faction colour, invert cleanly on the light
	 * skin, and fade with the tree's filter. An <img> would need four recoloured
	 * copies per theme and would ignore the dimming.
	 */
	import { availabilityOf, FACTIONS } from '$lib/factions';
	import type { Lang, Localized } from '$lib/types';

	interface Props {
		/** the settlements that hand this item over */
		settlements: string[];
		/** localised settlement names, for the title and the screen reader */
		labels: Record<string, Localized>;
		size?: number;
		lang?: Lang;
	}

	let { settlements, labels, size = 15, lang = 'en' }: Props = $props();

	const homes = $derived(availabilityOf(settlements).homes);
	const label = (key: string) => labels[key]?.[lang] ?? labels[key]?.en ?? key;
</script>

{#each homes as key (key)}
	<span
		class="mark"
		style="--faction: var(--faction-{FACTIONS[key].id}); --emblem: url({FACTIONS[key].emblem});
		       width:{size}px; height:{size}px"
		title={label(key)}
	>
		<span class="visually-hidden">{label(key)}</span>
	</span>
{/each}

<style>
	.mark {
		flex: none;
		display: inline-block;
		background: var(--faction);
		-webkit-mask: var(--emblem) center / contain no-repeat;
		mask: var(--emblem) center / contain no-repeat;
	}
</style>
