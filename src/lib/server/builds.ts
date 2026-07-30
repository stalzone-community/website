/**
 * Published builds, in Mongo.
 *
 * The one part of the calculator that needs a database: a build itself is fully
 * described by its URL, so storage exists for the things a URL cannot do —
 * being listed, being owned, and being voted on.
 *
 * READ DISCIPLINE. This is the free Atlas tier, which throttles on *bytes
 * returned* (see db.ts). Every read here takes a projection, the list page
 * never returns whole documents, and the vote count is denormalised onto the
 * build so rendering a list of twenty builds is one query rather than twenty-one.
 *
 * Votes are their own collection with a unique index rather than an array on
 * the build: an array grows without bound inside a document that is read on
 * every list page, and "has this person already voted" becomes a scan of it.
 */
import type { Collection, Document } from 'mongodb';
import { db } from './db.ts';
import {
	normaliseDraft,
	type DraftBuild,
	type PublishedBuild,
	type Visibility
} from '../calc/publish.ts';
import type { User } from './session.ts';

interface BuildDoc extends Document {
	slug: string;
	name: string;
	query: string;
	tags: string[];
	visibility: Visibility;
	author: { id: string; name: string };
	votes: number;
	createdAt: Date;
	updatedAt: Date;
}

interface VoteDoc extends Document {
	slug: string;
	user: string;
	at: Date;
}

async function builds(): Promise<Collection<BuildDoc>> {
	return (await db()).collection<BuildDoc>('builds');
}

async function votes(): Promise<Collection<VoteDoc>> {
	return (await db()).collection<VoteDoc>('build_votes');
}

/** What a list row needs, and nothing else. `query` is included because the
 *  card shows a summary computed from it — it is ~80 bytes, far less than a
 *  second round trip per row would cost. */
const LIST_FIELDS = {
	_id: 0,
	slug: 1,
	name: 1,
	query: 1,
	tags: 1,
	visibility: 1,
	author: 1,
	votes: 1,
	createdAt: 1,
	updatedAt: 1
} as const;

function toBuild(doc: BuildDoc): PublishedBuild {
	return {
		slug: doc.slug,
		name: doc.name,
		query: doc.query,
		tags: doc.tags ?? [],
		visibility: doc.visibility,
		author: doc.author,
		votes: doc.votes ?? 0,
		createdAt: doc.createdAt?.getTime() ?? 0,
		updatedAt: doc.updatedAt?.getTime() ?? 0
	};
}

/** 10 base-36 characters — see `isSlug` in $lib/calc/publish for why random. */
function newSlug(): string {
	let out = '';
	for (let i = 0; i < 10; i++) out += Math.floor(Math.random() * 36).toString(36);
	return out;
}

export type SortKey = 'top' | 'new';

export interface ListOptions {
	sort?: SortKey;
	tag?: string | null;
	limit?: number;
	skip?: number;
}

/** The public list. Private builds are not here under any sort or filter. */
export async function listPublic({
	sort = 'top',
	tag = null,
	limit = 20,
	skip = 0
}: ListOptions = {}): Promise<PublishedBuild[]> {
	const c = await builds();
	const filter: Document = { visibility: 'public' };
	if (tag) filter.tags = tag;

	const order: Document = sort === 'new' ? { createdAt: -1 } : { votes: -1, createdAt: -1 };

	const rows = await c
		.find(filter, { projection: LIST_FIELDS })
		.sort(order)
		.skip(Math.max(0, skip))
		.limit(Math.min(50, Math.max(1, limit)))
		.toArray();
	return rows.map(toBuild);
}

/** Everything one account has published, public and private alike. */
export async function listMine(user: User): Promise<PublishedBuild[]> {
	const c = await builds();
	const rows = await c
		.find({ 'author.id': user.id }, { projection: LIST_FIELDS })
		.sort({ updatedAt: -1 })
		.limit(100)
		.toArray();
	return rows.map(toBuild);
}

/**
 * One build by slug.
 *
 * A private build answers only to its owner — the slug is unguessable, but
 * "unguessable" is not the same promise as "private", and the visitor asked for
 * the second one.
 */
