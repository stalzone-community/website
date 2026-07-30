/**
 * Release in one step: roll changelog/unreleased/ entries into a version
 * folder, commit (pathspec-limited to changelog/, so unrelated WIP is never
 * swept in), tag, and push main + tag.
 *
 * Usage:  npm run release v0.2.0
 *
 * Deploying is data-update.yml's job, on the tag — nothing here touches Fly.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseEntry } from 'sveltekit-commons/changelog';
import { CHANGELOG_SCHEMA } from '../src/lib/changelog.ts';

function git(...args: string[]): string {
	return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const version = process.argv[2] ?? '';
if (!/^v\d+\.\d+\.\d+$/.test(version)) {
	console.error('Usage: npm run release vX.Y.Z');
	process.exit(1);
}

git('fetch', '--tags', '--quiet', 'origin');
if (git('tag', '-l', version)) {
	console.error(`Tag ${version} already exists — pick the next version (check \`git tag\`).`);
	process.exit(1);
}
const dir = join('changelog', version);
if (existsSync(dir)) {
	console.error(`${dir} already exists.`);
	process.exit(1);
}

// Move only tracked entries: an uncommitted entry belongs to unfinished work
// and must stay in unreleased/.
const tracked = git('ls-files', '--', 'changelog/unreleased')
	.split('\n')
	.filter((f) => f.endsWith('.md') && basename(f) !== 'README.md');
if (!tracked.length) {
	console.error('No tracked entries in changelog/unreleased/ — nothing to release.');
	process.exit(1);
}
const untracked = git('ls-files', '--others', '--exclude-standard', '--', 'changelog/unreleased')
	.split('\n')
	.filter(Boolean);
if (untracked.length) {
	console.warn(`Leaving uncommitted entries behind (unfinished work?):\n  ${untracked.join('\n  ')}`);
}

mkdirSync(dir);
// notable = non-minor entries. Anything reading release.json alone (a version
// badge, say) uses this to decide whether a release is worth pointing at.
let notable = 0;
for (const f of tracked) {
	if (parseEntry(readFileSync(f, 'utf8'), CHANGELOG_SCHEMA).impact !== 'minor') notable++;
	git('mv', f, join(dir, basename(f)));
}
const date = new Date().toISOString().slice(0, 10);
writeFileSync(join(dir, 'release.json'), JSON.stringify({ date, notable }) + '\n');
git('add', '--', join(dir, 'release.json'));
execFileSync('git', ['commit', '-m', `Release ${version}: changelog rollup`, '--', 'changelog'], {
	stdio: 'inherit'
});

git('tag', version);
execFileSync('git', ['push', 'origin', 'main', version], { stdio: 'inherit' });

console.log(`\n${version}: ${tracked.length} entr${tracked.length === 1 ? 'y' : 'ies'} rolled up, tagged, pushed.`);
