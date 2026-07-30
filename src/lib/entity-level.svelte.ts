/**
 * The selected upgrade level for the entity currently on screen.
 *
 * It is context rather than component state because it moves numbers in two
 * places that are no longer the same component: the stats table and effect
 * bands on the overview tab, and the weight/durability/price facts in the
 * infobox, which the sublayout keeps on screen for every tab. The sublayout
 * owns the value and the slider; the tabs only read it.
 *
 * Scoped to the sublayout, so nothing outside `/entities/[slug]` can reach it
 * and there is no module-level state to reset between pages — see
 * `+layout.svelte` for the one reset that is needed, when the slug changes
 * under a layout the router reuses.
 */
import { getContext, setContext } from 'svelte';

const KEY = Symbol('entity-upgrade-level');

export class UpgradeLevel {
	value = $state(0);
}

/** Called once, by the entity sublayout. */
export function provideUpgradeLevel(): UpgradeLevel {
	return setContext(KEY, new UpgradeLevel());
}

export function upgradeLevel(): UpgradeLevel {
	return getContext<UpgradeLevel>(KEY);
}
