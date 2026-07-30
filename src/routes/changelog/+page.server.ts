import { releases } from '$lib/changelog-data';

/**
 * Prerendered with the rest of the site: the changelog is baked into the image
 * at build time, exactly like the catalogue, and a release only ever changes by
 * way of a deploy.
 */
export function load() {
	return { releases };
}
