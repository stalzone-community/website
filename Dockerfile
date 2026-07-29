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
RUN node scripts/vendor-db.ts \
	&& node scripts/build-items.ts

RUN npm run build && npm prune --omit=dev

FROM node:26-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

# Records which upstream commit this image was built from, so the running app
# can report its data version (and CI can gate the next deploy on it).
COPY --from=build /app/src/lib/data/db-source.json ./db-source.json

EXPOSE 8080
CMD ["node", "build/index.js"]
