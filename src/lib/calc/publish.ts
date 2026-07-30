/**
 * What a publishable build is allowed to be.
 *
 * Pure, and deliberately not in `$lib/server`: the browser checks the same
 * rules before offering a Publish button, and the server checks them again
 * because the browser's copy is a courtesy, not a guarantee.
 */

/** Everything a visitor can see of someone else's build. */
export interface PublishedBuild {
	slug: string;
	name: string;
	/** the encoded build, as it appears after `?` in a share link */
	query: string;
	tags: string[];
	visibility: Visibility;
	author: { id: string; name: string };
	votes: number;
	createdAt: number;
	updatedAt: number;
}

export type Visibility = 'public' | 'private';

export const VISIBILITIES: readonly Visibility[] = ['public', 'private'];

export function isVisibility(v: unknown): v is Visibility {
	return typeof v === 'string' && (VISIBILITIES as readonly string[]).includes(v);
}

/**
 * The tags a build can carry, matching how players already sort builds in this
 * community: exactly one of what the build is for, and any number of where.
 */
export const BUILD_TAGS = {
	type: ['combat', 'combined', 'speed'],
	place: ['open-world', 'session-battles', 'clan-wars']
} as const;

export const TAG_LABELS: Readonly<Record<string, string>> = {
	combat: 'Combat',
	combined: 'Combined',
	speed: 'Speed',
	'open-world': 'Open world',
	'session-battles': 'Session battles',
	'clan-wars': 'Clan wars'
};

export const MAX_NAME = 60;
export const MAX_QUERY = 600;

/** A build's one required tag, or null when it has none. */
export function typeTag(tags: string[]): string | null {
	return tags.find((t) => (BUILD_TAGS.type as readonly string[]).includes(t)) ?? null;
}

export interface DraftBuild {
	name: string;
	query: string;
	tags: string[];
	visibility: Visibility;
}

export type ValidationError =
	| 'name-required'
	| 'name-too-long'
	| 'query-required'
	| 'query-too-long'
	| 'type-tag-required'
	| 'unknown-tag'
	| 'bad-visibility';

/**
 * Everything wrong with a draft, in one pass.
 *
 * A list rather than the first failure: the publish dialog shows all of it at
 * once, and a form that reveals its objections one reload at a time is the
 * thing everyone hates about forms.
 */
export function validateDraft(draft: Partial<DraftBuild>): ValidationError[] {
	const errors: ValidationError[] = [];
	const name = (draft.name ?? '').trim();
	const query = (draft.query ?? '').trim();
	const tags = draft.tags ?? [];

	if (!name) errors.push('name-required');
	else if (name.length > MAX_NAME) errors.push('name-too-long');

	if (!query) errors.push('query-required');
	else if (query.length > MAX_QUERY) errors.push('query-too-long');

	if (!typeTag(tags)) errors.push('type-tag-required');

	const known = new Set<string>([...BUILD_TAGS.type, ...BUILD_TAGS.place]);
	if (tags.some((t) => !known.has(t))) errors.push('unknown-tag');

	if (!isVisibility(draft.visibility)) errors.push('bad-visibility');

	return errors;
}

export const ERROR_MESSAGES: Readonly<Record<ValidationError, string>> = {
	'name-required': 'Give the build a name.',
	'name-too-long': `Names are at most ${MAX_NAME} characters.`,
	'query-required': 'The build is empty.',
	'query-too-long': 'That build is too long to publish.',
	'type-tag-required': 'Pick what the build is for.',
	'unknown-tag': 'One of those tags is not a tag.',
	'bad-visibility': 'Choose public or private.'
};

/**
 * Trim a draft to what will be stored.
 *
 * Runs server-side on the way in, so an over-long name is cut rather than
 * rejected outright, and a duplicate tag cannot inflate a document.
 */
export function normaliseDraft(draft: DraftBuild): DraftBuild {
	const known = new Set<string>([...BUILD_TAGS.type, ...BUILD_TAGS.place]);
	const type = typeTag(draft.tags);
	const places = [...new Set(draft.tags)].filter(
		(t) => known.has(t) && (BUILD_TAGS.place as readonly string[]).includes(t)
	);
	return {
		name: draft.name.trim().slice(0, MAX_NAME),
		query: draft.query.trim().slice(0, MAX_QUERY),
		// exactly one type tag, then the places — so the order is meaningful and
		// the first tag is always the one the card leads with
		tags: type ? [type, ...places] : places,
		visibility: draft.visibility
	};
}

/**
 * Slugs are random, not derived from the name.
 *
 * A private build is reachable only by its slug, so a guessable one would make
 * "private" mean "public if you can spell the name". 10 base-36 characters is
 * about 52 bits.
 */
export function isSlug(s: string): boolean {
	return /^[a-z0-9]{6,16}$/.test(s);
}
