/**
 * What a publishable build is allowed to be (node:test, `npm test`).
 *
 * The server runs exactly these functions on the way in, so this is where the
 * rules are pinned — the browser's copy of them is a courtesy.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	BUILD_TAGS,
	isSlug,
	isVisibility,
	MAX_NAME,
	normaliseDraft,
	typeTag,
	validateDraft,
	type DraftBuild
} from '../src/lib/calc/publish.ts';

const draft = (over: Partial<DraftBuild> = {}): DraftBuild => ({
	name: 'Rad-proof runner',
	query: 'a=0r429-10&c=0nok',
	tags: ['combat'],
	visibility: 'public',
	...over
});

test('a complete draft has nothing wrong with it', () => {
	assert.deepEqual(validateDraft(draft()), []);
});

test('every objection is raised at once, not one per attempt', () => {
	const errors = validateDraft({ name: '', query: '', tags: [], visibility: 'sideways' as never });
	assert.deepEqual(errors.sort(), [
		'bad-visibility',
		'name-required',
		'query-required',
		'type-tag-required'
	]);
});

test('a build needs to say what it is for', () => {
	assert.deepEqual(validateDraft(draft({ tags: [] })), ['type-tag-required']);
	assert.deepEqual(validateDraft(draft({ tags: ['open-world'] })), ['type-tag-required']);
	assert.deepEqual(validateDraft(draft({ tags: ['combat', 'open-world'] })), []);
});

test('an invented tag is refused', () => {
	assert.deepEqual(validateDraft(draft({ tags: ['combat', 'best-build-ever'] })), ['unknown-tag']);
});

test('names and builds have a ceiling', () => {
	assert.deepEqual(validateDraft(draft({ name: 'x'.repeat(MAX_NAME + 1) })), ['name-too-long']);
	assert.deepEqual(validateDraft(draft({ query: 'a'.repeat(601) })), ['query-too-long']);
});

test('whitespace is not a name', () => {
	assert.deepEqual(validateDraft(draft({ name: '   ' })), ['name-required']);
});

test('normalising keeps one type tag, deduplicates the rest, and trims', () => {
	const clean = normaliseDraft(
		draft({
			name: '  Spaced out  ',
			tags: ['open-world', 'combat', 'open-world', 'clan-wars']
		})
	);
	assert.equal(clean.name, 'Spaced out');
	assert.equal(clean.tags[0], 'combat', 'the type tag leads, so the card can show it first');
	assert.deepEqual(clean.tags.slice(1).sort(), ['clan-wars', 'open-world']);
});

test('normalising cuts an over-long name rather than refusing it', () => {
	const clean = normaliseDraft(draft({ name: 'y'.repeat(200) }));
	assert.equal(clean.name.length, MAX_NAME);
});

test('a second type tag cannot sneak through normalisation', () => {
	const clean = normaliseDraft(draft({ tags: ['combat', 'speed', 'open-world'] }));
	assert.equal(clean.tags.filter((t) => (BUILD_TAGS.type as readonly string[]).includes(t)).length, 1);
});

test('typeTag finds the one that matters', () => {
	assert.equal(typeTag(['open-world', 'speed']), 'speed');
	assert.equal(typeTag(['open-world']), null);
});

test('visibility is one of two words', () => {
	assert.equal(isVisibility('public'), true);
	assert.equal(isVisibility('private'), true);
	assert.equal(isVisibility('unlisted'), false);
	assert.equal(isVisibility(undefined), false);
});

test('slugs are the shape the server issues, and nothing else', () => {
	assert.equal(isSlug('a1b2c3d4e5'), true);
	assert.equal(isSlug('short'), false, 'five characters would be guessable');
	assert.equal(isSlug('mine'), false, 'so /api/builds/mine cannot be read as a slug');
	assert.equal(isSlug('UPPERCASE1'), false);
	assert.equal(isSlug('has-a-dash1'), false);
	assert.equal(isSlug('x'.repeat(17)), false);
});
