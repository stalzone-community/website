# Changelog entries

One markdown file per user-visible change, committed in the same commit as the
change itself. `npm run release vX.Y.Z` moves the entries here into
`changelog/vX.Y.Z/`, stamps the release date, commits (changelog/ only), tags
and pushes. The site renders everything at `/changelog`, and the latest release
heads the rail on the overview page.

Format — all frontmatter fields required except `impact`, body written for
players, not developers:

```markdown
---
title: Short player-facing headline
type: feature
area: database
---
One or two sentences on what changed and why a player cares. Markdown subset:
paragraphs, "- " lists, **bold**, `code`, [links](/items) (absolute paths or
https only).
```

- `type`: `feature` (new), `improvement` (existing thing got better),
  `fix` (something wrong is now right), `data` (game-data refresh/expansion).
- `area`:
  - `database` — items, entities, the tech tree, crafting: everything built
    from the vendored EXBO database.
  - `market` — the auction tracker and emissions, i.e. anything live from the
    API.
  - `tools` — the build calculator, search, the command palette.
  - `site` — chrome, theme, languages, performance.
- `impact` (optional): `major` = flagship, players shouldn't miss it (rare — at
  most one or two per release); `minor` = players wouldn't notice unless told —
  kept off the overview widget, listed as a compact "Also:" line on
  /changelog. Omit for everything in between.

A title may be quoted or not — `title: 'Fixed: the thing'` and
`title: Fixed: the thing` both read as the same headline. Quote it if it
contains a `"`, and use single quotes when you do.

The vocabulary above is `CHANGELOG_SCHEMA` in `src/lib/changelog.ts`; the
parser is `sveltekit-commons/changelog`, shared with the UAR site. An entry
naming a `type` or `area` that is not on those lists does not fail the build —
it falls back to the first one — so `npm run changelog:check` is what keeps the
lists honest. `npm test` runs it too, so CI will not let a misfiled entry
through, but run it yourself after writing one.
