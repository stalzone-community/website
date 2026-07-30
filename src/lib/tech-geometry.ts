/**
 * Card geometry for a tech tree — the numbers the layout, the router and the
 * component must all agree on.
 *
 * Its own module because three places need them and they cannot disagree: the
 * route measures boxes to hand to grid-router, the component absolutely
 * positions the same boxes, and the canvas size is derived from both. A
 * constant duplicated into a stylesheet is a rendering bug waiting for the
 * first person who tunes one of them.
 *
 * The pitches are DERIVED from `corridorGaps(res)` rather than picked by eye.
 * That is grid-router's layout-side contract: the router can only use free
 * cells, and it is the layout that decides how many exist. Tight rows route
 * fine today — the trees are sparse — but a game patch that widens a tier
 * would silently start producing lane-sharing violations. Deriving them means
 * the layout cannot drift out of contract, and the route asserts violations
 * are zero at build time so it fails loudly if it ever does.
 */
import { corridorGaps } from 'grid-router';

/** Grid cell size. 6px is the finest of the validated range, which buys the
 *  narrowest corridors and so the most compact tree. */
export const RES = 6;

const gaps = corridorGaps(RES);

export const CARD_W = 212;
export const CARD_H = 58;

/**
 * The icon cell is square and exactly as tall as the card: it butts against the
 * card's top, bottom and left edges with no gap, the way an inventory slot
 * does. The card therefore carries no padding of its own — the text does, or
 * the art would float in the middle of a box instead of filling its cell.
 */
export const ICON = CARD_H;

/** Wider than the contract's minimum: a tier gap also has to hold a readable
 *  amount of white space, and 18px of it reads as a rendering mistake. */
export const COL_PITCH = CARD_W + Math.max(gaps.chipGap, 64);
export const ROW_PITCH = CARD_H + gaps.rowGap;
export const PAD = Math.max(gaps.sidePad, 16);

export function canvasSize(columns: number, rows: number): { width: number; height: number } {
	return {
		width: PAD * 2 + (columns - 1) * COL_PITCH + CARD_W,
		height: PAD * 2 + (rows - 1) * ROW_PITCH + CARD_H
	};
}

/**
 * Where a card sits, drawn RIGHT TO LEFT: column 0 — the tier you start from —
 * is on the right, and the line runs leftwards towards what you upgrade into.
 *
 * Mirrored here rather than in `layoutTree`, and that is the point. The layout
 * is the semantics — column 0 is the base tier, depth is the longest path — and
 * the tests pin it as such. This is the drawing, and the two consumers that
 * have to agree on it (the router measuring boxes, the component positioning
 * them) both come through this function, so neither can drift.
 *
 * `columns` is the tree's own width, which is why it is a parameter: a card's
 * x depends on how many tiers are to its right, so the same column in a
 * four-tier tree and a seven-tier one lands in different places.
 */
export function cardLeft(column: number, columns: number): number {
	return PAD + (columns - 1 - column) * COL_PITCH;
}

export function cardTop(row: number): number {
	return PAD + row * ROW_PITCH;
}
