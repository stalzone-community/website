/**
 * One stroke icon per top-level item category, in the same Feather-style
 * language as $lib/nav-icons — same viewBox, same weight, same `currentColor`,
 * so a chip's icon inherits the chip's colour and its active state for free.
 *
 * Written rather than sourced: the vendored EXBO database ships per-item art
 * only (`icons/<group>/<id>.png`) and nothing at the group level, and a
 * representative item's photo does not survive being shrunk to text height.
 *
 * The keys are the 14 `group` values build-items.ts emits. `groupIcon()` falls
 * back to the catch-all glyph, so a new upstream category renders as a chip
 * with a neutral mark instead of a hole in the row.
 */

const icon = (paths: string): string =>
	`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ` +
	`stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/* a receiver with a barrel, magazine and grip — read as a gun at 14px, which a
   more faithful outline with a stock and trigger guard does not */
const weapon = icon(
	'<path d="M5 9h10v1h6v1h-6v2H7a2 2 0 0 1-2-2z"/><path d="M9.5 13v3.5h2.5V13"/>' +
		'<path d="M13.5 13l-1 3.5"/><path d="M18 10V8.4"/>'
);

/* a plated shield. A head-on vest was the first attempt and it reads as a book
   at chip size — the shoulders and the centre seam are indistinguishable from
   a spine and two pages once the glyph is 14px tall. The band is what keeps
   this from being the generic "security" shield. */
const armor = icon(
	'<path d="M12 2.5 20 5.5v6.2c0 4.6-3.2 8-8 9.8-4.8-1.8-8-5.2-8-9.8V5.5z"/><path d="M4.6 11.2h14.8"/>'
);

/* a cut gem — the anomalous thing you carry, not the anomaly itself */
const artefact = icon('<path d="M12 2.5 18.5 9 12 21.5 5.5 9z"/><path d="M5.5 9h13"/>');

/* an optic on a rail: the group is barrels, sights, mags and grips, and the
   sight is the one of those a player pictures when they read "attachment" */
const attachment = icon(
	'<path d="M5 9h12a2 2 0 0 1 0 4H5a2 2 0 0 1 0-4z"/><path d="M11 9V6.5h2V9"/>' +
		'<path d="M8 13v2.5"/><path d="M15 13v2.5"/><path d="M5.5 15.5h13"/>'
);

/* a cartridge stood on its rim — ogive, neck, case */
const bullet = icon(
	'<path d="M12 2.5c1.9 1.9 2.9 4 2.9 6.2V19a1.5 1.5 0 0 1-1.5 1.5h-2.8A1.5 1.5 0 0 1 9.1 19V8.7c0-2.2 1-4.3 2.9-6.2z"/>' +
		'<path d="M9.1 9h5.8"/><path d="M9.1 16.5h5.8"/>'
);

const backpacks = icon(
	'<path d="M6 8h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z"/>' +
		'<path d="M9 8V6a3 3 0 0 1 6 0v2"/><path d="M8 15h8v6"/>'
);

/* a crate with a lid line and a latch — storage, distinct from the backpack
   you wear and the tin you eat */
const containers = icon(
	'<path d="M3.5 7.5h17v11a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/>' +
		'<path d="M3.5 11.5h17"/><path d="M10.5 11.5h3v2.5h-3z"/>'
);

/* a handheld with a screen and a stub antenna */
const device = icon(
	'<path d="M6 3.5h12a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5z"/>' +
		'<path d="M7.5 6.5h9v7h-9z"/><path d="M16.5 3.5V1.5"/><path d="M12 16.5v1.5"/>'
);

/* body, fragmentation band, fuze, spoon, pull ring. The band and the spoon are
   both load-bearing: a plain circle under a small ring is the Mars symbol. */
const grenade = icon(
	'<circle cx="12" cy="14.6" r="6"/><path d="M6.1 15.4h11.8"/>' +
		'<path d="M9.7 9.2V7.3h4.6v1.9"/><path d="M14.3 7.3h2.6v4.4"/><circle cx="18.6" cy="5.2" r="1.6"/>'
);

/* a first-aid case rather than a bare cross: the cross alone is the universal
   "help" mark and would read as a link to support */
const medicine = icon(
	'<path d="M4.5 7h15a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-9A1.5 1.5 0 0 1 4.5 7z"/>' +
		'<path d="M9.5 7V5.5h5V7"/><path d="M12 10.5v4"/><path d="M10 12.5h4"/>'
);

/* a nut — the group is parts and materials, and a box would just repeat the
   containers glyph. Flat-topped, which is how a nut is drawn; point-topped it
   is a gear, and a gear on a filter row promises settings. */
const misc = icon('<path d="M20 12 16 18.9H8L4 12 8 5.1h8z"/><circle cx="12" cy="12" r="3.3"/>');

/* a tin: food, drink and field medicine, all of which come in one */
const supply = icon(
	'<ellipse cx="12" cy="6.5" rx="5.5" ry="2.2"/>' +
		'<path d="M6.5 6.5v11c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2v-11"/><path d="M6.5 11h11"/>'
);

/* a chip with pins and a core — the modules are literally slotted in */
const weaponModules = icon(
	'<path d="M8 7h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/>' +
		'<path d="M10.5 10.5h3v3h-3z"/><path d="M10 7V4.5"/><path d="M14 7V4.5"/>' +
		'<path d="M10 17v2.5"/><path d="M14 17v2.5"/><path d="M7 10H4.5"/><path d="M7 14H4.5"/>' +
		'<path d="M17 10h2.5"/><path d="M17 14h2.5"/>'
);

/* the catch-all, and it is the largest category — an ellipsis says "everything
   else" without pretending the 785 items in it have a shape in common. Filled,
   because 1.4px rings vanish at chip size. */
const other = icon(
	'<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/>' +
		'<circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>' +
		'<circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>'
);

/** The unfiltered chip: four quadrants, i.e. all of the above at once. */
export const allGroupsIcon = icon(
	'<path d="M4 4h6v6H4z"/><path d="M14 4h6v6h-6z"/><path d="M4 14h6v6H4z"/><path d="M14 14h6v6h-6z"/>'
);

const GROUP_ICONS: Record<string, string> = {
	weapon,
	armor,
	artefact,
	attachment,
	bullet,
	backpacks,
	containers,
	device,
	grenade,
	medicine,
	misc,
	supply,
	weapon_modules: weaponModules,
	other
};

/** Inert markup for a group's glyph — render with `{@html}`. */
export function groupIcon(group: string): string {
	return GROUP_ICONS[group] ?? other;
}

/** Whether a group has a glyph of its own, for tests and for the icon gallery. */
export function hasGroupIcon(group: string): boolean {
	return group in GROUP_ICONS;
}

/** Every group this module draws, for tests and for the icon gallery. */
export const GROUP_KEYS: string[] = Object.keys(GROUP_ICONS);

/**
 * A group's colour, as a CSS value — the companion to `groupIcon`.
 *
 * The hues themselves live in palette.css (`--group-*`, one per key above), not
 * here: this file is layer 2 of the same split sveltekit-commons draws between
 * contract and skin, and a hex in a .ts module would be a colour the theme
 * toggle cannot reach. Returning `var(...)` with `--group-other` as the fallback
 * means an upstream category nobody has coloured yet renders neutral rather than
 * inheriting whatever colour it happens to sit inside.
 */
export function groupTint(group: string): string {
	return `var(--group-${group}, var(--group-other))`;
}
