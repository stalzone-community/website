/**
 * Vendors EXBO's item database into ./vendor/stalzone-database.
 *
 * Upstream pushes on game patches — 75 of the last 100 commits were Wednesday,
 * but patch days push several commits hours apart and hotfixes land Thu/Fri. So
 * this syncs on *commit SHA*, not on a schedule: run it as often as you like and
 * it no-ops until upstream actually moves. That makes it safe to cron daily and
 * safe to re-run by hand mid-patch.
 *
 *   node scripts/vendor-db.ts            # sync if upstream moved
 *   node scripts/vendor-db.ts --force    # re-clone even if unchanged
 *   node scripts/vendor-db.ts --check    # exit 0 if up to date, 10 if stale
 *
 * Exit codes: 0 = up to date / synced, 10 = stale (--check only), 1 = error.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = join(ROOT, 'vendor', 'stalzone-database');
const LOCK = join(ROOT, 'src', 'lib', 'data', 'db-source.json');

const REPO = 'https://github.com/EXBO-Studio/stalzone-database.git';
const API = 'https://api.github.com/repos/EXBO-Studio/stalzone-database';
const BRANCH = 'main';

const force = process.argv.includes('--force');
const checkOnly = process.argv.includes('--check');

export interface DbSource {
	/** upstream commit the generated data was built from */
	sha: string;
	/** when EXBO pushed it */
	committedAt: string;
	/** when we last vendored it */
	fetchedAt: string;
}

function git(args: string[], cwd = VENDOR): string {
	return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function readLock(): DbSource | null {
	if (!existsSync(LOCK)) return null;
	try {
		return JSON.parse(readFileSync(LOCK, 'utf8')) as DbSource;
	} catch {
		return null;
	}
}

/** Latest upstream commit, without cloning. Unauthenticated is fine (60 req/h). */
async function upstreamHead(): Promise<{ sha: string; committedAt: string }> {
	const headers: Record<string, string> = { accept: 'application/vnd.github+json' };
	if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

	const res = await fetch(`${API}/commits/${BRANCH}`, { headers });
	if (!res.ok) throw new Error(`GitHub API ${res.status} ${res.statusText}`);
	const body = (await res.json()) as {
		sha: string;
		commit: { committer: { date: string } };
	};
	return { sha: body.sha, committedAt: body.commit.committer.date };
}

function sync(sha: string): void {
	mkdirSync(dirname(VENDOR), { recursive: true });

	// A shallow clone that we keep shallow: the history is one "Update: <date>"
	// commit per patch and we never need any of it, only the current tree.
	if (!existsSync(join(VENDOR, '.git'))) {
		if (existsSync(VENDOR)) rmSync(VENDOR, { recursive: true, force: true });
		console.log(`[vendor] cloning ${REPO} (shallow)`);
		execFileSync('git', ['clone', '--depth', '1', '--branch', BRANCH, REPO, VENDOR], {
			stdio: 'inherit'
		});
	} else {
		console.log('[vendor] fetching');
		git(['fetch', '--depth', '1', 'origin', BRANCH]);
		// reset --hard, not merge: upstream is generated and force-pushes are
		// plausible; we have no local commits worth preserving.
		git(['reset', '--hard', `origin/${BRANCH}`]);
		git(['clean', '-fd']);
	}

	const got = git(['rev-parse', 'HEAD']);
	if (got !== sha) {
		console.warn(`[vendor] warning: expected ${sha.slice(0, 8)}, cloned ${got.slice(0, 8)} — upstream moved mid-sync`);
	}
}

const head = await upstreamHead();
const lock = readLock();
const haveTree = existsSync(join(VENDOR, 'global', 'listing.json'));
const current = lock?.sha === head.sha && haveTree;

if (checkOnly) {
	if (current) {
		console.log(`[vendor] up to date (${head.sha.slice(0, 8)})`);
		process.exit(0);
	}
	console.log(`[vendor] stale — upstream at ${head.sha.slice(0, 8)} (${head.committedAt}), local ${lock?.sha?.slice(0, 8) ?? 'none'}`);
	process.exit(10);
}

if (current && !force) {
	console.log(`[vendor] up to date (${head.sha.slice(0, 8)}, pushed ${head.committedAt}) — nothing to do`);
	process.exit(0);
}

sync(head.sha);

mkdirSync(dirname(LOCK), { recursive: true });
const next: DbSource = {
	sha: head.sha,
	committedAt: head.committedAt,
	fetchedAt: new Date().toISOString()
};
writeFileSync(LOCK, JSON.stringify(next, null, '\t') + '\n');

console.log(`[vendor] synced ${head.sha.slice(0, 8)} (pushed ${head.committedAt})`);
console.log('[vendor] next: npm run db:build');
