/**
 * One stroke icon per stat, in the same Feather-style language as
 * $lib/nav-icons, $lib/group-icons and $lib/craft-icons — same 24×24 box, same
 * weight, and `currentColor` throughout so the colour is decided outside the
 * glyph. See `statTint` and `STAT_GROUPS` at the bottom of this file for what
 * decides it, and $lib/styles/palette.css for the ten hues.
 *
 * Written rather than sourced, for the third time and the same reason: the
 * vendored EXBO database ships per-item art only (`icons/<group>/<id>.png`) and
 * nothing at all for a stat. There is no upstream glyph to reuse.
 *
 * WHY KEYED ON A CONCEPT AND NOT ON A SLUG
 *
 * Upstream ships 161 stat slugs, and they are 161 *measurements*, not 161 ideas.
 * `spread`, `upg_spread` and `ammo_spread` are one idea recorded in three
 * namespaces — the rifle's cone, the muzzle device's modifier to it, and the
 * cartridge's. Drawing three marks would say they are three unrelated things,
 * which is exactly backwards: the whole value of a mark here is that you learn
 * "this wedge means spread" once, on a weapon page, and then read it instantly
 * in a muzzle-device column on the compatibility table.
 *
 * So the marks are keyed on 99 concepts and `STAT_CONCEPT` maps every slug onto
 * one. `tests/stat-icons.test.ts` checks that map against the shipped database
 * rather than against a list, so a stat added by an EXBO patch fails the build
 * instead of quietly rendering the placeholder.
 *
 * THE ONE COMPOSITION RULE
 *
 * A hazard appears in the data three ways, and the difference matters more than
 * which hazard it is: `art_radiation_accumulation` is what you are soaking up,
 * `art_radiation_protection` is what stops it, `art_reaction_to_burn` is an
 * artefact converting it into regeneration. Those three read as families:
 *
 *   bare mark      the hazard itself — an exposure, or damage of that type
 *   in a shield    protection / resistance                 (`shielded`)
 *   in a ring      an anomaly reaction                     (`reactive`)
 *
 * The silhouette carries the family at any size — shield-shaped means defence
 * even at 12px, when the trefoil inside it has collapsed to a blob — and the
 * interior names the hazard once you look, with the row's own label right beside
 * it. That is the trade, and it is the right way round: on an artefact page
 * "Radiation protection −40%" and "Radiation 1.06" are adjacent rows, and
 * telling those two apart at a glance is the job.
 *
 * Hazard interiors lean on fills where the house style would normally stroke.
 * That is deliberate: a filled trefoil survives being scaled to half size inside
 * a shield, and a 1.8px-stroked one does not. The scaled groups carry a
 * compensating `stroke-width` so what strokes remain still land at ~1.6px.
 *
 * AND THE THIRD CHANNEL
 *
 * Shape says which stat, silhouette says which direction, and hue says which KIND
 * — ten families, in `STAT_GROUPS` below. Those three are chosen to be
 * independent: a radiation accumulation and a radiation protection share a hue
 * and differ in silhouette; a radiation protection and a frost protection share a
 * silhouette and differ in hue. Neither channel has to do the other's job, which
 * is what lets a suit's eighteen effect rows be read at a glance instead of
 * spelled out.
 */

