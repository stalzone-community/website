/**
 * Theme choice, persisted to `sz:theme`.
 *
 * The value written here is read back by the inline script in app.html on the
 * next load, before the first paint — anything later and the page flashes the
 * other palette. This module only has to agree with that script on the key and
 * on what the two stored values mean.
 *
 * `system` is the absence of a stored choice, not a third stored value: it
 * clears the attribute and lets `color-scheme` and the `prefers-color-scheme`
 * block in palette.css decide, which is also what a first-time visitor gets.
 */

export type Theme = 'system' | 'light' | 'dark';

const KEY = 'sz:theme';

/** Every page is prerendered, so this starts at the server's answer and is
 *  corrected on mount — before then there is no localStorage to read. */
let current = $state<Theme>('system');

export function theme(): Theme {
	return current;
}

/** Adopt whatever app.html already stamped on the root. Call once, on mount. */
export function readStoredTheme(): void {
	const stamped = document.documentElement.dataset.theme;
	current = stamped === 'light' || stamped === 'dark' ? stamped : 'system';
}

export function setTheme(next: Theme): void {
	current = next;
	if (next === 'system') {
		delete document.documentElement.dataset.theme;
		try {
			localStorage.removeItem(KEY);
		} catch {
			// private mode, or storage disabled: the choice just won't outlive the tab
		}
	} else {
		document.documentElement.dataset.theme = next;
		try {
			localStorage.setItem(KEY, next);
		} catch {
			// as above
		}
	}
}

const ORDER: Theme[] = ['system', 'light', 'dark'];

export function cycleTheme(): void {
	setTheme(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]);
}
