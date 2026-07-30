/**
 * One stroke icon per crafting perk — the game's eight professions.
 *
 * Same Feather-style language as $lib/nav-icons and $lib/group-icons: same
 * viewBox, same weight, `currentColor`, so a badge's icon inherits the badge's
 * colour and its hover state for free.
 *
 * Written rather than sourced, for the same reason the group icons were: the
 * vendored EXBO database ships per-item art only and nothing for a perk.
 *
 * The keys are the eight `perks` ids the hideout recipes actually reference:
 *
 *   materials     101 recipes   Raw Materials
 *   engineering    98           Engineering
 *   cooking        48           Cooking
 *   ammunition     45           Ammo
 *   medicine       25           Medicine
 *   brewing        23           Home-Brewing
 *   pyrotechnics   19           Pyrotechnics
 *   armorer         9           Protective Gear
 *
 * `perkIcon()` falls back to a neutral mark, so a ninth profession added
 * upstream renders as a badge with a placeholder rather than a hole in the row
 * — and `tests/craft-icons.test.ts` fails on it, which is how we find out.
 */

const icon = (paths: string): string =>
	`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ` +
	`stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/* a stack of ingots. Not an ore lump: at badge size a single rough polygon is
   indistinguishable from the artefact glyph, where three stacked trapezoids
   read as "stock you have a pile of" even when they are 12px tall. */
const materials = icon(
	'<path d="M8.5 11h7l1.8 3H6.7z"/><path d="M3.5 16.5h7l1.8 3H1.7z"/>' +
		'<path d="M13.5 16.5h7l1.8 3h-8.8z"/>'
);

/* a gear — the one place on this site where a cog is the right answer. The
   craft tab's own glyph is a mortar and pestle precisely so this can be the
   cog without the two colliding. */
const engineering = icon(
	'<circle cx="12" cy="12" r="3.5"/>' +
		'<path d="M12 3.2v2.6M12 18.2v2.6M20.8 12h-2.6M5.8 12H3.2"/>' +
		'<path d="M18.2 5.8 16.4 7.6M7.6 16.4l-1.8 1.8M18.2 18.2 16.4 16.4M7.6 7.6 5.8 5.8"/>'
);

/* a pot with two curls of steam. The kitchen bench gets no icon of its own, so
   there is nothing for this to be confused with. */
const cooking = icon(
	'<path d="M4 10h16v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M2.5 10h19"/>' +
		'<path d="M9.5 6.8c0-1.1 1-1.4 1-2.6M14 6.8c0-1.1 1-1.4 1-2.6"/>'
);

/* one cartridge, with the case mouth marked. Two rounds side by side was the
   first attempt and it closes into a single blob below about 16px. */
const ammunition = icon('<path d="M9.5 20.5V10l2.5-6.5 2.5 6.5v10.5z"/><path d="M9.5 13.5h5"/>');

/* a first-aid case. A bare cross reads as "health" — a hit-point bar, a heal —
   where the case says the profession that makes the contents. */
const medicine = icon(
	'<rect x="3" y="7.5" width="18" height="12.5" rx="2"/>' +
		'<path d="M9 7.5V5.8a1.8 1.8 0 0 1 1.8-1.8h2.4A1.8 1.8 0 0 1 15 5.8v1.7"/>' +
		'<path d="M12 11v5.5M9.25 13.75h5.5"/>'
);

/* a bottle with a bubble in it. The shoulders and the narrow neck are what
   separate this from a laboratory flask, which is a plain triangle — brewing
   and chemistry are neighbours here and the glyphs must not be. */
const brewing = icon(
	'<path d="M10 3.5h4v3l2.2 3.6a4 4 0 0 1 .55 2v7.4a1.5 1.5 0 0 1-1.5 1.5h-6.5a1.5 1.5 0 0 1-1.5-1.5v-7.4a4 4 0 0 1 .55-2L10 6.5z"/>' +
		'<circle cx="11" cy="15" r="1"/><circle cx="14" cy="17.5" r=".8"/>'
);

/* a burst. A flame was the obvious pick and it is wrong twice over: it reads as
   "fire damage" rather than as making the thing, and at badge size it is the
   same silhouette as the steam on the cooking pot. */
const pyrotechnics = icon(
	'<path d="M12 2.5 13.9 8.2l5.6-2.1-3.4 4.9 4.6 3.4-5.9.5 1.3 5.8-4.1-4.3-4.1 4.3 1.3-5.8-5.9-.5 4.6-3.4L4.5 6.1l5.6 2.1z"/>'
);

/* a helmet, not a shield: the shield is already the `armor` group's glyph in
   $lib/group-icons, and one mark meaning two things on one site is worse than
   a second-choice mark meaning one. */
const armorer = icon(
	'<path d="M3.5 16.5a8.5 8.5 0 0 1 17 0v1.7a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8z"/>' +
		'<path d="M3.6 15.2h16.8"/>'
);

/* the catch-all — a badge outline, which says "a profession" without claiming
   which one */
const unknownPerk = icon('<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>');

const PERK_ICONS: Record<string, string> = {
	materials,
	engineering,
	cooking,
	ammunition,
	medicine,
	brewing,
	pyrotechnics,
	armorer
};

/** True when this perk has a mark of its own rather than the placeholder. */
export function hasPerkIcon(perk: string): boolean {
	return perk in PERK_ICONS;
}

export function perkIcon(perk: string): string {
	return PERK_ICONS[perk] ?? unknownPerk;
}

/**
 * The hue for a profession, as a `var()` into the site palette.
 *
 * A name rather than a colour, so the light skin's own eight values apply
 * without this module knowing there are two skins — the same rule every other
 * tint on this site follows. Unknown perks take the body colour rather than a
 * wrong one.
 */
export function perkTint(perk: string): string {
	return perk in PERK_ICONS ? `var(--perk-${perk})` : 'currentColor';
}

/** The perks this module draws, for the test that checks the data against it. */
export const PERKS_WITH_ICONS: string[] = Object.keys(PERK_ICONS);
