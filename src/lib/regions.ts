/**
 * The game's four regions.
 *
 * Hard-coded rather than fetched from `GET /regions`. The list is needed by the
 * browser (the alert opt-in renders a row per region) and by anything that runs
 * before the API has been reached at all, and four values that change roughly
 * never do not justify a round trip on every page. Ids and order match the live
 * response; the names are the API's own, title-cased for display.
 */
export const REGIONS = [
	{ id: 'RU', name: 'Russia' },
	{ id: 'EU', name: 'Europe' },
	{ id: 'NA', name: 'North America' },
	{ id: 'SEA', name: 'South East Asia' }
] as const;

export type RegionId = (typeof REGIONS)[number]['id'];

const IDS: ReadonlySet<string> = new Set(REGIONS.map((r) => r.id));

export function isRegionId(value: unknown): value is RegionId {
	return typeof value === 'string' && IDS.has(value);
}

export function regionName(id: RegionId): string {
	return REGIONS.find((r) => r.id === id)?.name ?? id;
}
