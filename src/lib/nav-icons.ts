/**
 * Feather-style stroke icons for the sidebar, in the same visual language the
 * UAR site uses. Strings rather than components because they are inert markup
 * and a component each would be seven files saying `<svg>`.
 */

const icon = (paths: string): string =>
	`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ` +
	`stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const homeIcon = icon(
	'<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'
);

/* concentric arcs over a dot — a blast front, not a radiation trefoil, which
   reads as "hazard" in general rather than "the sky is about to kill you" */
export const emissionIcon = icon(
	'<path d="M12 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M6.5 13.5a7 7 0 0 1 11 0"/><path d="M3.5 9.5a11 11 0 0 1 17 0"/>'
);

/* a magnifier — the row is a searchable table of everything, not a list of
   links, so the glyph promises a query rather than a catalogue */
export const searchIcon = icon(
	'<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'
);

export const itemsIcon = icon(
	'<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>'
);

/* the same speech bubble UAR's feedback row uses — the two sites share the
   form, so they may as well share the glyph that leads to it */
export const feedbackIcon = icon(
	'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'
);

/* a dog-eared page with two ruled lines — the same glyph UAR puts on its
   changelog row, for the same reason as the bubble above: the two sites share
   the convention, the parser and the widget, so the row should look the same
   in both */
export const changelogIcon = icon(
	'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
		'<polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>' +
		'<line x1="16" y1="17" x2="8" y2="17"/>'
);

/* a torso with two artefact slots beside it — a loadout, rather than the
   calculator's arithmetic: the page is about what you wear, and the sums are
   only how it answers */
export const buildsIcon = icon(
	'<path d="M9 3h6l3 3v6a6 6 0 0 1-6 6 6 6 0 0 1-6-6V6z"/><circle cx="12" cy="10" r="1.6"/>' +
		'<path d="M9 21h6"/>'
);

/* one node on the left branching into two on the right — the tech tree's own
   shape, which is what the page shows */
export const techTreeIcon = icon(
	'<circle cx="5" cy="12" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="19" cy="18" r="2"/>' +
		'<path d="M7 12h3a2 2 0 0 0 2-2V8a2 2 0 0 1 2-2h3"/><path d="M7 12h3a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h3"/>'
);

/* a workbench: a bench top on two legs with a tool lying on it. The mortar and
   pestle that was here named one bench of the three — and the tab covers the
   workbench, the laboratory table and the kitchen table, so the glyph has to be
   the idea of a bench rather than any one of them. The tool is what stops a
   bare table reading as furniture, which this database also sells. */
export const craftIcon = icon(
	// bench top, two legs, and a hammer lying on it — head to the right so the
	// silhouette is not symmetrical, which is what stops it reading as a shelf
	'<path d="M2.5 12h19"/><path d="M6 12v8"/><path d="M18 12v8"/>' +
		'<path d="M6.5 8.5h7.5"/><path d="M14 6.5h4.5v4H14z"/>'
);

/* --- the entity page's own tabs ------------------------------------------ */

/* an index card: the sheet the rest of the tabs hang off. A document rather
   than an "i" in a circle, which reads as a tooltip and not as a page. */
export const overviewIcon = icon(
	'<path d="M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>' +
		'<line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/>' +
		'<line x1="8" y1="16" x2="13" y2="16"/>'
);

/* a price line over an axis — the tab is a chart of what the lot goes for, so
   the glyph is that chart. A gavel would name the venue rather than the page,
   and at 16px it is indistinguishable from a hammer, i.e. from crafting. */
export const auctionIcon = icon(
	'<polyline points="4 20 4 4"/><polyline points="4 20 20 20"/>' +
		'<polyline points="7 15 11 10 14 13 19 6"/>'
);

/* three nodes converging into one — the mirror of techTreeIcon, which
   branches. That is the actual difference between the two trees: a barter line
   fans out into what you can upgrade to, a craft chain funnels parts into one
   finished thing, and the glyphs say which you are about to read. */
export const craftTreeIcon = icon(
	'<circle cx="5" cy="5.5" r="2"/><circle cx="5" cy="18.5" r="2"/><circle cx="19" cy="12" r="2"/>' +
		'<path d="M7 5.5h3a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h3"/>' +
		'<path d="M7 18.5h3a2 2 0 0 0 2-2v-3a2 2 0 0 1 2-2h3"/>'
);

/* a paint roller on its tray — the tab is paints and camo, so the glyph is the
   act of applying one. Not a palette: at 16px the thumb hole closes and it is a
   circle with dots, which reads as anything at all. */
export const cosmeticsIcon = icon(
	'<rect x="3" y="3" width="12" height="6" rx="1"/><path d="M15 6h3a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-7"/>' +
		'<rect x="9.5" y="15" width="5" height="6" rx="1"/><path d="M12 12v3"/>'
);

/* a wireframe cube — the tab is geometry you can turn, and the visible back
   edges are what say "this is a mesh" rather than the solid box the Items row
   already uses for a crate. */
export const modelIcon = icon(
	'<path d="M12 2.5 21 7v10l-9 4.5L3 17V7z"/><path d="M3 7l9 4.5L21 7"/><path d="M12 11.5v10"/>'
);

/* two links of a chain — what fits what. Not a puzzle piece: at this size the
   notches close up and it turns into a blob. */
export const compatibleIcon = icon(
	'<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/>' +
		'<path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'
);
