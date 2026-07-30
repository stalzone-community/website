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

interface Head {
	sha: string;
	committedAt: string;
}

/**
 * Latest upstream commit, without cloning.
 *
 * Returns null when the API cannot answer rather than throwing, because the
 * answer is only ever an OPTIMISATION: it decides whether a sync can be skipped.
 * When there is nothing to skip — a fresh tree, or --force — git itself is the
 * authority on what HEAD is, and `headFromClone` reads it back afterwards.
 *
 * Unauthenticated is 60 req/h PER IP, which is fine on a developer machine and
 * not fine on a shared CI or build IP. The Fly remote builder is exactly that:
 * no GITHUB_TOKEN reaches the image build, the shared address is already over
 * quota, and this 403'd on every deploy while the clone underneath it would
 * have worked perfectly.
 */
async function upstreamHead(): Promise<Head | null> {
	const headers: Record<string, string> = { accept: 'application/vnd.github+json' };
	if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

	try {
		const res = await fetch(`${API}/commits/${BRANCH}`, { headers });
		if (!res.ok) {
			console.warn(`[vendor] GitHub API ${res.status} ${res.statusText} — falling back to git`);
			return null;
		}
		const body = (await res.json()) as {
			sha: string;
			commit: { committer: { date: string } };
		};
		return { sha: body.sha, committedAt: body.commit.committer.date };
	} catch (err) {
		console.warn(`[vendor] GitHub API unreachable (${(err as Error).message}) — falling back to git`);
		return null;
	}
}

/** What we actually cloned, straight out of the working tree. */
function headFromClone(): Head {
	return {
		sha: git(['rev-parse', 'HEAD']),
		committedAt: git(['log', '-1', '--format=%cI'])
	};
}

function sync(sha: string | null): void {
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
	if (sha && got !== sha) {
		console.warn(`[vendor] warning: expected ${sha.slice(0, 8)}, cloned ${got.slice(0, 8)} — upstream moved mid-sync`);
	}
}

const head = await upstreamHead();
const lock = readLock();
const haveTree = existsSync(join(VENDOR, 'global', 'listing.json'));
const current = head !== null && lock?.sha === head.sha && haveTree;

if (checkOnly) {
	// --check is a pure question — "has upstream moved?" — and cloning to answer
	// it would defeat the point (data-update.yml probes this several times a
	// patch day precisely because it is one cheap API call). With no answer
	// available there is nothing honest to report, so fail rather than claim
	// either state: a false "up to date" silently stops shipping game patches.
	if (!head) {
		console.error('[vendor] --check needs the GitHub API, which did not answer. Set GITHUB_TOKEN to lift the 60 req/h anonymous limit.');
		process.exit(1);
	}
	if (current) {
		console.log(`[vendor] up to date (${head.sha.slice(0, 8)})`);
		process.exit(0);
	}
	console.log(`[vendor] stale — upstream at ${head.sha.slice(0, 8)} (${head.committedAt}), local ${lock?.sha?.slice(0, 8) ?? 'none'}`);
	process.exit(10);
}

if (current && !force) {
	console.log(`[vendor] up to date (${head!.sha.slice(0, 8)}, pushed ${head!.committedAt}) — nothing to do`);
	process.exit(0);
}

sync(head?.sha ?? null);

// Prefer what git actually gave us over what the API promised: the clone is the
// thing the build was made from, and when the API stayed silent it is the only
// record of it.
const synced = head ?? headFromClone();

mkdirSync(dirname(LOCK), { recursive: true });
const next: DbSource = {
	sha: synced.sha,
	committedAt: synced.committedAt,
	fetchedAt: new Date().toISOString()
};
writeFileSync(LOCK, JSON.stringify(next, null, '\t') + '\n');

console.log(`[vendor] synced ${synced.sha.slice(0, 8)} (pushed ${synced.committedAt})`);
console.log('[vendor] next: npm run db:build');
