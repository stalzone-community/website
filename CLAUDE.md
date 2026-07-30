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
the value from the README rather than guessing.

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

## Dev & tests

- The item database is never committed. `npm run db` (= `db:vendor` +
  `db:build`) rebuilds it from the upstream EXBO repo; CI and the Dockerfile do
  the same before anything else.
- `npm run check` = svelte-check + the service-worker tsconfig.
  `npm test` = unit tests (node:test, `tests/**/*.test.ts`).
- `npm run build` prerenders ~2 300 item pages, so a dead link or a missing
  asset is a build failure, not a runtime one. CI runs the build for that
  reason — run it locally before tagging.
