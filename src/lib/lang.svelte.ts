/**
 * Display language, persisted to `sz:lang`.
 *
 * Every upstream string ships in all five languages, so this is a display
 * choice rather than a route: there is one page per item, not five, and no
 * /fr/ prefix to keep in sync. The trade is that the prerendered HTML is
 * always English and non-English visitors see it swap on hydration. That is
 * the right way round — the alternative is five times the pages for a
 * database whose primary keys are English weapon designations anyway.
 */

import { LANGS, type Lang } from './types.ts';

const KEY = 'sz:lang';

function isLang(v: unknown): v is Lang {
	return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}

/** The server has no visitor to ask, so it renders English. */
let current = $state<Lang>('en');

export function lang(): Lang {
	return current;
}

/**
 * A stored choice wins; otherwise take the first of the browser's preferences
 * this site can actually serve. `navigator.languages` is ordered by preference
 * and its entries carry regions ("fr-CA"), so match on the primary subtag.
 */
export function readStoredLang(): void {
	let next: Lang = 'en';
	try {
		const stored = localStorage.getItem(KEY);
		if (isLang(stored)) {
			apply(stored);
			return;
		}
	} catch {
		// private mode, or storage disabled — fall through to the browser's list
	}
	for (const tag of navigator.languages ?? [navigator.language]) {
		const primary = tag.toLowerCase().split('-')[0];
		if (isLang(primary)) {
			next = primary;
			break;
		}
	}
	apply(next);
}

function apply(next: Lang): void {
	current = next;
	// the attribute drives hyphenation, quotation marks and screen-reader voice
	document.documentElement.lang = next;
}

export function setLang(next: Lang): void {
	apply(next);
	try {
		localStorage.setItem(KEY, next);
	} catch {
		// as above: the choice just won't outlive the tab
	}
}

/** How each language names itself — never translated, by convention. */
export const LANG_LABEL: Record<Lang, string> = {
	en: 'English',
	ru: 'Русский',
	fr: 'Français',
	es: 'Español',
	ko: '한국어'
};
