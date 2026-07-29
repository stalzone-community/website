// Phase 1 (item database, map, bestiary) is fully static — everything comes from
// the vendored EXBO database at build time. The node server exists for the
// auction/emission features that land once production API access is approved.
export const prerender = true;
