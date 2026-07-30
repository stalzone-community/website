# The item database is generated during the image build, not committed.
#
# items.json is ~6.8 MB and EXBO regenerates the upstream data on every game
# patch; committing it would add ~78 MB/yr of churn to git history. Building it
# here instead keeps the repo clean AND makes `fly deploy` self-contained — a
# manual deploy produces correct data without any CI orchestration.

FROM node:26-slim AS build
WORKDIR /app

# git is needed by scripts/vendor-db.ts (shallow clone of the upstream database)
RUN apt-get update \
	&& apt-get install -y --no-install-recommends git ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vendor + normalise. vendor-db.ts is SHA-gated but the vendor/ directory is
# never in the build context (.dockerignore), so this always fetches fresh.
# ~16 s for the clone, ~1 s for the normalise.
#
# `db:build` and not build-items.ts alone: recipes.json and the calculator index
# are generated too, both are gitignored, and recipes.json is a static import in
# src/lib/server/recipes.ts — so a build missing it fails at `npm run build`
# rather than degrading.
RUN node scripts/vendor-db.ts \
	&& npm run db:build

RUN npm run build && npm prune --omit=dev

FROM node:26-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# adapter-node checks the Origin header on every POST and, behind a proxy, has
# no other way to know what it is serving. Unset, it compares against the
# request's own host and returns 403 "cross-site form submission forbidden" —
# so the /feedback form action would fail in production and only there. Set
# here rather than as a Fly secret because it is not one, and because a value
# in the image is a value the next person can find. Same origin push.ts
# defaults to; change both together if the domain ever moves.
ENV ORIGIN=https://stalzone.cedricdessalles.dev

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

# Records which upstream commit this image was built from, so the running app
# can report its data version (and CI can gate the next deploy on it).
COPY --from=build /app/src/lib/data/db-source.json ./db-source.json

EXPOSE 8080
CMD ["node", "build/index.js"]
