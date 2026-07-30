# STALZONE database — working notes

## Changelog

Every user-visible change must include a `changelog/unreleased/*.md` entry in
the same commit as the change itself (frontmatter: `title`,
`type: feature|improvement|fix|data`, `area: database|market|tools|site`,
optional `impact: major|minor` — minor for tweaks players wouldn't notice
unless told; body written for players, not developers — read
`changelog/unreleased/README.md` before writing one). The vocabulary is
`CHANGELOG_SCHEMA` in `src/lib/changelog.ts`; a `type` or `area` outside those
lists does not fail the build, it silently falls back to the first one, so copy
the value from the README rather than guessing and run
`npm run changelog:check` after writing one (`npm test` runs it too).

One file per change, named after the change (`build-calculator.md`), not after
a version or a date — `npm run release vX.Y.Z` is what moves entries into
`changelog/vX.Y.Z/` and stamps the date.

Purely internal work (refactors, test-only changes, dependency bumps) gets no
entry.

## Release

`npm run release vX.Y.Z` rolls up `changelog/unreleased/`, commits
(pathspec-limited to `changelog/`, so parallel WIP is never swept in), tags and
pushes main + the tag. Uncommitted entries are deliberately left behind —
they belong to unfinished work. The tag is what deploys: `deploy.yml` re-runs
the whole of CI on the tagged commit and only ships the Fly app when it is
green. Pushing to main does not deploy.

## Auction retention — production only, never from a dev machine

**Decided 2026-07-30:** we retain auction responses to build price history. Other STALZONE sites
do it, EXBO's terms do not forbid it, and waiting on an answer that may never come would hold the
feature hostage. `../api-application.txt` still asks the question; if they come back and say no,
the flag goes off and the archive gets purged.

Retention is **not implemented yet**. When it is, it goes behind a flag read from `fly.toml`
`[env]` — the `REPLAY_PRUNE` pattern from UAR, since a feature flag is config rather than a
credential and belongs in a diff, not in `APP_SECRETS` — **on in production, off everywhere
else**. That is not caution about EXBO, it is about the two places a dev machine does damage:

1. **There is no scratch database.** The Atlas user is scoped to the `stalzone` database alone,
   so a dev machine with `MONGODB_URI` set writes into the *same* collection production reads. A
   poller left running locally silently pollutes the real price history, and nothing in the rows
   says which came from a laptop.
2. **It spends the production rate limit.** Polling is per tracked item on a schedule; a second
   poller on a dev machine doubles it against a ceiling EXBO have not told us yet.

For local work on the feature, use a throwaway mongo (`docker run -d --rm -p 27019:27017
mongo:8`) and override `MONGODB_URI` + `MONGODB_DB` in `.env.development.local`, which Vite's
`loadEnv` ranks above `.env`.

## Dev & tests

- The item database is never committed. `npm run db` (= `db:vendor` +
  `db:build`) rebuilds it from the upstream EXBO repo; CI and the Dockerfile do
  the same before anything else.
- `npm run check` = svelte-check + the service-worker tsconfig.
  `npm test` = unit tests (node:test, `tests/**/*.test.ts`).
- `npm run build` prerenders ~2 300 item pages, so a dead link or a missing
  asset is a build failure, not a runtime one. CI runs the build for that
  reason — run it locally before tagging.
