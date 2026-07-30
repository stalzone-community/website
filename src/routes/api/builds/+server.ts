/**
 * Publishing and syncing a build.
 *
 * POST creates one, or updates one the caller owns when a slug is supplied —
 * which is also how "make this public" and "make this private" travel, since
 * visibility is just another field of the same document.
 *
 * 401 rather than a redirect on a missing session: the caller is the Publish
 * dialog, and what it does about being signed out is show the connect prompt,
 * not navigate away and lose the build.
 */
import { json } from '@sveltejs/kit';
import { saveBuild } from '$lib/server/builds';
import { dbConfigured } from '$lib/server/db';
import { currentUser } from '$lib/server/session';
import { isSlug, isVisibility, validateDraft } from '$lib/calc/publish';
import type { RequestHandler } from './$types.ts';

export const prerender = false;

export const POST: RequestHandler = async ({ cookies, request }) => {
	const user = currentUser(cookies);
	if (!user) return json({ error: 'sign-in-required' }, { status: 401 });
	if (!dbConfigured()) return json({ error: 'storage-unavailable' }, { status: 503 });

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ error: 'bad-request' }, { status: 400 });
	}

	const draft = {
		name: typeof body.name === 'string' ? body.name : '',
		query: typeof body.query === 'string' ? body.query : '',
		tags: Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === 'string') : [],
		visibility: isVisibility(body.visibility) ? body.visibility : 'public'
	};

	const errors = validateDraft(draft);
	if (errors.length) return json({ error: 'invalid', errors }, { status: 422 });

	const slug = typeof body.slug === 'string' && isSlug(body.slug) ? body.slug : undefined;
	const result = await saveBuild(user, draft, slug);
	// null means the slug exists but belongs to someone else, or not at all —
	// the same answer either way, so the caller learns nothing about it
	if (!result) return json({ error: 'not-found' }, { status: 404 });

	return json({ build: result.build }, { status: result.created ? 201 : 200 });
};
