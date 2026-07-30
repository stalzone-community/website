/**
 * Builds saved on this device.
 *
 * Local storage is the draft shelf: it needs no account, works offline, and
 * holds exactly what the server holds — the encoded query string from
 * `codec.ts` — so publishing is an upload rather than a migration.
 *
 * An entry that has been published also remembers its `slug` and `visibility`.
 * That pair is what lets the list say whether a build is local-only, private on
 * the account, or public — and it is only ever a cache of what the server said
 * last: `/api/builds/mine` is the truth, and `reconcile()` folds it back in.
 *
 * Deliberately not a store of `BuildState`: the query string is the format that
 * already round-trips, already clamps hostile input, and is already tested.
 */

import type { PublishedBuild, Visibility } from './publish.ts';

const KEY = 'sz:builds';
const LIMIT = 60;

export interface SavedBuild {
	/** stable id on this device, also the key for updates */
	id: string;
	name: string;
	/** the encoded build, exactly as it appears after `?` in a share link */
	query: string;
	/** epoch millis */
	savedAt: number;
	/** set once the build has been published; the server's id for it */
	slug?: string;
	visibility?: Visibility;
	/** epoch millis of the last successful upload */
	syncedAt?: number;
}

/** Local-only, or on the account and how visible. Drives the status chip. */
export type SyncState = 'local' | 'private' | 'public';

export function syncState(b: SavedBuild): SyncState {
	if (!b.slug) return 'local';
	return b.visibility === 'private' ? 'private' : 'public';
}

/** Loaded by `loadSavedBuilds()`, then kept in sync by the mutators. */
let builds = $state<SavedBuild[]>([]);
let loaded = false;

function read(): SavedBuild[] {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		// a hand-edited or half-written entry must not take the whole list down
		return parsed.filter(
			(b): b is SavedBuild =>
				Boolean(b) &&
				typeof b === 'object' &&
				typeof (b as SavedBuild).id === 'string' &&
				typeof (b as SavedBuild).name === 'string' &&
				typeof (b as SavedBuild).query === 'string' &&
				typeof (b as SavedBuild).savedAt === 'number'
		);
	} catch {
		return [];
	}
}

function write(next: SavedBuild[]): void {
	builds = next;
	try {
		localStorage.setItem(KEY, JSON.stringify(next));
	} catch {
		// storage disabled or full — the list still works for this session
	}
}

/**
 * Pull the list out of storage. Call once, from `onMount`.
 *
 * Explicit rather than lazily on first read, because the first read is
 * invariably from a `$derived` or a template — and a getter that assigns to
 * `$state` from inside one is a `state_unsafe_mutation` error that takes
 * hydration down with it.
 */
export function loadSavedBuilds(): void {
	if (loaded || typeof localStorage === 'undefined') return;
	builds = read().sort((a, b) => b.savedAt - a.savedAt);
	loaded = true;
}

/** Newest first. Empty until `loadSavedBuilds()` has run. */
export function savedBuilds(): SavedBuild[] {
	return builds;
}

function newId(): string {
	// enough to not collide on one device; the server will assign the real slug
	return Math.random().toString(36).slice(2, 10);
}

/** Saves a new build, or overwrites `id` when given one. Returns the entry. */
export function saveBuild(name: string, query: string, id?: string): SavedBuild {
	const list = [...savedBuilds()];
	const entry: SavedBuild = {
		id: id ?? newId(),
		name: name.trim() || 'Untitled build',
		query,
		savedAt: Date.now()
	};
	const at = list.findIndex((b) => b.id === entry.id);
	if (at >= 0) list[at] = entry;
	else list.unshift(entry);
	write(list.sort((a, b) => b.savedAt - a.savedAt).slice(0, LIMIT));
	return entry;
}

export function deleteBuild(id: string): void {
	write(savedBuilds().filter((b) => b.id !== id));
}

export function renameBuild(id: string, name: string): void {
	const list = savedBuilds().map((b) => (b.id === id ? { ...b, name: name.trim() || b.name } : b));
	write(list);
}

/** Record what the server said after a publish, so the row can show it. */
export function linkRemote(id: string, remote: PublishedBuild): void {
	write(
		savedBuilds().map((b) =>
			b.id === id
				? {
						...b,
						name: remote.name,
						query: remote.query,
						slug: remote.slug,
						visibility: remote.visibility,
						syncedAt: Date.now()
					}
				: b
		)
	);
}

/** Forget the server side of an entry — after an unpublish, or a 404. */
export function unlinkRemote(id: string): void {
	write(
		savedBuilds().map((b) => {
			if (b.id !== id) return b;
			const { slug: _slug, visibility: _visibility, syncedAt: _syncedAt, ...rest } = b;
			return rest;
		})
	);
}

/**
 * Fold the account's builds into this device's list.
 *
 * Two directions, because the two disagree in two different ways. A build
 * published from another browser is not here at all, so it is added. A build
 * here that the server no longer has — deleted elsewhere — keeps its contents
 * and loses its slug, rather than vanishing from under someone who still has it
 * open.
 */
export function reconcile(remote: PublishedBuild[]): void {
	const bySlug = new Map(remote.map((r) => [r.slug, r]));
	const seen = new Set<string>();

	const merged: SavedBuild[] = savedBuilds().map((b) => {
		if (!b.slug) return b;
		const match = bySlug.get(b.slug);
		if (!match) {
			const { slug: _slug, visibility: _visibility, syncedAt: _syncedAt, ...rest } = b;
			return rest;
		}
		seen.add(b.slug);
		return {
			...b,
			name: match.name,
			query: match.query,
			visibility: match.visibility,
			syncedAt: match.updatedAt
		};
	});

	for (const r of remote) {
		if (seen.has(r.slug)) continue;
		merged.push({
			id: newId(),
			name: r.name,
			query: r.query,
			savedAt: r.updatedAt,
			slug: r.slug,
			visibility: r.visibility,
			syncedAt: r.updatedAt
		});
	}

	write(merged.sort((a, b) => b.savedAt - a.savedAt).slice(0, LIMIT));
}