const icon = (paths: string): string =>
	`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ` +
	`stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/** Filled hazard geometry, so it survives `shielded`/`reactive` scaling. */
const solid = (paths: string): string =>
	`<g fill="currentColor" stroke="none">${paths}</g>`;

/* Narrower than $lib/group-icons' `armor` shield on purpose — that one is a
   silhouette with a band across it, this one has to hold a hazard. */
const SHIELD =
	'<path d="M12 2.4 20.4 5.5v6.3c0 4.6-3.3 8.2-8.4 10-5.1-1.8-8.4-5.4-8.4-10V5.5z"/>';

/* A 313° arc with an arrowhead in the gap: the reaction is a conversion, the
   hazard coming back round as something you want. */
const RING =
	'<path d="M16.93 4.96A8.6 8.6 0 1 1 7.07 4.96"/>' +
	'<path d="M9.85 3.01 8.39 6.84 5.75 3.08z" fill="currentColor" stroke="none"/>';

/** A hazard behind a shield: protection, resistance, absorption of that type. */
const shielded = (core: string): string =>
	icon(SHIELD + `<g transform="translate(6 4.8) scale(0.5)" stroke-width="3.2">${core}</g>`);

/** A hazard inside a conversion ring: an anomaly reaction. */
const reactive = (core: string): string =>
	icon(RING + `<g transform="translate(6.5 6.5) scale(0.46)" stroke-width="3.5">${core}</g>`);

/*
 * ── HAZARDS ───────────────────────────────────────────────────────────────────
 *
 * Each is a pair: `mark` is the standalone glyph, `core` the simplified geometry
 * that goes inside a shield or a ring. They differ where detail that reads at
 * full size turns to mush at half — the sun loses four of its eight rays, the
 * skull loses its jaw and cheekbones, the snowflake its tip serifs.
 */

/* The trefoil, three wedges off one `d` and two rotations. Nothing else in the
   game's vocabulary is this shape, which is the point of using it. */
const RAD_WEDGE = 'M7.25 3.77A9.5 9.5 0 0 1 16.75 3.77L14.1 8.36A4.2 4.2 0 0 0 9.9 8.36z';
const radiationBody = solid(
	`<path d="${RAD_WEDGE}"/><path d="${RAD_WEDGE}" transform="rotate(120 12 12)"/>` +
		`<path d="${RAD_WEDGE}" transform="rotate(240 12 12)"/><circle cx="12" cy="12" r="2.4"/>`
);

/* Three lobes round a hub. Not the real biohazard trefoil — its three hooked
   arcs are one continuous ring at small size, where three discs stay three. */
const biologicalBody = solid(
	'<circle cx="12" cy="5.4" r="3.5"/><circle cx="6" cy="15.8" r="3.5"/>' +
		'<circle cx="18" cy="15.8" r="3.5"/><circle cx="12" cy="12.4" r="2.3"/>'
);

/* A spiral for psy — the in-game emission is a pressure in your head, and a
   brain outline reads as "settings for an AI feature" on a website. */
const psychoBody =
	'<path d="M12 12a2.4 2.4 0 0 1 2.4 2.4A4.8 4.8 0 0 1 9.6 19.2 7.2 7.2 0 0 1 2.4 12 9.6 9.6 0 0 1 12 2.4a9.6 9.6 0 0 1 9.4 7.7"/>';
const psychoCore =
	'<path d="M12 12a3 3 0 0 1 3 3 6 6 0 0 1-6 6 9 9 0 0 1-9-9 12 12 0 0 1 12-12"/>';

/* Heat waves. A sun was the first answer and it was wrong twice: the mark also
   has to serve `art_thermal_accumulation`, labelled Temperature rather than
   Sunlight, and shrunk into a shield a disc-with-rays is the same pointy blob as
   the explosion burst — which sits two rows away on every suit in the game. A
   thermometer is worse still, because inside a shield it is a vertical bar. */
const thermalBody =
	'<path d="M2.8 6.6c2.6-3.2 5.6-3.2 8.2 0s5.6 3.2 8.2 0"/>' +
	'<path d="M2.8 13c2.6-3.2 5.6-3.2 8.2 0s5.6 3.2 8.2 0"/>' +
	'<path d="M2.8 19.4c2.6-3.2 5.6-3.2 8.2 0s5.6 3.2 8.2 0"/>';
const thermalCore =
	'<path d="M1.6 7.6c3-3.8 6.4-3.8 9.4 0s6.4 3.8 9.4 0"/>' +
	'<path d="M1.6 16.4c3-3.8 6.4-3.8 9.4 0s6.4 3.8 9.4 0"/>';

const frostBody =
	'<path d="M12 2.2v19.6"/><path d="M3.5 7.1l17 9.8"/><path d="M3.5 16.9l17-9.8"/>' +
	'<path d="M12 6.6 9.4 4M12 6.6 14.6 4M12 17.4 9.4 20M12 17.4l2.6 2.6"/>';
const frostCore = '<path d="M12 1.6v20.8M2.6 6.8l18.8 10.4M2.6 17.2 21.4 6.8"/>';

/* Solid, so it cannot be mistaken for the hollow flame beside it. */
const bleedingBody = solid(
	'<path d="M12 2.4s6.6 7.8 6.6 11.8A6.6 6.6 0 0 1 5.4 14.2C5.4 10.2 12 2.4 12 2.4z"/>'
);

/* Flame and blood drop are the same teardrop silhouette, which is a real problem:
   `ammo_bleeding` and `ammo_combustion` are neighbouring columns on the
   ammunition table, and a suit carries Bleeding protection and Fire resistance as
   neighbouring rows. Hollow against solid is what separates them, and it is the
   one distinction that survives being halved — so the shielded flame drops its
   inner tongue rather than shrinking it into a blob that closes the outline up. */
const burnBody =
	'<path d="M12 2.4c3.9 4.4 6.4 7.4 6.4 11a6.4 6.4 0 0 1-12.8 0c0-2.3 1.2-4 2.6-5.6.3 1.6 1.3 2.6 2.4 2.6 1.4 0 2.2-1.2 2.2-3 0-1.5-.4-3.2-.8-5z"/>' +
	'<path d="M12 12.8c1.6 1.8 2.6 3 2.6 4.4a2.6 2.6 0 0 1-5.2 0c0-1.4 1-2.6 2.6-4.4z" fill="currentColor" stroke="none"/>';
const burnCore =
	'<path d="M12 1.4c4.4 5 7.2 8.4 7.2 12.4a7.2 7.2 0 0 1-14.4 0c0-2.6 1.4-4.6 3-6.4.3 1.8 1.4 3 2.7 3 1.6 0 2.5-1.4 2.5-3.4 0-1.7-.5-3.6-.9-5.6z"/>';

const toxicBody =
	'<path d="M12 3.2a7.2 7.2 0 0 1 7.2 7.2v2.2a2.6 2.6 0 0 1-1.5 2.4l-.9.4v2.1a1.6 1.6 0 0 1-1.6 1.6H8.8a1.6 1.6 0 0 1-1.6-1.6v-2.1l-.9-.4a2.6 2.6 0 0 1-1.5-2.4v-2.2A7.2 7.2 0 0 1 12 3.2z"/>' +
	'<circle cx="9.2" cy="11" r="1.8" fill="currentColor" stroke="none"/>' +
	'<circle cx="14.8" cy="11" r="1.8" fill="currentColor" stroke="none"/><path d="M10.4 15.4h3.2"/>';
const toxicCore =
	'<circle cx="12" cy="11.4" r="8.4"/>' +
	'<circle cx="9" cy="10.4" r="2.2" fill="currentColor" stroke="none"/>' +
	'<circle cx="15" cy="10.4" r="2.2" fill="currentColor" stroke="none"/><path d="M9.6 16.4h4.8"/>';

/* The bolt is circled, because the bare bolt is stamina — one of the two most
   common stats in the game — and those two must never trade places. */
const electricBody =
	'<circle cx="12" cy="12" r="9"/>' +
	'<path d="M13.4 5.6 8.4 12.8h3.4l-.9 5.6 5.1-7.4h-3.6z" fill="currentColor" stroke="none"/>';
const electricCore = solid('<path d="M14 2.4 5.4 14.2h5.8l-1.6 7.4 8.8-11.8h-5.6z"/>');

/* A flask, and specifically a wide-shouldered one: $lib/craft-icons draws a
   long-necked bottle for home-brewing and the two are neighbours in meaning. */
const chemicalBody =
	'<path d="M9.4 3.4h5.2v4.2l3.9 9.2a2 2 0 0 1-1.8 2.8H7.3a2 2 0 0 1-1.8-2.8l3.9-9.2z"/>' +
	'<path d="M7.2 13.6h9.6"/>';
const chemicalCore =
	'<path d="M9 2.6h6v4.6l4.4 10.2a2.2 2.2 0 0 1-2 3H6.6a2.2 2.2 0 0 1-2-3L9 7.2z"/>' +
	'<path d="M6.4 13.8h11.2"/>';

const tearBody =
	'<path d="M5.4 4.2C8.6 8 10.6 13 11.4 19.8"/><path d="M10.6 3.4C13.8 7.2 15.8 12.2 16.6 19"/>' +
	'<path d="M15.8 4.6C18 7.6 19.4 11 20.2 14.8"/>';
const tearCore = '<path d="M5.6 3.4C9 7.6 11.2 13 12 20.4"/><path d="M12.6 3C16 7.2 18.2 12.6 19 20"/>';

/* Being staggered, and stopping it. `art_stopping_protection` is labelled
   Stability and shared the weapon's stabilization mark until the grouping work
   showed up what that costs: it is not weapon handling at all, it is resistance
   to the `stopping_power` a bullet delivers, so it belongs with the other twelve
   resistances rather than four rows above them. The core is the arrest itself —
   arrow into a wall — because the full mark's two bowed shock lines are thin
   curves that close into a blob at half size. */
const stoppingCore =
	'<path d="M1.6 12h9.4"/><path d="M7 7 12 12l-5 5"/><path d="M16.4 2.4v19.2"/>';

/* No bare `bullet` mark: nothing in the data is "bullet damage of type bullet".
   `art_bullet_dmg_factor` is a resistance, so this core only ever appears
   shielded. Drawn as a cartridge stood on its rim, matching group-icons. */
const bulletCore =
	'<path d="M12 1.6c2.2 2.2 3.4 4.6 3.4 7.1v11.6a1.8 1.8 0 0 1-1.8 1.8h-3.2a1.8 1.8 0 0 1-1.8-1.8V8.7c0-2.5 1.2-4.9 3.4-7.1z"/>' +
	'<path d="M8.6 9.6h6.8"/>';

/* Ten uneven points and filled — a blast, deliberately not the eight-point
   outline star $lib/craft-icons uses for the pyrotechnics profession. */
const explosionBody = solid(
	'<path d="M12 2.2 14.6 7.6 19.4 5.2 18.2 10.4 23 11.6 18.6 14.2 21 18.8 15.8 17.8 14.8 22.4 11.6 18.6 8.2 21.8 7.8 16.8 3 18 5.2 13.4 1.2 11 6 9.6 4.4 5.2 9.4 6.8z"/>'
);
const explosionCore = solid('<path d="M12 1.6 15.2 8.8 22.4 12 15.2 15.2 12 22.4 8.8 15.2 1.6 12 8.8 8.8z"/>');

/*
 * ── THE MARKS ─────────────────────────────────────────────────────────────────
 *
 * Grouped the way a player meets them: what the thing is worth, what condition
 * it is in, how it shoots, how it swings, what it does to a body, what it senses.
 * The comments are on the ones where the obvious mark was the wrong one.
 */
const MARKS: Record<string, string> = {
	/* identity, worth, wear */

	weight: icon(
		'<path d="M9.2 8.5a2.8 2.8 0 0 1 5.6 0"/>' +
			'<path d="M7.5 8.5h9l2.4 11.3a1 1 0 0 1-1 1.2H6.1a1 1 0 0 1-1-1.2z"/>'
	),
	/* a banknote. A coin stack was the first attempt and it is the `supply` tin
	   from group-icons with the lid line moved. */
	price: icon(
		'<rect x="2.5" y="6.5" width="19" height="11" rx="1.6"/><circle cx="12" cy="12" r="2.6"/>' +
			'<path d="M6.2 10.4v3.2M17.8 10.4v3.2"/>'
	),
	rank: icon('<path d="M5 12.5l7-4 7 4"/><path d="M5 17.5l7-4 7 4"/>'),
	/* a luggage tag: `type`, `category`, `stash_type` and friends are enum stats,
	   the ones whose value is a word rather than a number */
	type: icon(
		'<path d="M20.4 12.9 12.9 20.4a1.7 1.7 0 0 1-2.4 0L3.6 13.5V4.6a1 1 0 0 1 1-1h8.9l6.9 6.9a1.7 1.7 0 0 1 0 2.4z"/>' +
			'<circle cx="8" cy="8" r="1.4"/>'
	),
	uses: icon('<path d="M6 5.8v12.4M10.5 5.8v12.4M15 5.8v12.4"/><path d="M4 17.4 17.2 6.2"/>'),
	priority: icon('<path d="M4.5 4h15"/><path d="M12 20.5V8.5"/><path d="M7.5 13 12 8.5l4.5 4.5"/>'),
	reliability: icon('<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.2l2.7 2.7 5-5.6"/>'),
	/* two leaves. `art_freshness` is how far an artefact is from spoiling, and
	   every other "how much is left" mark here is a battery or a plate. */
	freshness: icon(
		'<path d="M12 20.5v-6"/><path d="M12 14.5c-4.5 0-6.5-2.5-6.5-6.5 4.5 0 6.5 2.5 6.5 6.5z"/>' +
			'<path d="M12 14.5c4.5 0 6.5-2.5 6.5-6.5-4.5 0-6.5 2.5-6.5 6.5z"/>'
	),
	earnings: icon('<path d="M3.5 17 9 11.5l3.2 3.2 6.3-7.2"/><path d="M14.2 6.5h5v5"/>'),

	/* condition and charge. Every "max" is its own mark rather than a variant,
	   because `durability` and `max_durability` are adjacent rows on 445 items —
	   the pair has to be told apart, not merely recognised as a pair. */

	/* a plate with a crack running clean through it, edge to edge. Stopped short
	   inside the box the same zigzag reads as a letter sitting in a frame. */
	durability: icon(
		'<rect x="4.5" y="5.5" width="15" height="13" rx="1.5"/>' +
			'<path d="M10.2 5.5 12.8 9.9 10.4 12.5 13.2 18.5"/>'
	),
	durabilityMax: icon(
		'<rect x="4.5" y="8" width="15" height="10.5" rx="1.5"/>' +
			'<path d="M10.2 8 12.6 11.6 10.4 13.8 12.9 18.5"/><path d="M4.5 4.8h15"/>'
	),
	durabilityLoss: icon(
		'<rect x="3.5" y="6" width="11" height="12" rx="1.5"/>' +
			'<path d="M7.6 6 9.8 9.8 7.8 11.8 10.2 18"/>' +
			'<path d="M18.5 8.5v8"/><path d="M15.8 13.8l2.7 2.7 2.7-2.7"/>'
	),
	/* a dial, for `plate_durability` — labelled Condition, and sitting next to a
	   plate's absolute Durability, which takes the cracked-plate mark */
	condition: icon(
		'<path d="M4 17.5a8 8 0 1 1 16 0"/><path d="M12 17.5 16.4 10.9"/>' +
			'<circle cx="12" cy="17.5" r="1.3" fill="currentColor" stroke="none"/>'
	),
	charge: icon(
		'<rect x="2.5" y="8" width="15.5" height="8" rx="1.8"/><path d="M20.5 10.6v2.8"/>' +
			'<path d="M5.8 10.6v2.8M9.2 10.6v2.8M12.6 10.6v2.8"/>'
	),
	chargeMax: icon(
		'<rect x="2.5" y="10" width="15.5" height="7.5" rx="1.8"/><path d="M20.5 12.4v2.8"/>' +
			'<path d="M5.8 12.4v2.8M9.2 12.4v2.8M12.6 12.4v2.8"/><path d="M2.5 6.5h15.5"/>'
	),
	capacity: icon('<rect x="3.5" y="6" width="17" height="13" rx="1.5"/><path d="M3.5 11h17M12 11v8"/>'),
	/* a percent sign, drawn. `pack_effectiveness` is how much of an artefact's
	   effect a container passes through, and it is the one stat where the unit
	   *is* the meaning. */
	effectiveness: icon(
		'<circle cx="7.6" cy="7.6" r="2.7"/><circle cx="16.4" cy="16.4" r="2.7"/><path d="M18.6 5.4 5.4 18.6"/>'
	),
	/* a box inside a box: a backpack's inner protection is what it does for the
	   things you put in it, not for you */
	innerProtection: icon(
		'<rect x="2.8" y="5.5" width="18.4" height="13" rx="1.6"/>' +
			'<rect x="7.2" y="9.2" width="9.6" height="5.6" rx="1"/>'
	),
	absorption: icon(
		'<path d="M3.5 18.5h17"/><path d="M8 4.5v8"/><path d="M5 9.5 8 12.5l3-3"/>' +
			'<path d="M16 4.5v8"/><path d="M13 9.5l3 3 3-3"/>'
	),
	/* a threshold being crossed — `lifesaver_sniper_trigger_damage` is the only
	   stat in the data whose unit is `>=unit(s)` */
	trigger: icon('<path d="M2.5 17h6l3.5-10 3.5 10h6"/>'),

	/* firearms */

	/* the hit marker: four detached strokes leaning into a centre nothing draws.
	   An arrow striking a floor was the obvious mark and it is Feather's download
	   glyph — and worse, it is `absorption` with one arrow instead of two. */
	damage: icon('<path d="M5.5 5.5 9.2 9.2M18.5 5.5 14.8 9.2M5.5 18.5 9.2 14.8M18.5 18.5 14.8 14.8"/>'),
	damageFalloff: icon('<path d="M3.5 4v16h17"/><path d="M6 6.5h4.5c4 0 3.5 10 9.5 10"/>'),
	/* end ticks, not arrowheads: `horizontalRecoil` is the double-headed arrow
	   and the two would otherwise be the same mark */
	range: icon('<path d="M4.5 7.5v9M19.5 7.5v9"/><path d="M4.5 12h15"/>'),
	rateOfFire: icon(
		'<path d="M4 6.5 8.5 12 4 17.5"/><path d="M10.5 6.5 15 12l-4.5 5.5"/><path d="M17 6.5 21.5 12 17 17.5"/>'
	),
	magazine: icon('<path d="M7.5 4.5h9v10a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 8.5h9"/>'),
	magazineExtra: icon(
		'<path d="M5 4.5h9v10a4.5 4.5 0 0 1-9 0z"/><path d="M5 8.5h9"/><path d="M18.8 5.4v5M16.3 7.9h5"/>'
	),
	reload: icon(
		'<path d="M8.5 9.5h7v6.5a3.5 3.5 0 0 1-7 0z"/><path d="M8.5 12.5h7"/>' +
			'<path d="M5.6 8.2A7.5 7.5 0 0 1 18.4 6"/><path d="M18.9 2.6v4h-4"/>'
	),
	/* two magazines, which is literally what a tactical reload is: the fresh one
	   in, the part-used one kept. It also has to differ from plain reload at a
	   glance — those two are columns 4 and 5 on every weapon in the game. */
	reloadTactical: icon(
		'<path d="M4.5 6.5h6v8.5a3 3 0 0 1-6 0z"/><path d="M4.5 9.5h6"/>' +
			'<path d="M13.5 6.5h6v8.5a3 3 0 0 1-6 0z"/><path d="M13.5 9.5h6"/>'
	),
	reloadSingle: icon(
		'<path d="M12 2.5c1.2 1.4 1.8 2.6 1.8 3.9v3.1h-3.6V6.4c0-1.3.6-2.5 1.8-3.9z"/>' +
			'<path d="M12 11.5v2.6"/><path d="M6.5 16h11v4.5h-11z"/>'
	),
	/* a cone opening up from a muzzle. The dot is the muzzle and it is what stops
	   the mark reading as ∀ — a bar across the wide end, which was the first
	   attempt, is exactly the logic quantifier and nothing else. */
	spread: icon(
		'<path d="M12 18.6 6.8 4.6M12 18.6 17.2 4.6"/>' +
			'<circle cx="12" cy="20.4" r="1.5" fill="currentColor" stroke="none"/>'
	),
	/* the same cone thrown from the hip rather than down the sights. Aperture is
	   identical and the heading is not: at 14px a wide wedge and a narrow one are
	   both a wedge, where upright and diagonal are two different marks. */
	hipSpread: icon(
		'<path d="M5.8 18.2 12.6 4.4M5.8 18.2 19.6 12"/>' +
			'<circle cx="4.4" cy="19.6" r="1.5" fill="currentColor" stroke="none"/>'
	),
	recoil: icon('<path d="M4.5 19.5h15"/><path d="M12 16V4.5"/><path d="M7.5 9 12 4.5 16.5 9"/>'),
	horizontalRecoil: icon(
		'<path d="M12 4.5v15"/><path d="M4 12h16"/><path d="M7.5 8.5 4 12l3.5 3.5"/>' +
			'<path d="M16.5 8.5 20 12l-3.5 3.5"/>'
	),
	recoilGain: icon(
		'<path d="M3.5 19.5c6 0 8-4 9-8 .8-3.2 2.4-5.6 6.5-6.7"/><path d="M15.4 5.6 19 4.8l-.8 3.8"/>'
	),
	/* a braced A-frame, for `upg_shoot_factor_decrement` — the weapon's
	   stabilization. A spirit level was the first attempt and a capsule with a
	   bubble in it is a toggle switch, which on a stat row promises a control. */
	stability: icon('<path d="M12 3.5v9.5"/><path d="M5.5 20.5 12 13l6.5 7.5"/><path d="M8.6 16.9h6.8"/>'),
	sway: icon('<path d="M3.5 14c2.4-4.4 5.2-4.4 8.5 0s6.1 4.4 8.5 0"/>'),
	aim: icon(
		'<circle cx="12" cy="12" r="7.5"/><path d="M12 2.2v4.3M12 17.5v4.3M2.2 12h4.3M17.5 12h4.3"/>' +
			'<circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>'
	),
	/* the crosshair with motion behind it: `upg_aiming_speed_modifier` is how
	   fast you *move* while aimed, not how fast you get there */
	aimSpeed: icon(
		'<circle cx="14.5" cy="12" r="6"/><path d="M14.5 4.5v3M14.5 16.5v3M20.5 12h3"/>' +
			'<path d="M2 9h4.5M1.5 12h5.5M2 15h4.5"/>'
	),
	zoom: icon(
		'<circle cx="11" cy="11" r="6.5"/><path d="M15.8 15.8 20.6 20.6"/><path d="M8 11h6M11 8v6"/>'
	),
	draw: icon(
		'<path d="M6.5 12.5h11v6.5a1.5 1.5 0 0 1-1.5 1.5H8a1.5 1.5 0 0 1-1.5-1.5z"/>' +
			'<path d="M12 9.5v-7"/><path d="M8.5 6 12 2.5 15.5 6"/>'
	),
	/* a hand. `upg_reload_modifier` is labelled Weapon ergonomics and is carried
	   by 279 items — it is handling, not reloading, and giving it the magazine
	   mark would have been a wrong answer on a quarter of the catalogue. */
	ergonomics: icon(
		'<path d="M8.6 12.4V6.6a1.7 1.7 0 0 1 3.4 0v4.4"/><path d="M12 11V5.4a1.7 1.7 0 0 1 3.4 0V11"/>' +
			'<path d="M15.4 11.6V8.4a1.7 1.7 0 0 1 3.4 0v6.4a5.6 5.6 0 0 1-5.6 5.6h-1.6a5.6 5.6 0 0 1-5.6-5.6v-2.4a1.7 1.7 0 0 1 3.4 0"/>'
	),
	projectiles: icon(
		'<circle cx="8" cy="8.5" r="2.3" fill="currentColor" stroke="none"/>' +
			'<circle cx="16" cy="10" r="2.3" fill="currentColor" stroke="none"/>' +
			'<circle cx="11" cy="16" r="2.3" fill="currentColor" stroke="none"/>'
	),
	piercing: icon('<path d="M8 3.5v17"/><path d="M2.5 12h18"/><path d="M17 8.5l3.5 3.5-3.5 3.5"/>'),
	/* through a plate rather than through a line — the thickness is the whole
	   difference between armour penetration and plate penetration */
	platePierce: icon(
		'<rect x="6" y="4" width="5.5" height="16" rx="1"/><path d="M2.5 12h18"/>' +
			'<path d="M17 8.5l3.5 3.5-3.5 3.5"/>'
	),
	/* an impact pushing two shock lines out ahead of it. Deliberately not another
	   arrow-and-wall: `ammo_piercing`, `ammo_plate_penetrating` and
	   `ammo_stopping_power` are three columns of the same ammunition table, and
	   the first two are already the arrow that goes through. */
	stoppingPower: icon(
		'<path d="M3.5 12h8.5"/><path d="M8.5 8.5 12 12l-3.5 3.5"/>' +
			'<path d="M15 4.5c3 4 3 11 0 15"/><path d="M19.5 7c2 3 2 7 0 10"/>'
	),
	mobDamage: icon(
		'<circle cx="7.4" cy="9.2" r="1.9" fill="currentColor" stroke="none"/>' +
			'<circle cx="12" cy="7.4" r="1.9" fill="currentColor" stroke="none"/>' +
			'<circle cx="16.6" cy="9.2" r="1.9" fill="currentColor" stroke="none"/>' +
			'<path d="M12 20.5c-3.1 0-5.2-1.8-5.2-4s2.2-4 5.2-4 5.2 1.8 5.2 4-2.1 4-5.2 4z" fill="currentColor" stroke="none"/>'
	),
	limbDamage: icon(
		'<circle cx="7" cy="5" r="2.2"/><path d="M7 7.2v4.6a3.6 3.6 0 0 0 3.6 3.6h3.4"/>' +
			'<path d="M16.2 12.6 20.4 16.8M20.4 12.6 16.2 16.8"/>'
	),

	/* melee. min and max share a mark on purpose: a melee weapon page shows four
	   damage rows — quick min, quick max, strong min, strong max — and the two
	   marks are there to group them into the two attacks, which is the read the
	   labels alone make you work for. */

	/* a blade, and the strong attack is the same blade with the swing drawn around
	   it. A bare slash with an arrowhead was the first pair and it collides with
	   `reach` and `earnings`, both of which are already diagonal arrows — this
	   site has three of those and none of them should be a knife. */
	meleeQuick: icon(
		'<path d="M12 2.4 14.8 8.4v7.2H9.2V8.4z"/><path d="M7 15.6h10"/>' +
			'<path d="M12 15.6v5.6"/><path d="M9.8 21.2h4.4"/>'
	),
	meleeStrong: icon(
		'<path d="M12 2.4 14.4 7.6v6.4H9.6V7.6z"/><path d="M7.6 14h8.8"/>' +
			'<path d="M12 14v4.6"/><path d="M10.2 18.6h3.6"/>' +
			'<path d="M4.4 6.6c-1.4 3.4-1.4 7.4 0 10.8"/><path d="M19.6 6.6c1.4 3.4 1.4 7.4 0 10.8"/>'
	),
	reach: icon(
		'<path d="M4.5 19.5 19.5 4.5"/><path d="M4.5 14.6v4.9h4.9"/><path d="M19.5 9.4V4.5h-4.9"/>'
	),
	/* a gash with a drop under it. Two facing arcs was the first attempt and it
	   renders as a pair of brackets, which reads as punctuation, not injury. */
	deepWound: icon(
		'<path d="M8.6 3.8c4.6 4 7 9.6 7.4 16.4-4.6-4-7-9.6-7.4-16.4z"/>' +
			'<path d="M5.2 19.4c-1.1 0-2-.9-2-2 0-1.2 2-3.4 2-3.4s2 2.2 2 3.4c0 1.1-.9 2-2 2z" fill="currentColor" stroke="none"/>'
	),

	/* explosives and the clocks that go with them */

	explosion: icon(explosionBody),
	blastRadius: icon(
		'<circle cx="12" cy="12" r="9.2" stroke-dasharray="2.6 2.8"/>' +
			'<path d="M12 6.6 13.6 10.4 17.4 12 13.6 13.6 12 17.4 10.4 13.6 6.6 12 10.4 10.4z" fill="currentColor" stroke="none"/>'
	),
	/* a lit fuse for the delay you choose, a stopwatch for the one you are given:
	   a frag carries both `explosion_activation_time` and `lifetime` */
	fuse: icon(
		'<path d="M4 20c3.6 0 5-2.2 5-5.2s1.6-5.6 5.2-6.3"/>' +
			'<circle cx="17.4" cy="7.4" r="2.2" fill="currentColor" stroke="none"/>' +
			'<path d="M17.4 3.6V2M20.4 4.4 21.6 3.2M21 7.4h1.6"/>'
	),
	timer: icon(
		'<circle cx="12" cy="13.8" r="7.4"/><path d="M12 9.8v4l2.6 2"/><path d="M9.6 3.4h4.8M12 3.4v3"/>'
	),
	blind: icon(
		'<path d="M2.8 12s3.7-5.5 9.2-5.5 9.2 5.5 9.2 5.5-3.7 5.5-9.2 5.5S2.8 12 2.8 12z"/>' +
			'<circle cx="12" cy="12" r="2.5"/><path d="M4.2 4.2 19.8 19.8"/>'
	),
	duration: icon(
		'<path d="M6.8 3.5h10.4M6.8 20.5h10.4"/>' +
			'<path d="M8 3.5v3.2c0 1.5 4 3.8 4 5.3s-4 3.8-4 5.3v3.2"/>' +
			'<path d="M16 3.5v3.2c0 1.5-4 3.8-4 5.3s4 3.8 4 5.3v3.2"/>'
	),
	cooldown: icon(
		'<path d="M20.4 12a8.4 8.4 0 1 1-2.7-6.2"/><path d="M20.9 3.4v4.4h-4.4"/>' +
			'<path d="M12 7.6V12l3.2 2.2"/>'
	),

	/* the body */

	/* Feather's heart, unchanged — vitality is the one stat where the universal
	   mark is also the right one */
	health: icon(
		'<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>'
	),
	heal: icon('<path d="M9.6 4.5h4.8v5.1h5.1v4.8h-5.1v5.1H9.6v-5.1H4.5V9.6h5.1z"/>'),
	healEfficiency: icon(
		'<path d="M8 9.5h3.4V13h3.5v3.4h-3.5v3.5H8v-3.5H4.5V13H8z"/>' +
			'<path d="M15.5 11 21 5.5"/><path d="M16.8 5.5H21V9.7"/>'
	),
	regen: icon(
		'<path d="M20.4 12a8.4 8.4 0 1 1-2.7-6.2"/><path d="M20.9 3.4v4.4h-4.4"/>' +
			'<path d="M12 8.6v6.8M8.6 12h6.8"/>'
	),
	/* the bare bolt. Games have used it for stamina long enough that anything
	   else would be a puzzle, which is why the electroshock hazard above is
	   circled rather than taking the bolt for itself. */
	stamina: icon(solid('<path d="M13.6 2.5 5.6 13.4h5.3l-1.4 8.1 8.9-11.6h-5.6z"/>')),
	staminaRegen: icon(
		'<path d="M20.4 12a8.4 8.4 0 1 1-2.7-6.2"/><path d="M20.9 3.4v4.4h-4.4"/>' +
			'<path d="M13.2 7.4 8.6 13.4h3l-.8 4.4 5-6.4h-3.2z" fill="currentColor" stroke="none"/>'
	),
	/* wind, not an arrow: this column sits beside `piercing` and `stoppingPower`
	   on the same tables and those are both arrows already */
	speed: icon(
		'<path d="M3.5 8.5h9a3 3 0 1 0-3-3"/><path d="M3.5 12h13a3.2 3.2 0 1 1-3.2 3.2"/><path d="M3.5 15.5h6"/>'
	),
	sprint: icon(
		'<path d="M2.5 8.5h7.5a2.8 2.8 0 1 0-2.8-2.8"/><path d="M2.5 12h9"/>' +
			'<path d="M2.5 15.5h6.5a2.8 2.8 0 1 1-2.8 2.8"/><path d="M14 6.5 19.5 12 14 17.5"/>'
	),

	/* hazards, three ways each */

	radiation: icon(radiationBody),
	radiationGuard: shielded(radiationBody),
	biological: icon(biologicalBody),
	biologicalGuard: shielded(biologicalBody),
	psycho: icon(psychoBody),
	psychoGuard: shielded(psychoCore),
	thermal: icon(thermalBody),
	thermalGuard: shielded(thermalCore),
	frost: icon(frostBody),
	frostGuard: shielded(frostCore),
	bleeding: icon(bleedingBody),
	bleedingGuard: shielded(bleedingBody),
	burn: icon(burnBody),
	burnGuard: shielded(burnCore),
	burnReaction: reactive(burnCore),
	toxic: icon(toxicBody),
	electric: icon(electricBody),
	electricGuard: shielded(electricCore),
	electricReaction: reactive(electricCore),
	chemical: icon(chemicalBody),
	chemicalGuard: shielded(chemicalCore),
	chemicalReaction: reactive(chemicalCore),
	tear: icon(tearBody),
	tearGuard: shielded(tearCore),
	tearReaction: reactive(tearCore),
	bulletGuard: shielded(bulletCore),
	stoppingGuard: shielded(stoppingCore),
	explosionGuard: shielded(explosionCore),

	/* detectors, scanners, beacons */

	scanActive: icon(
		'<circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><path d="M12 12 19.4 6.6"/>' +
			'<path d="M12 3.2A8.8 8.8 0 0 1 20.8 12"/><path d="M12 7.4A4.6 4.6 0 0 1 16.6 12"/>'
	),
	scanPassive: icon(
		'<circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/>' +
			'<circle cx="12" cy="12" r="5.4"/><circle cx="12" cy="12" r="9.4"/>'
	),
	scanAngle: icon(
		'<path d="M4.5 19.5 19.5 6"/><path d="M4.5 19.5h15"/>' +
			'<path d="M14.6 19.5a10.4 10.4 0 0 0-2.6-6.8"/>'
	),
	signal: icon(
		'<circle cx="12" cy="17.4" r="2" fill="currentColor" stroke="none"/>' +
			'<path d="M8.2 13.8a5.4 5.4 0 0 1 7.6 0"/><path d="M5 10.6a9.9 9.9 0 0 1 14 0"/>'
	),
	energyDrain: icon(
		'<rect x="2.5" y="7" width="13.5" height="10" rx="1.8"/><path d="M18.5 10.4v3.2"/>' +
			'<path d="M9.2 9.4v4.2M6.6 11l2.6 2.6L11.8 11"/>'
	)
};

/* The placeholder. A bare value box: it says "a number about this item" without
   claiming to know which, and it is visibly not one of the marks above. */
const unknownStat = icon('<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M8 12h8"/>');

/**
 * Every stat slug the shipped database carries, mapped onto the concept whose
 * mark it takes.
 *
 * Ordered by domain rather than alphabetically, so the three namespaces of one
 * idea sit on adjacent lines and a wrong mapping is visible while you read.
 * `tests/stat-icons.test.ts` holds this to the actual `stats` dictionary in both
 * directions.
 */
export const STAT_CONCEPT: Record<string, string> = {
	/* identity, worth, wear */
	weight: 'weight',
	stash_max_weight: 'weight',
	art_max_weight_bonus: 'weight',
	base_price: 'price',
	art_filler_modifier: 'earnings',
	rank: 'rank',
	quality_common: 'rank',
	type: 'type',
	category: 'type',
	stash_type: 'type',
	ammo_type: 'type',
	med_effect_type: 'type',
	custom_usages_left: 'uses',
	med_priority: 'priority',
	stash_reliability: 'reliability',
	art_freshness: 'freshness',

	/* condition and charge */
	durability: 'durability',
	plate_armor: 'durability',
	max_durability: 'durabilityMax',
	tool_durability_decrease: 'durabilityLoss',
	plate_durability: 'condition',
	art_durability: 'charge',
	detector_charge: 'charge',
	signal_charge: 'charge',
	scanner_energy: 'charge',
	energy: 'charge',
	lifesaver_cost: 'charge',
	art_max_durability: 'chargeMax',
	scanner_scan_energy_consuming: 'energyDrain',
	pack_size: 'capacity',
	stash_inventory: 'capacity',
	pack_effectiveness: 'effectiveness',
	pack_inner_protection: 'innerProtection',
	plate_damage_absorption: 'absorption',
	lifesaver_sniper_blocking_damage: 'absorption',
	lifesaver_sniper_trigger_damage: 'trigger',

	/* firearms */
	dmg_direct: 'damage',
	dmg_default: 'damage',
	ammo_damage: 'damage',
	upg_damage: 'damage',
	upg_damage_distant: 'damageFalloff',
	upg_damage_decrease_start: 'damageFalloff',
	upg_damage_decrease_end: 'damageFalloff',
	frag_explosion_strength_min: 'damageFalloff',
	distance: 'range',
	ammo_distance: 'range',
	upg_distance: 'range',
	rate_of_fire: 'rateOfFire',
	clip_size: 'magazine',
	mag_clip_size: 'magazine',
	mag_additive_clip_size: 'magazineExtra',
	mag_reload_time: 'reload',
	mag_full_reload_time: 'reload',
	upg_reload_modifier: 'ergonomics',
	mag_reload_time_tactical: 'reloadTactical',
	mag_single_round_reload_time: 'reloadSingle',
	lifesaver_recharge: 'cooldown',
	spread: 'spread',
	ammo_spread: 'spread',
	upg_spread: 'spread',
	hip_spread: 'hipSpread',
	upg_hip_spread: 'hipSpread',
	recoil: 'recoil',
	upg_recoil: 'recoil',
	art_recoil_bonus: 'recoil',
	horizontal_recoil: 'horizontalRecoil',
	upg_horizontal_recoil: 'horizontalRecoil',
	upg_recoil_gain: 'recoilGain',
	upg_shoot_factor_decrement: 'stability',
	art_stopping_protection: 'stoppingGuard',
	upg_wiggle: 'sway',
	art_wiggle_bonus: 'sway',
	aim_switch: 'aim',
	upg_aim_switch_time: 'aim',
	upg_aiming_speed_modifier: 'aimSpeed',
	sight_zoom: 'zoom',
	draw_time: 'draw',
	upg_draw_time: 'draw',
	ammo_num_bullets: 'projectiles',
	ammo_piercing: 'piercing',
	melee_piercing: 'piercing',
	ammo_plate_penetrating: 'platePierce',
	plate_penetrating: 'platePierce',
	upg_armor_plate_damage: 'platePierce',
	stopping_power: 'stoppingPower',
	ammo_stopping_power: 'stoppingPower',
	frag_stopping_power: 'stoppingPower',
	upg_mobs_damage_multiplier: 'mobDamage',
	upg_limbs_damage_modifier: 'limbDamage',

	/* melee */
	melee_dmg_min_common: 'meleeQuick',
	melee_dmg_max_common: 'meleeQuick',
	melee_dmg_min_strong: 'meleeStrong',
	melee_dmg_max_strong: 'meleeStrong',
	melee_reach_common: 'reach',
	melee_reach_strong: 'reach',
	melee_bloodlust_chance: 'deepWound',

	/* explosives and clocks */
	dmg_explosion: 'explosion',
	frag_explosion_strength: 'explosion',
	frag_explosion_size: 'blastRadius',
	flash_explosion_size: 'blastRadius',
	frag_explosion_activation_time: 'fuse',
	frag_lifetime: 'timer',
	flash_lifetime: 'timer',
	flash_flash_time: 'blind',
	med_duration: 'duration',
	stash_duration: 'duration',
	med_cooldown: 'cooldown',

	/* the body */
	art_health_bonus: 'health',
	art_artefakt_heal: 'heal',
	med_hp_regen: 'heal',
	art_heal_efficiency: 'healEfficiency',
	art_regeneration_bonus: 'regen',
	art_stamina_bonus: 'stamina',
	art_stamina_regeneration_bonus: 'staminaRegen',
	art_speed_modifier: 'speed',
	upg_equipped_speed_modifier: 'speed',
	art_sprint_speed_modifier: 'sprint',

	/* hazards taken */
	art_radiation_accumulation: 'radiation',
	art_biological_accumulation: 'biological',
	art_psycho_accumulation: 'psycho',
	art_thermal_accumulation: 'thermal',
	art_frost_accumulation: 'frost',
	dmg_freeze: 'frost',
	art_bleeding_accumulation: 'bleeding',
	bleeding: 'bleeding',
	ammo_bleeding: 'bleeding',
	art_combustion_accumulation: 'burn',
	ammo_combustion: 'burn',
	dmg_burn: 'burn',
	art_toxic_accumulation: 'toxic',
	med_toxicity: 'toxic',
	dmg_electroshock: 'electric',
	dmg_chemical_burn: 'chemical',
	dmg_tear: 'tear',

	/* hazards stopped */
	art_radiation_protection: 'radiationGuard',
	art_radiation_dmg_factor: 'radiationGuard',
	art_biological_protection: 'biologicalGuard',
	art_biological_dmg_factor: 'biologicalGuard',
	art_psycho_protection: 'psychoGuard',
	art_psycho_dmg_factor: 'psychoGuard',
	art_thermal_protection: 'thermalGuard',
	art_thermal_dmg_factor: 'thermalGuard',
	art_frost_protection: 'frostGuard',
	art_frost_dmg_factor: 'frostGuard',
	art_bleeding_protection: 'bleedingGuard',
	art_bleeding_dmg_factor: 'bleedingGuard',
	art_burn_dmg_factor: 'burnGuard',
	art_electra_dmg_factor: 'electricGuard',
	art_chemical_burn_dmg_factor: 'chemicalGuard',
	art_tear_dmg_factor: 'tearGuard',
	art_bullet_dmg_factor: 'bulletGuard',
	art_explosion_dmg_factor: 'explosionGuard',

	/* hazards converted */
	art_reaction_to_burn: 'burnReaction',
	art_reaction_to_electroshock: 'electricReaction',
	art_reaction_to_chemical_burn: 'chemicalReaction',
	art_reaction_to_tear: 'tearReaction',

	/* detectors, scanners, beacons */
	detector_active_scan_radius: 'scanActive',
	scanner_scan_range: 'scanActive',
	detector_passive_scan_radius: 'scanPassive',
	detector_active_scan_angle: 'scanAngle',
	signal_range: 'signal'
};

/**
 * Which hazard takes which tint. A `<hazard>Guard` or `<hazard>Reaction` derives
 * its own from the stem, which is not a shortcut — it is the rule.
 *
 * "An accumulation and its protection are one subject" has to hold or the hue
 * stops meaning anything, and holding it by convention means someone eventually
 * gives `art_frost_protection` the cryo blue and `art_frost_accumulation` the
 * cyan next to it. Deriving makes that unrepresentable.
 */
const HAZARD_FAMILY: Record<string, string> = {
	radiation: 'contamination',
	biological: 'contamination',
	toxic: 'contamination',
	chemical: 'contamination',
	thermal: 'heat',
	burn: 'heat',
	frost: 'cryo',
	bleeding: 'trauma',
	tear: 'trauma',
	bullet: 'trauma',
	stopping: 'trauma',
	explosion: 'heat',
	psycho: 'psi',
	electric: 'energy'
};

interface StatGroup {
	/** stable key, and the reading order is this array's order */
	key: string;
	/** what the group is, for the separator's title and for tests */
	label: string;
	/** the tint every concept here takes; omitted where each derives its own */
	family?: string;
	concepts: readonly string[];
}

/**
 * The groups, in reading order — the second thing this module decides after the
 * marks themselves, and the one that makes a stats table make sense.
 *
 * WHY A GROUP LAYER AT ALL
 *
 * Ten tints were not enough on their own. `Magazine capacity`, `Reload` and
 * `Tactical reload` are one subject and were three steel marks sorted
 * alphabetically into three different parts of a rifle's twenty-three-row table
 * — the colour said "mechanical", which is true of nineteen of those rows, and
 * nothing said the three belonged together. Adjacency says it. So the groups are
 * finer than the tints and drive the ORDER, while the tints stay coarse enough
 * to be learnable:
 *
 *   damage, melee, blast          →  trauma / heat        what it does to a target
 *   precision, readiness, distance →  handling            how it is aimed
 *   feed                          →  feed                 the ammunition cycle
 *   resistance, hazard, reaction  →  per hazard           the Zone
 *   body, motion                  →  vital                you
 *   sensing                       →  energy               detectors
 *   storage, charge, wear, worth, identity → gear          the object itself
 *   timing                        →  handling             clocks
 *   bulk                          →  vital                weight
 *
 * The order runs from what a thing DOES to what it IS: a weapon leads with its
 * damage and ends with its weight, a suit leads with what it protects you from
 * and ends with its price. Which is the order both are read in.
 *
 * `label` is not rendered as a heading anywhere yet — the stats table draws a
 * rule between groups instead, because eight headings over two rows each is a
 * table of contents, not a table. It exists so a group can be named in a title
 * attribute and in a test failure.
 */
const STAT_GROUPS: readonly StatGroup[] = [
	{
		key: 'damage',
		label: 'Damage',
		family: 'trauma',
		concepts: [
			'damage',
			'damageFalloff',
			'projectiles',
			'piercing',
			'platePierce',
			'stoppingPower',
			'mobDamage',
			'limbDamage',
			'absorption',
			'trigger'
		]
	},
	{
		key: 'melee',
		label: 'Melee',
		family: 'trauma',
		concepts: ['meleeQuick', 'meleeStrong', 'reach', 'deepWound']
	},
	/* `blind` sits with the blast rather than with damage: it is a flashbang's
	   payload, and the three grenade stats around it are all here. */
	{
		key: 'blast',
		label: 'Blast',
		family: 'heat',
		concepts: ['explosion', 'blastRadius', 'fuse', 'blind']
	},
	{
		key: 'precision',
		label: 'Precision',
		family: 'handling',
		concepts: ['spread', 'hipSpread', 'recoil', 'horizontalRecoil', 'recoilGain', 'stability', 'sway']
	},
	/* The group that prompted all of this. Its own hue, because "how the weapon
	   feeds" is the one weapon question the steel family could not answer. */
	{
		key: 'feed',
		label: 'Feed',
		family: 'feed',
		concepts: [
			'magazine',
			'magazineExtra',
			'reload',
			'reloadTactical',
			'reloadSingle',
			'rateOfFire'
		]
	},
	{
		key: 'readiness',
		label: 'Readiness',
		family: 'handling',
		concepts: ['aim', 'aimSpeed', 'zoom', 'draw', 'ergonomics']
	},
	{ key: 'distance', label: 'Distance', family: 'handling', concepts: ['range'] },
	/* Protections first, and all of them together: "what does this stop" is the
	   question a suit is read for, and the answer is a block you compare against
	   the next suit's block. */
	{
		key: 'resistance',
		label: 'Resistance',
		concepts: [
			'radiationGuard',
			'biologicalGuard',
			'chemicalGuard',
			'psychoGuard',
			'thermalGuard',
			'frostGuard',
			'burnGuard',
			'electricGuard',
			'bleedingGuard',
			'tearGuard',
			'bulletGuard',
			'explosionGuard',
			'stoppingGuard'
		]
	},
	{
		key: 'hazard',
		label: 'Hazard',
		concepts: [
			'radiation',
			'biological',
			'toxic',
			'chemical',
			'thermal',
			'frost',
			'bleeding',
			'burn',
			'psycho',
			'electric',
			'tear'
		]
	},
	{
		key: 'reaction',
		label: 'Anomaly reaction',
		concepts: ['burnReaction', 'chemicalReaction', 'electricReaction', 'tearReaction']
	},
	{
		key: 'body',
		label: 'Body',
		family: 'vital',
		concepts: ['health', 'heal', 'healEfficiency', 'regen']
	},
	{
		key: 'motion',
		label: 'Motion',
		family: 'vital',
		concepts: ['stamina', 'staminaRegen', 'speed', 'sprint']
	},
	{
		key: 'sensing',
		label: 'Sensing',
		family: 'energy',
		concepts: ['scanActive', 'scanPassive', 'scanAngle', 'signal', 'energyDrain']
	},
	{
		key: 'storage',
		label: 'Storage',
		family: 'gear',
		concepts: ['capacity', 'effectiveness', 'innerProtection']
	},
	{
		key: 'timing',
		label: 'Timing',
		family: 'handling',
		concepts: ['duration', 'cooldown', 'timer']
	},
	{ key: 'charge', label: 'Charge', family: 'gear', concepts: ['charge', 'chargeMax'] },
	{
		key: 'wear',
		label: 'Condition',
		family: 'gear',
		concepts: [
			'durability',
			'durabilityMax',
			'durabilityLoss',
			'condition',
			'uses',
			'freshness',
			'reliability'
		]
	},
	{ key: 'worth', label: 'Worth', family: 'gear', concepts: ['price', 'earnings'] },
	/* Weight is its own group and it is last but one, because it is the number you
	   check after you have decided you want the thing. */
	{ key: 'bulk', label: 'Weight', family: 'vital', concepts: ['weight'] },
	{ key: 'identity', label: 'Class', family: 'gear', concepts: ['type', 'rank', 'priority'] }
];

/** concept → its group's index in reading order, and the group itself. */
const GROUP_OF = new Map<string, { index: number; group: StatGroup }>();
for (const [index, group] of STAT_GROUPS.entries()) {
	for (const concept of group.concepts) GROUP_OF.set(concept, { index, group });
}

/** The hazard a composed concept is built from: `frostGuard` → `frost`. */
const hazardStem = (concept: string): string =>
	concept.replace(/(Guard|Reaction)$/, '');

/**
 * concept → tint family, derived rather than declared a second time.
 *
 * A group either names the family all its members take, or leaves it to the
 * hazard stem — which is what keeps `resistance` one adjacent block of twelve
 * rows while each of those rows still carries its own hazard's hue.
 */
export const STAT_FAMILY: Record<string, string> = Object.fromEntries(
	STAT_GROUPS.flatMap((group) =>
		group.concepts.map((concept) => [
			concept,
			group.family ?? HAZARD_FAMILY[hazardStem(concept)]
		])
	)
);

/** The families, for the test and for anything that wants to legend them. */
export const STAT_FAMILIES: string[] = [...new Set(Object.values(STAT_FAMILY))];

/** The groups in reading order, for tests and for anything that sections a table. */
export const STAT_GROUP_KEYS: string[] = STAT_GROUPS.map((g) => g.key);

/** Which group a stat reads with, or `null` when the stat is unknown. */
export function statGroup(slug: string): string | null {
	return GROUP_OF.get(STAT_CONCEPT[slug])?.group.key ?? null;
}

/** What to call that group — for a title attribute, or a test failure. */
export function statGroupLabel(slug: string): string | null {
	return GROUP_OF.get(STAT_CONCEPT[slug])?.group.label ?? null;
}

/**
 * Where a stat sorts. Unknown stats go after everything known rather than
 * first — a stat this module has never heard of is the least likely to be the
 * one you opened the page for.
 */
export function statGroupOrder(slug: string): number {
	return GROUP_OF.get(STAT_CONCEPT[slug])?.index ?? STAT_GROUPS.length;
}

/*
 * There is deliberately no `compareStats` helper here. Every table sorts by
 * `statGroupOrder` first and then by something only it knows — the stats table by
 * label, EffectBands by magnitude — and a comparator taking a tie-break callback
 * turned two readable one-liners into an indirection that hid which was which.
 */

/**
 * The CSS colour for a stat's mark — always a `var()`, never a literal, so both
 * skins and the theme toggle keep working.
 *
 * Every call site sets it as `--stat-tint` on whatever wraps the mark, and reads
 * it back with `color: var(--stat-tint, var(--text-faint))` on the glyph alone.
 * Two reasons it goes through a property rather than straight onto `color`:
 * the label is usually a sibling inside the same wrapper, and a stat table where
 * every row's text is a different colour is a ransom note; and the fallback in
 * that `var()` is what keeps a mark visible if the token ever goes missing.
 *
 * Namespaced, not `--tint`: custom properties inherit, so a short generic name
 * set for one purpose reaches every descendant that happens to read it.
 *
 * Unknown slugs fall back to the neutral the marks used before they had tints,
 * which is also what the placeholder glyph wants.
 */
export function statTint(slug: string): string {
	const family = STAT_FAMILY[STAT_CONCEPT[slug]];
	return family ? `var(--stat-${family})` : 'var(--text-faint)';
}

/** The concept a slug takes its mark from, or `null` when it has none. */
export function statConcept(slug: string): string | null {
	return STAT_CONCEPT[slug] ?? null;
}

/** True when this slug has a mark of its own rather than the placeholder. */
export function hasStatIcon(slug: string): boolean {
	const concept = STAT_CONCEPT[slug];
	return concept !== undefined && concept in MARKS;
}

/** Inert markup for a stat's glyph — render with `{@html}`. */
export function statIcon(slug: string): string {
	const concept = STAT_CONCEPT[slug];
	return (concept && MARKS[concept]) ?? unknownStat;
}

/** The concepts this module draws, for the test that checks the map against it. */
export const STAT_CONCEPTS: string[] = Object.keys(MARKS);