export async function getBuild(slug: string, viewer: User | null): Promise<PublishedBuild | null> {
	const c = await builds();
	const doc = await c.findOne({ slug }, { projection: LIST_FIELDS });
	if (!doc) return null;
	const build = toBuild(doc);
	if (build.visibility === 'private' && build.author.id !== viewer?.id) return null;
	return build;
}

/** Has this viewer already voted for these builds? One query for the page. */
export async function votedSlugs(user: User | null, slugs: string[]): Promise<Set<string>> {
	if (!user || slugs.length === 0) return new Set();
	const c = await votes();
	const rows = await c
		.find({ user: user.id, slug: { $in: slugs } }, { projection: { _id: 0, slug: 1 } })
		.toArray();
	return new Set(rows.map((r) => r.slug));
}

export interface SaveResult {
	build: PublishedBuild;
	created: boolean;
}

/**
 * Create a build, or update one the caller owns.
 *
 * The update path matches on author as well as slug, so a request naming
 * someone else's slug writes nothing rather than being rejected on a separately
 * fetched document — one round trip, and no window between the check and the
 * write.
 */
export async function saveBuild(
	user: User,
	draft: DraftBuild,
	slug?: string
): Promise<SaveResult | null> {
	const c = await builds();
	const clean = normaliseDraft(draft);
	const now = new Date();

	if (slug) {
		const updated = await c.findOneAndUpdate(
			{ slug, 'author.id': user.id },
			{
				$set: {
					name: clean.name,
					query: clean.query,
					tags: clean.tags,
					visibility: clean.visibility,
					// the name follows the account, so a rename upstream is not
					// frozen into every build ever published
					'author.name': user.name,
					updatedAt: now
				}
			},
			{ projection: LIST_FIELDS, returnDocument: 'after' }
		);
		return updated ? { build: toBuild(updated), created: false } : null;
	}

	const doc: BuildDoc = {
		slug: newSlug(),
		...clean,
		author: { id: user.id, name: user.name },
		votes: 0,
		createdAt: now,
		updatedAt: now
	};
	await c.insertOne(doc);
	return { build: toBuild(doc), created: true };
}

export async function deleteBuild(user: User, slug: string): Promise<boolean> {
	const c = await builds();
	const result = await c.deleteOne({ slug, 'author.id': user.id });
	if (!result.deletedCount) return false;
	// votes for a build that no longer exists are just rows nobody can reach
	await (await votes()).deleteMany({ slug });
	return true;
}

export interface VoteResult {
	votes: number;
	voted: boolean;
}

/**
 * Toggle one account's vote.
 *
 * The unique index on {slug, user} is what actually enforces one vote per
 * account; the insert either takes or throws a duplicate-key error, and the
 * counter only moves when the guard row did. Doing it the other way round —
 * `$inc` first, then record the vote — double-counts under a double click.
 */
export async function toggleVote(user: User, slug: string): Promise<VoteResult | null> {
	const c = await builds();
	const v = await votes();

	const build = await c.findOne(
		{ slug, visibility: 'public' },
		{ projection: { _id: 0, votes: 1 } }
	);
	if (!build) return null;

	const removed = await v.deleteOne({ slug, user: user.id });
	let voted: boolean;

	if (removed.deletedCount) {
		voted = false;
	} else {
		try {
			await v.insertOne({ slug, user: user.id, at: new Date() });
			voted = true;
		} catch (err) {
			// two clicks got past the delete together; the index caught the second,
			// and the first already recorded the vote
			if ((err as { code?: number }).code !== 11000) throw err;
			voted = true;
		}
	}

	// Recount rather than `$inc`. The guard rows are the truth and the counter is
	// a cache of them, so deriving it cannot drift — and it *would* drift under
	// `$inc`: between one request's delete and its decrement, another request can
	// insert, and both then adjust a number neither of them read. A count over the
	// unique index for one slug is cheap; a wrong vote total is not.
	const total = await v.countDocuments({ slug });
	await c.updateOne({ slug }, { $set: { votes: total } });
	return { votes: total, voted };
}
