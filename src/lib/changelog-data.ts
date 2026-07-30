/**
 * Build-time changelog data (Vite glob imports — not loadable by plain
 * node:test; the vocabulary lives in changelog.ts and the parser in
 * `sveltekit-commons/changelog`, both of which are).
 *
 * Importing this pulls every entry's prose into the chunk, so keep it to the
 * /changelog route and the overview page's rail. Anything that only wants the
 * version number should glob release.json on its own and use
 * `latestVersionInfo` — that is a few hundred bytes rather than the lot.
 */
import { buildChangelog } from 'sveltekit-commons/changelog';
import { CHANGELOG_SCHEMA, type Release } from './changelog.ts';

const entryFiles = import.meta.glob('/changelog/v*/*.md', {
	eager: true,
	query: '?raw',
	import: 'default'
}) as Record<string, string>;

const releaseFiles = import.meta.glob('/changelog/v*/release.json', {
	eager: true,
	import: 'default'
}) as Record<string, { date?: string }>;

export const releases: Release[] = buildChangelog(entryFiles, releaseFiles, CHANGELOG_SCHEMA);
export const latestRelease: Release | null = releases[0] ?? null;
