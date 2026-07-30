/**
 * Which items have a 3D model, and which file it is.
 *
 * The manifest is written by `npm run db:models` from a local STALZONE install
 * — see scripts/build-models.ts for why this is the one dataset that cannot be
 * regenerated during the image build, and is therefore committed rather than
 * gitignored like items.json.
 *
 * Keyed by *model*, not by item: 264 weapons resolve to 215 distinct files
 * because variants share geometry — the three AKS-74s are one mesh, and so are
 * the three FN FALs. The manifest maps each item id onto its model's slug, so
 * the same megabyte is served once and cached across all of them.
 *
 * Server-only for consistency with the rest of the catalogue, though nothing
 * here is secret: the tab's loader turns a slug into a public /models URL.
 */
import manifest from '../data/models.json' with { type: 'json' };

interface ModelManifest {
	/** item id -> model slug */
	models: Record<string, string>;
	/** distinct model files on disk */
	count: number;
	/**
	 * Slugs whose diffuse and/or normal map could not be extracted, and which
	 * one — listed as exceptions, so a slug absent here has both. See the tail
	 * of scripts/build-models.ts.
	 */
	missingMaps?: Record<string, ('diff' | 'nrm')[]>;
}

const data = manifest as unknown as ModelManifest;

/** The model slug for an item, or null when nothing was extracted for it. */
export function modelFor(id: string): string | null {
	return data.models[id] ?? null;
}

/**
 * Public URLs for a model and its maps.
 *
 * The textures are named by convention beside the .glb and referenced from
 * inside it, so a browser fetches them itself — these are returned only so the
 * page can preload the diffuse map, which is the largest single file and the
 * one whose absence is most visible.
 *
 * `diff`/`nrm` are null when that map was never extracted, which the manifest
 * records per slug. The convention alone is not enough to assert the file
 * exists: a handful of weapons store their maps under names the extractor does
 * not match, ship as an untextured mesh, and would otherwise have the page
 * preload a URL that 404s — during prerender that is a hard build failure, not
 * a missing image.
 */
export function modelUrls(slug: string): { src: string; diff: string | null; nrm: string | null } {
	const missing = data.missingMaps?.[slug] ?? [];
	return {
		src: `/models/${slug}.glb`,
		diff: missing.includes('diff') ? null : `/models/${slug}_diff.webp`,
		nrm: missing.includes('nrm') ? null : `/models/${slug}_nrm.webp`
	};
}

/** Total distinct models shipped — used by the extraction report, not the UI. */
export const modelCount = data.count;
